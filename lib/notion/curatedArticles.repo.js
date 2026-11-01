import { notion } from './client';
import { notionEnv } from '@/lib/env/notion';
import { normalizeNotionDatabaseId } from '@/lib/notion/notionIds';
import {
  curatedEditorialFromPage,
  externalDestinationUrl,
  formatCuratedResourcePage,
  isPublishedCuratedRecord,
  publishedFilterForProperties,
  sortsForProperties,
} from '@/lib/curated/resources';
import { isJournalImageKey } from '@/lib/notion/journalImage';

const schemaByDbId = new Map();

function databaseId() {
  const raw = notionEnv.NOTION_CURATED_ARTICLES_DB_ID;
  if (!raw) return '';
  return normalizeNotionDatabaseId(raw) || raw;
}

function notionCode(err) {
  return String(err?.code || err?.body?.code || '');
}

function samePlan(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function queryPlans(properties) {
  const filter = publishedFilterForProperties(properties);
  const sorts = sortsForProperties(properties);
  const plans = [{ filter, sorts }];
  const property = filter.property || 'Status';
  if (filter.select) {
    plans.push({
      filter: { property, status: { equals: filter.select.equals || 'Published' } },
      sorts,
    });
  } else if (filter.status) {
    plans.push({
      filter: { property, select: { equals: filter.status.equals || 'Published' } },
      sorts,
    });
  }
  const createdSort = [{ timestamp: 'created_time', direction: 'descending' }];
  if (!samePlan(sorts, createdSort)) {
    plans.push({ filter, sorts: createdSort });
  }
  return plans.filter((plan, index) => plans.findIndex((other) => samePlan(other, plan)) === index);
}

async function loadSchema(dbId) {
  if (schemaByDbId.has(dbId)) return schemaByDbId.get(dbId);
  if (typeof notion?.databases?.retrieve !== 'function') return null;
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const properties = db?.properties || null;
    if (properties) schemaByDbId.set(dbId, properties);
    return properties;
  } catch (err) {
    if (notionCode(err) === 'object_not_found') throw err;
    return null;
  }
}

async function queryPlan(dbId, plan, limit) {
  const baseQuery = {
    database_id: dbId,
    filter: plan.filter,
    sorts: plan.sorts,
  };

  if (limit && limit <= 100) {
    const res = await notion.databases.query({
      ...baseQuery,
      page_size: Math.min(limit, 100),
    });
    return res.results ?? [];
  }

  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      ...baseQuery,
      ...(cursor ? { start_cursor: cursor } : {}),
      page_size: 100,
    });
    pages.push(...(res.results ?? []));
    if (limit && pages.length >= limit) return pages.slice(0, limit);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  return pages;
}

/**
 * Published curated resources. A missing database id is an empty list.
 * Pass throwOnError so an API or schema failure is not treated as an empty directory.
 */
export async function getCuratedArticles(options = {}) {
  if (!notion) return [];
  const dbId = databaseId();
  if (!dbId) return [];

  const { limit, throwOnError = false } = options;

  try {
    const properties = await loadSchema(dbId);
    const plans = queryPlans(properties);
    let lastError;
    for (let index = 0; index < plans.length; index += 1) {
      try {
        const pages = await queryPlan(dbId, plans[index], limit);
        return pages
          .map(formatCuratedResourcePage)
          .filter((record) => isPublishedCuratedRecord(record) && externalDestinationUrl(record.url));
      } catch (err) {
        lastError = err;
        const retry = notionCode(err) === 'validation_error' && index < plans.length - 1;
        if (!retry) break;
      }
    }
    throw lastError;
  } catch (err) {
    if (throwOnError) throw err;
    if (process.env.NODE_ENV === 'development') {
      console.error('[getCuratedArticles]', err);
    }
    return [];
  }
}

/** One published curated page, used to refresh an expiring Notion image URL. */
export async function getCuratedResourcePage(pageId) {
  if (!notion || !isJournalImageKey(pageId)) return null;
  const expected = databaseId();
  if (!expected) return null;
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const parentId = page?.parent?.database_id;
    if (!parentId) return null;
    const parent = normalizeNotionDatabaseId(parentId) || parentId;
    const configured = normalizeNotionDatabaseId(expected) || expected;
    if (parent !== configured) return null;
    const resource = formatCuratedResourcePage(page);
    if (!isPublishedCuratedRecord(resource)) return null;
    return { resource, editorial: curatedEditorialFromPage(page) };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[getCuratedResourcePage]', err);
    return null;
  }
}

export function clearCuratedArticlesCacheForTests() {
  schemaByDbId.clear();
}
