import { notion } from './client';
import { paginate } from './paginate';
import { notionEnv } from '@/lib/env/notion';

const publishedFilterByDbId = new Map();

function fallbackPublishedFilter() {
  return { property: 'Status', select: { equals: 'Published' } };
}

/**
 * Uses the real DB schema so we filter with `select` or `status` correctly.
 * Cached per database id for the lifetime of the server process.
 */
async function resolvePublishedFilter(dbId) {
  if (!notion || !dbId) return fallbackPublishedFilter();
  if (publishedFilterByDbId.has(dbId)) {
    return publishedFilterByDbId.get(dbId);
  }
  const promise = (async () => {
    try {
      const db = await notion.databases.retrieve({ database_id: dbId });
      const statusProp = db.properties?.Status;
      if (statusProp?.type === 'status') {
        return { property: 'Status', status: { equals: 'Published' } };
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[journal] Could not read database schema; using select filter for Status', err);
      }
    }
    return fallbackPublishedFilter();
  })();
  publishedFilterByDbId.set(dbId, promise);
  return promise;
}

function notionErrToMessage(err) {
  const body = err?.body;
  if (body && typeof body === 'object') {
    const msg = body.message || body.code;
    if (msg) return String(msg);
  }
  if (err?.message) return String(err.message);
  return 'Notion request failed';
}

function getJournalDbId() {
  const id = notionEnv.NOTION_JOURNAL_DB_ID;
  if (!id) return null;
  const clean = id.replace(/-/g, '');
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

function slugify(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

function getPropertyValue(property, type) {
  if (!property || !property[type]) return null;
  switch (type) {
    case 'title':
      return property.title?.[0]?.plain_text ?? '';
    case 'date':
      return property.date?.start ?? null;
    case 'url':
      return property.url ?? null;
    case 'multi_select':
      return property.multi_select?.map((x) => x.name) ?? [];
    case 'select':
      return property.select?.name ?? null;
    default:
      return null;
  }
}

function getPropertyByType(properties, type) {
  if (!properties || typeof properties !== 'object') return null;
  for (const key of Object.keys(properties)) {
    const prop = properties[key];
    if (prop?.type === type) return prop;
  }
  return null;
}

function toCalendarDateOnly(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function collectTags(p) {
  const multi =
    getPropertyValue(p.Tags, 'multi_select') ||
    getPropertyValue(p.Tag, 'multi_select');
  if (multi?.length) return multi;
  const single =
    getPropertyValue(p.Tags, 'select') || getPropertyValue(p.Tag, 'select');
  return single ? [single] : [];
}

function formatJournal(page) {
  const p = page.properties;
  const title = getPropertyValue(p.Title || p.Name, 'title');
  const dateProp = getPropertyByType(p, 'date') || p.Date || p.date;
  const dateValue = dateProp ? getPropertyValue(dateProp, 'date') : null;
  const dateOnly = toCalendarDateOnly(dateValue);
  const fallbackDate = toCalendarDateOnly(page.created_time);
  return {
    id: page.id,
    title,
    slug: slugify(title),
    date: dateOnly ?? fallbackDate ?? dateValue,
    tags: collectTags(p),
    discordChannelLink: getPropertyValue(p['Discord Channel Link'], 'url'),
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

/**
 * First page of the journal with explicit configuration/error metadata (for the index page).
 * Does not throw; safe for caching.
 */
export async function fetchJournalFirstPage(pageSize = 15) {
  if (!notion || !notionEnv.NOTION_API_KEY) {
    return { configured: false, items: [], apiError: null };
  }
  const dbId = getJournalDbId();
  if (!dbId) {
    return { configured: false, items: [], apiError: null };
  }
  try {
    const filter = await resolvePublishedFilter(dbId);
    const res = await notion.databases.query({
      database_id: dbId,
      filter,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: Math.min(pageSize, 100),
    });
    return {
      configured: true,
      items: (res.results ?? []).map(formatJournal),
      apiError: null,
    };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[fetchJournalFirstPage]', err);
    return {
      configured: true,
      items: [],
      apiError: notionErrToMessage(err),
    };
  }
}

/**
 * Fetch journal entries (Status = Published only). Returns [] if DB/key missing or on error.
 */
export async function getJournalEntries(options = {}) {
  if (!notion) return [];

  const dbId = getJournalDbId();
  if (!dbId) return [];

  try {
    const filter = await resolvePublishedFilter(dbId);
    const { limit, cursor, pageSize = 100 } = options;
    const baseQuery = {
      database_id: dbId,
      filter,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    };

    if (cursor) {
      const res = await notion.databases.query({
        ...baseQuery,
        start_cursor: cursor,
        page_size: Math.min(pageSize, 100),
      });
      return {
        items: (res.results ?? []).map(formatJournal),
        hasMore: !!res.has_more,
        nextCursor: res.next_cursor ?? null,
      };
    }

    if (pageSize && pageSize !== 100 && limit == null) {
      const res = await notion.databases.query({
        ...baseQuery,
        page_size: Math.min(pageSize, 100),
      });
      return {
        items: (res.results ?? []).map(formatJournal),
        hasMore: !!res.has_more,
        nextCursor: res.next_cursor ?? null,
      };
    }

    if (limit && limit <= 100) {
      const res = await notion.databases.query({
        ...baseQuery,
        page_size: Math.min(limit, 100),
      });
      return (res.results ?? []).map(formatJournal);
    }

    if (limit) {
      const pages = await paginate(
        (c) =>
          notion.databases.query({
            ...baseQuery,
            start_cursor: c,
            page_size: 100,
          }),
        { limit },
      );
      return pages.map(formatJournal);
    }

    const pages = await paginate((c) =>
      notion.databases.query({
        ...baseQuery,
        start_cursor: c,
        page_size: 100,
      }),
    );
    return pages.map(formatJournal);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[getJournalEntries]', err);
    return [];
  }
}
