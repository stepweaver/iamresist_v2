import { notion } from './client';
import { formatJournalPage } from './journalFields';
import { paginate } from './paginate';
import { notionEnv } from '@/lib/env/notion';

/**
 * Verified published-status filters only.
 * A schema miss or a guessed select/status filter is never stored here.
 * A filter enters the map after the database schema names the property type,
 * or after Notion accepts that filter when the schema could not be read.
 */
const verifiedFilterByDbId = new Map();

function notionCode(err) {
  return String(err?.code || err?.body?.code || '');
}

function publishedFilter(type) {
  if (type === 'status') return { property: 'Status', status: { equals: 'Published' } };
  if (type === 'select') return { property: 'Status', select: { equals: 'Published' } };
  return null;
}

function isFilterMismatch(err) {
  return notionCode(err) === 'validation_error';
}

/**
 * Production diagnostics without credentials, page bodies, or signed file URLs.
 */
export function sanitizeJournalDiagnostic(err) {
  const code = notionCode(err) || 'unknown';
  const statusNumber = Number(err?.status || err?.body?.status || 0);
  const raw = String(err?.body?.message || err?.message || 'Notion request failed');
  const message = raw
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b(?:secret|ntn|bearer)_[A-Za-z0-9]+/gi, '[secret]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [secret]')
    .replace(/X-Amz-[A-Za-z0-9-]+=[^&\s]+/gi, '[signature]')
    .slice(0, 300);
  return {
    code,
    status: statusNumber > 0 ? statusNumber : undefined,
    message,
  };
}

export function journalRequestError(err, scope) {
  const diagnostic = sanitizeJournalDiagnostic(err);
  console.warn(`[journal] ${scope} failed`, diagnostic.code, diagnostic.status || '', diagnostic.message);
  const wrapped = new Error(diagnostic.message);
  wrapped.code = diagnostic.code;
  wrapped.status = diagnostic.status;
  wrapped.scope = scope;
  return wrapped;
}

export function clearJournalPublishedFilterForTests() {
  verifiedFilterByDbId.clear();
}

function getJournalDbId() {
  const id = notionEnv.NOTION_JOURNAL_DB_ID;
  if (!id) return null;
  const clean = id.replace(/-/g, '');
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

export function isJournalConfigured() {
  return Boolean(notion && notionEnv.NOTION_API_KEY && getJournalDbId());
}

async function readStatusPropertyType(dbId) {
  if (typeof notion?.databases?.retrieve !== 'function') return { kind: 'unavailable' };
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const type = db?.properties?.Status?.type;
    if (type === 'status' || type === 'select') return { kind: 'verified', type };
    if (!type) return { kind: 'missing' };
    return { kind: 'unexpected', type };
  } catch (err) {
    if (notionCode(err) === 'object_not_found' || notionCode(err) === 'unauthorized' || notionCode(err) === 'restricted_resource') {
      throw err;
    }
    return { kind: 'unavailable' };
  }
}

async function runVerifiedFilter(dbId, filter, run) {
  try {
    return await run(filter);
  } catch (err) {
    if (isFilterMismatch(err)) verifiedFilterByDbId.delete(dbId);
    throw err;
  }
}

/**
 * Resolves the published filter from the live schema.
 * Transient schema failures are not cached. A select filter is not assumed for
 * a Notion status property, and a status filter is not assumed for a select.
 */
async function withPublishedFilter(dbId, run) {
  const verified = verifiedFilterByDbId.get(dbId);
  if (verified) return runVerifiedFilter(dbId, verified, run);

  const schema = await readStatusPropertyType(dbId);
  if (schema.kind === 'verified') {
    const filter = publishedFilter(schema.type);
    verifiedFilterByDbId.set(dbId, filter);
    return runVerifiedFilter(dbId, filter, run);
  }
  if (schema.kind === 'missing' || schema.kind === 'unexpected') {
    const err = new Error('Journal Status property cannot be filtered as published');
    err.code = 'validation_error';
    err.reason = schema.kind === 'missing' ? 'missing_status' : 'unexpected_status_type';
    throw err;
  }

  let lastError;
  for (const type of ['status', 'select']) {
    const filter = publishedFilter(type);
    try {
      const result = await run(filter);
      verifiedFilterByDbId.set(dbId, filter);
      return result;
    } catch (err) {
      lastError = err;
      if (!isFilterMismatch(err)) throw err;
    }
  }
  throw lastError;
}

async function queryPublishedPages(dbId, filter, options = {}) {
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
      items: (res.results ?? []).map(formatJournalPage),
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
      items: (res.results ?? []).map(formatJournalPage),
      hasMore: !!res.has_more,
      nextCursor: res.next_cursor ?? null,
    };
  }

  if (limit && limit <= 100) {
    const res = await notion.databases.query({
      ...baseQuery,
      page_size: Math.min(limit, 100),
    });
    return (res.results ?? []).map(formatJournalPage);
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
    return pages.map(formatJournalPage);
  }

  const pages = await paginate((c) =>
    notion.databases.query({
      ...baseQuery,
      start_cursor: c,
      page_size: 100,
    }),
  );
  return pages.map(formatJournalPage);
}

/**
 * First page of the journal with explicit configuration/error metadata.
 * An API failure is apiError, not an empty published list.
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
    const page = await withPublishedFilter(dbId, (filter) =>
      queryPublishedPages(dbId, filter, { pageSize: Math.min(pageSize, 100) }),
    );
    return {
      configured: true,
      items: page.items ?? [],
      apiError: null,
    };
  } catch (err) {
    const diagnostic = sanitizeJournalDiagnostic(err);
    console.warn('[journal] first page failed', diagnostic.code, diagnostic.status || '', diagnostic.message);
    return {
      configured: true,
      items: [],
      apiError: diagnostic.message,
    };
  }
}

/**
 * Published journal entries.
 * Missing configuration is an empty list.
 * throwOnError surfaces an API or schema failure instead of pretending the
 * database has no published essays. Sitemap callers keep the empty fallback.
 */
export async function getJournalEntries(options = {}) {
  if (!notion) return [];

  const dbId = getJournalDbId();
  if (!dbId) return [];

  try {
    return await withPublishedFilter(dbId, (filter) => queryPublishedPages(dbId, filter, options));
  } catch (err) {
    const wrapped = journalRequestError(err, 'list');
    if (options.throwOnError) throw wrapped;
    return [];
  }
}

/**
 * One Notion page, including cover and file properties.
 * object_not_found is a real miss. Other failures throw when requested so a
 * timeout is not cached as a page with no image.
 */
export async function getJournalPage(pageId, { throwOnError = false } = {}) {
  if (!notion || !pageId) return null;
  try {
    return await notion.pages.retrieve({ page_id: pageId });
  } catch (err) {
    if (notionCode(err) === 'object_not_found') return null;
    const wrapped = journalRequestError(err, 'page');
    if (throwOnError) throw wrapped;
    return null;
  }
}
