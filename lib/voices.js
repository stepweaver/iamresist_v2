import 'server-only';
import { unstable_cache } from 'next/cache';
import pLimit from 'p-limit';
import { getAllVoices } from '@/lib/notion/voices.repo';
import { fetchFeedItems } from '@/lib/feeds/rss';
import { getYoutubeVideoId } from '@/lib/utils/youtube';

const CONCURRENCY = 4;
const REVALIDATE = 300;

/** Homepage pool — aligned with source `voicesFeed.service.js` */
const ITEMS_PER_VOICE_HOME = 5;
const MAX_PER_VOICE_HOME = 3;
const HOMEPAGE_MAX_VOICE_ITEMS = 18;
/** Fetch cap (Notion returns voices sorted by title; higher = more creators in rotation). */
const VOICES_TO_FETCH_HOME = 30;

/** Archive / full intel page — aligned with source `voicesArchive.service.js` */
const GLOBAL_VOICES_LIMIT = 20;
const GLOBAL_PER_VOICE_LIMIT = 20;
const GLOBAL_MAX_ITEMS = 600;

function toFeedItem(item, voice) {
  return {
    id: item.id || `${voice.slug}-${item.url}`,
    title: item.title,
    url: item.url,
    sourceId: item.sourceId ?? null,
    publishedAt: item.publishedAt,
    description: item.description || '',
    image: item.image ?? null,
    voice: {
      id: voice.id,
      title: voice.title,
      slug: voice.slug,
      homeUrl: voice.homeUrl,
      platform: voice.platform,
    },
    sourceType: 'voices',
  };
}

function normalizeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const url = new URL(u);
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

/** Prefer YouTube ID when present (same video in multiple feeds). */
function dedupeByYoutubeOrUrl(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const ytId = getYoutubeVideoId(it.url, it.sourceId);
    const key = ytId ? `yt:${ytId}` : it.url ? `url:${normalizeUrl(it.url)}` : it.id || null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function sortByPublishedDesc(items) {
  return [...items].sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  );
}

/** Cap how many items each voice contributes before global merge (source pattern). */
function capItemsPerVoice(items, maxPerVoice) {
  const byVoice = new Map();
  for (const it of items) {
    const voiceId = it.voice?.id || it.voice?.slug || 'unknown';
    const list = byVoice.get(voiceId) || [];
    list.push(it);
    list.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    byVoice.set(voiceId, list.slice(0, maxPerVoice));
  }
  return Array.from(byVoice.values()).flat();
}

/** Homepage: at most one slot per voice in display order (source `homepageIntel.service.js`). */
function limitOnePerCreator(items, limit) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const key = it.voice?.slug || it.voice?.id || 'unknown';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fair display order: round-robin across voices so one channel cannot own the top of the list.
 * Within each round, items are ordered by publish date (newest first in the round).
 */
function interleaveAcrossVoices(items) {
  const byVoice = new Map();
  for (const it of items) {
    const id = it.voice?.id || it.voice?.slug || 'unknown';
    if (!byVoice.has(id)) byVoice.set(id, []);
    byVoice.get(id).push(it);
  }
  const keys = sortedVoiceKeys(byVoice);
  for (const k of keys) {
    const arr = byVoice.get(k);
    arr.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }
  const out = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    const batch = [];
    for (const k of keys) {
      const arr = byVoice.get(k);
      if (arr.length > round) {
        batch.push(arr[round]);
        added = true;
      }
    }
    batch.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    out.push(...batch);
    round++;
  }
  return out;
}

function sortedVoiceKeys(byVoice) {
  return Array.from(byVoice.keys()).sort((a, b) => String(a).localeCompare(String(b)));
}

async function fetchVoicesItems(voices, perVoiceLimit) {
  const limiter = pLimit(CONCURRENCY);
  const results = await Promise.allSettled(
    voices.map((voice) =>
      limiter(async () => {
        const items = await fetchFeedItems(voice.feedUrl, { limit: perVoiceLimit });
        return (items || []).map((item) => toFeedItem(item, voice));
      })
    )
  );
  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .filter(Boolean);
}

async function buildHomepageVoicesPool() {
  const voices = await getAllVoices({ limit: 80 });
  const voicesToFetch = voices.slice(0, VOICES_TO_FETCH_HOME);
  if (!voicesToFetch.length) return [];

  const allItems = await fetchVoicesItems(voicesToFetch, ITEMS_PER_VOICE_HOME);
  const capped = capItemsPerVoice(allItems, MAX_PER_VOICE_HOME);
  const deduped = dedupeByYoutubeOrUrl(capped);
  const sorted = sortByPublishedDesc(deduped);
  return sorted.slice(0, HOMEPAGE_MAX_VOICE_ITEMS);
}

async function buildArchiveVoicesFeed() {
  const allVoices = await getAllVoices({ limit: GLOBAL_VOICES_LIMIT });
  const voices = allVoices.slice(0, GLOBAL_VOICES_LIMIT);
  if (!voices.length) return [];

  const merged = await fetchVoicesItems(voices, GLOBAL_PER_VOICE_LIMIT);
  const deduped = dedupeByYoutubeOrUrl(merged);
  const sorted = sortByPublishedDesc(deduped);
  const slice = sorted.slice(0, GLOBAL_MAX_ITEMS);
  return interleaveAcrossVoices(slice);
}

function cacheKey(name) {
  return ['voices-feed', name];
}

export async function getHomepageVoicesFeed(limit = 8) {
  const pool = await unstable_cache(buildHomepageVoicesPool, cacheKey('homepage-pool-v2'), {
    revalidate: REVALIDATE,
    tags: ['voices-feed', 'voices-homepage-feed'],
  })();
  const sorted = sortByPublishedDesc(pool);
  return limitOnePerCreator(sorted, limit);
}

export async function getVoicesFeed() {
  return unstable_cache(buildArchiveVoicesFeed, cacheKey('archive-interleave-v2'), {
    revalidate: REVALIDATE,
    tags: ['voices-feed'],
  })();
}

export async function getVoicesPage(page = 1, limit = 20) {
  const all = await getVoicesFeed();
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    items: all.slice(start, end),
    hasMore: end < all.length,
    total: all.length,
  };
}

export async function getRecentVoices(count = 6) {
  return getHomepageVoicesFeed(count);
}
