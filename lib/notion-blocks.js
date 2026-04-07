import 'server-only';
import { unstable_cache } from 'next/cache';
import { notion } from '@/lib/notion/client';

export async function getPageBlocks(pageId, maxPages = 5) {
  if (!pageId || !notion) return [];
  try {
    const blocks = [];
    let cursor = undefined;
    let pageCount = 0;
    while (pageCount < maxPages) {
      const response = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        ...(cursor && { start_cursor: cursor }),
      });
      const results = response.results ?? [];
      blocks.push(...results);
      if (!response.has_more || !response.next_cursor) break;
      cursor = response.next_cursor;
      pageCount += 1;
    }
    return blocks;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[getPageBlocks]', pageId, err);
      if (process.env.JOURNAL_VERBOSE === '1') {
        const body = err?.body;
        console.warn(
          '[getPageBlocks] detail',
          typeof body === 'object' ? JSON.stringify(body) : body,
        );
      }
    }
    return [];
  }
}

export function getCachedPageBlocks(pageId, maxPages = 5) {
  return unstable_cache(
    () => getPageBlocks(pageId, maxPages),
    ['notion-page-blocks', pageId],
    { revalidate: 300 },
  )();
}
