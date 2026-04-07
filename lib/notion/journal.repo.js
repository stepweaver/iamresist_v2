import { notion } from './client';
import { paginate } from './paginate';
import { notionEnv } from '@/lib/env/notion';

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
    tags: getPropertyValue(p.Tags, 'multi_select') || [],
    discordChannelLink: getPropertyValue(p['Discord Channel Link'], 'url'),
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

/**
 * Fetch journal entries (Status = Published only). Returns [] if DB/key missing or on error.
 */
export async function getJournalEntries(options = {}) {
  if (!notion) return [];

  const dbId = getJournalDbId();
  if (!dbId) return [];

  try {
    const { limit, cursor, pageSize = 100 } = options;
    const baseQuery = {
      database_id: dbId,
      filter: {
        property: 'Status',
        select: { equals: 'Published' },
      },
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
