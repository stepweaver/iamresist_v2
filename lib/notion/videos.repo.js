// Curated Videos DB (NOTION_CURATED_VIDEOS_DB_ID) — parity with source iamresist.
import 'server-only';

import { notion } from '@/lib/notion/client';
import { paginate } from '@/lib/notion/paginate';
import { notionEnv } from '@/lib/env/notion';
import { normalizeNotionDatabaseId } from '@/lib/notion/notionIds';

function getCuratedVideosDbId() {
  const id = notionEnv.NOTION_CURATED_VIDEOS_DB_ID;
  if (!id) return null;
  return normalizeNotionDatabaseId(id);
}

function getPropertyValue(property, type) {
  if (!property || !property[type]) return null;
  switch (type) {
    case 'title':
      return property.title?.[0]?.plain_text ?? '';
    case 'url':
      return property.url ?? null;
    case 'date':
      return property.date?.start ?? null;
    case 'select':
      return property.select?.name ?? null;
    default:
      return null;
  }
}

function formatVideo(page) {
  const p = page.properties;
  const dateProp = p['Date Added'] || p['Created Time'] || p['date'];
  return {
    id: page.id,
    title: getPropertyValue(p.Title || p.Name, 'title'),
    url: getPropertyValue(p.URL, 'url'),
    platform: getPropertyValue(p.Platform, 'select'),
    dateAdded: getPropertyValue(dateProp, 'date'),
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

/**
 * Fetch curated videos from Notion. Returns [] if DB id missing, no API key, or error.
 */
export async function getVideos(options = {}) {
  if (!notion) return [];
  const dbId = getCuratedVideosDbId();
  if (!dbId) return [];

  try {
    const { limit } = options;
    const baseQuery = {
      database_id: dbId,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    };

    if (limit && limit <= 100) {
      const res = await notion.databases.query({
        ...baseQuery,
        page_size: Math.min(limit, 100),
      });
      return (res.results ?? []).map(formatVideo);
    }

    if (limit) {
      const pages = await paginate(
        (cursor) =>
          notion.databases.query({
            ...baseQuery,
            start_cursor: cursor,
            page_size: 100,
          }),
        { limit }
      );
      return pages.map(formatVideo);
    }

    const pages = await paginate((cursor) =>
      notion.databases.query({
        ...baseQuery,
        start_cursor: cursor,
        page_size: 100,
      })
    );
    return pages.map(formatVideo);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('[getVideos]', err);
    return [];
  }
}
