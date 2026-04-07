import 'server-only';
import { unstable_cache } from 'next/cache';
import pLimit from 'p-limit';
import { getAllVoices } from '@/lib/notion/voices.repo';
import { fetchFeedItems } from '@/lib/feeds/rss';

const CONCURRENCY = 4;
const REVALIDATE = 300;

function toFeedItem(item, voice) {
  return {
    id: item.id || `${voice.slug}-${item.url}`,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    description: item.description || '',
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

function dedupeItems(items) {
  const byUrl = new Map();
  for (const it of items) {
    const key = normalizeUrl(it.url);
    if (!key) continue;
    if (!byUrl.has(key)) {
      byUrl.set(key, it);
    } else {
      const existing = byUrl.get(key);
      if (new Date(it.publishedAt || 0) > new Date(existing.publishedAt || 0)) {
        byUrl.set(key, it);
      }
    }
  }
  return Array.from(byUrl.values());
}

async function buildVoicesFeed(limitPerVoice = 5, maxVoices = 15) {
  const voices = await getAllVoices({ limit: maxVoices });
  if (!voices.length) return [];

  const limiter = pLimit(CONCURRENCY);

  const results = await Promise.allSettled(
    voices.map((voice) =>
      limiter(async () => {
        const items = await fetchFeedItems(voice.feedUrl, { limit: limitPerVoice });
        return (items || []).map((item) => toFeedItem(item, voice));
      })
    )
  );

  const merged = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .filter(Boolean);

  const deduped = dedupeItems(merged);
  deduped.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  return deduped;
}

function cacheKey(additional = '') {
  return ['voices-feed-v1', additional];
}

export async function getVoicesFeed() {
  return unstable_cache(buildVoicesFeed, cacheKey('feed'), {
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
  const all = await getVoicesFeed();
  return all.slice(0, count);
}
