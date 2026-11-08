import 'server-only';
import { unstable_cache } from 'next/cache';
import { notion } from '@/lib/notion/client';
import { journalRequestError } from '@/lib/notion/journal.repo';
import { createFailureCooldown, isUpstreamFailure, upstreamFailure } from '@/lib/feeds/upstreamResult';
import { assertUpstreamAvailable, noteUpstreamFailure } from '@/lib/feeds/sharedFailureBackoff';

const BLOCK_REVALIDATE_SECONDS = 300;
const blockCooldowns = new Map();

function cooldownFor(pageId) {
  const key = String(pageId);
  let cooldown = blockCooldowns.get(key);
  if (!cooldown) {
    cooldown = createFailureCooldown();
    blockCooldowns.set(key, cooldown);
  }
  return cooldown;
}

export function clearNotionBlockCacheStateForTests() {
  blockCooldowns.clear();
}

export async function getPageBlocks(pageId, maxPages = 5, { throwOnError = false } = {}) {
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
    const wrapped = journalRequestError(err, 'blocks');
    if (throwOnError) throw wrapped;
    return [];
  }
}

async function loadPageBlocks(pageId, maxPages) {
  const key = `notion-blocks:${pageId}`;
  const cooldown = cooldownFor(pageId);
  await assertUpstreamAvailable(cooldown, key);
  try {
    const blocks = await getPageBlocks(pageId, maxPages, { throwOnError: true });
    cooldown.clear();
    return blocks;
  } catch (err) {
    if (isUpstreamFailure(err)) throw err;
    await noteUpstreamFailure(cooldown, key, { tags: ['journal', 'notion-blocks'] });
    throw upstreamFailure('notion-blocks');
  }
}

/**
 * Cached block read. A thrown failure is not stored.
 * Callers that still need an array use getCachedPageBlocks, which converts
 * that failure to [] outside the cache.
 */
export function loadCachedPageBlocks(pageId, maxPages = 5) {
  if (!pageId) return Promise.resolve([]);
  return unstable_cache(
    () => loadPageBlocks(pageId, maxPages),
    ['notion-page-blocks-v2', String(pageId), String(maxPages)],
    { revalidate: BLOCK_REVALIDATE_SECONDS, tags: ['journal', 'notion-blocks'] },
  )();
}

export function getCachedPageBlocks(pageId, maxPages = 5) {
  return loadCachedPageBlocks(pageId, maxPages).catch((err) => {
    if (isUpstreamFailure(err)) return [];
    throw err;
  });
}
