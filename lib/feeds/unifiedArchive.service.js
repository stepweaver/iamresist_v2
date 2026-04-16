// Unified Intel archive: RSS voices + Notion curated videos + Notion protest music (source parity).
import { unstable_cache } from 'next/cache';
import { getVoicesFeed, getVoicesFeedBySlug } from '@/lib/voices';
import { getVideos } from '@/lib/notion/videos.repo';
import { getAllProtestSongs } from '@/lib/notion/protestMusic.repo';
import { getCachedDescription, EDITORIAL_SIGNATURE } from '@/lib/videoContent';
import { slugify } from '@/lib/utils/slugify';

const REVALIDATE = 120;
const ARCHIVE_PAGE_SIZE = 20;
const NOTION_FETCH_LIMIT = 50;

const BOOST_MS = 24 * 60 * 60 * 1000; // 24h curated boost

const CURATED_VOICE = {
  id: 'curated-videos',
  title: 'Curated Videos',
  slug: 'curated-videos',
  homeUrl: null,
  platform: 'YouTube',
};

export function sortWithCurated24hBoost(items) {
  const now = Date.now();
  const boosted = [];
  const rest = [];
  for (const it of items) {
    if (it.isCurated && it.createdTime) {
      const created = new Date(it.createdTime).getTime();
      if (now - created <= BOOST_MS) boosted.push(it);
      else rest.push(it);
    } else rest.push(it);
  }
  boosted.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  rest.sort(
    (a, b) =>
      new Date(b.publishedAt || b.createdTime || 0).getTime() -
      new Date(a.publishedAt || a.createdTime || 0).getTime()
  );
  return [...boosted, ...rest];
}

function songToFeedItem(song) {
  if (!song?.url) return null;
  return {
    id: song.id,
    sourceId: song.id,
    title: song.title,
    url: song.url,
    publishedAt: song.createdTime ?? null,
    sourceType: 'protest-music',
    isProtestMusic: true,
    songSlug: song.songSlug || slugify(song.title),
    description: '',
    voice: {
      id: song.id,
      title: song.artist,
      slug: song.slug,
      homeUrl: song.artistChannelUrl ?? null,
      platform: 'YouTube',
    },
  };
}

function curatedVideoToFeedItem(video) {
  if (!video?.url) return null;
  const publishedAt = video.dateAdded || video.createdTime || null;
  return {
    id: `curated-${video.id}`,
    sourceId: video.id,
    title: video.title,
    url: video.url,
    publishedAt,
    createdTime: video.createdTime ?? null,
    sourceType: 'curated-videos',
    voice: { ...CURATED_VOICE, platform: video.platform || 'YouTube' },
    description: '',
    slug: slugify(video.title),
    isCurated: true,
  };
}

function normalizeFilters(filters = {}) {
  return {
    sourceType: filters.sourceType ?? '',
    voiceSlug: filters.voiceSlug ?? '',
    artistSlug: filters.artistSlug ?? '',
  };
}

export function normalizeArchiveUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const url = new URL(u);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return url.href.replace(/\/$/, '');
  } catch {
    return u.trim().toLowerCase();
  }
}

/** Same URL may appear as voice + curated + music; prefer curated, then music, then voices. */
const SOURCE_RANK = { 'curated-videos': 0, 'protest-music': 1, voices: 2 };

export function dedupeUnifiedArchiveItems(items) {
  const byUrl = new Map();
  for (const it of items) {
    const key = normalizeArchiveUrl(it.url);
    if (!key) continue;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, it);
      continue;
    }
    const rNew = SOURCE_RANK[it.sourceType] ?? 9;
    const rOld = SOURCE_RANK[existing.sourceType] ?? 9;
    if (rNew < rOld) {
      byUrl.set(key, it);
      continue;
    }
    if (rNew > rOld) continue;
    const tNew = new Date(it.publishedAt || it.createdTime || 0).getTime();
    const tOld = new Date(existing.publishedAt || existing.createdTime || 0).getTime();
    if (tNew >= tOld) byUrl.set(key, it);
  }
  return Array.from(byUrl.values());
}

async function buildUnifiedArchiveRaw(filters = {}) {
  const f = normalizeFilters(filters);

  const includeVoices = f.sourceType === '' || f.sourceType === 'voices';
  const includeProtest = f.sourceType === '' || f.sourceType === 'protest-music';
  const includeCurated = f.sourceType === '' || f.sourceType === 'curated-videos';

  const [voicesItems, songs, videos] = await Promise.all([
    includeVoices
      ? f.voiceSlug
        ? getVoicesFeedBySlug(f.voiceSlug)
        : getVoicesFeed()
      : Promise.resolve([]),
    includeProtest ? getAllProtestSongs({ limit: NOTION_FETCH_LIMIT }) : Promise.resolve([]),
    includeCurated ? getVideos({ limit: NOTION_FETCH_LIMIT }) : Promise.resolve([]),
  ]);

  let voiceSlice = (voicesItems || []).map((it) => ({ ...it, sourceType: 'voices' }));
  if (f.voiceSlug) {
    voiceSlice = voiceSlice.filter((it) => it.voice?.slug === f.voiceSlug);
  }

  const protestItems = (songs || []).map(songToFeedItem).filter(Boolean);
  const filteredProtestItems = f.artistSlug
    ? protestItems.filter((it) => it.voice?.slug === f.artistSlug)
    : protestItems;

  const curatedItems = (videos || []).map(curatedVideoToFeedItem).filter(Boolean);

  const combined = dedupeUnifiedArchiveItems([
    ...voiceSlice,
    ...filteredProtestItems,
    ...curatedItems,
  ]);

  return sortWithCurated24hBoost(combined);
}

function unifiedCacheKey(filters) {
  const f = normalizeFilters(filters);
  return ['unified-archive-v6', f.sourceType, f.voiceSlug, f.artistSlug];
}

const FEED_CACHE_TAG = 'unified-archive';

async function getCachedUnifiedArchiveRaw(filters) {
  const key = unifiedCacheKey(filters);
  return unstable_cache(() => buildUnifiedArchiveRaw(filters), key, {
    revalidate: REVALIDATE,
    tags: [FEED_CACHE_TAG],
  })();
}

export async function hydrateEditorialNotesForPage(items) {
  return Promise.all(
    items.map(async (it) => {
      if (it.sourceType !== 'curated-videos' && it.sourceType !== 'protest-music') return it;

      const pageId = it.sourceId || it.id;
      const note = await getCachedDescription(pageId);
      if (!note) return it;

      return {
        ...it,
        description: `${note}\n\n${EDITORIAL_SIGNATURE}`,
      };
    })
  );
}

/**
 * Paginated unified archive. Editorial notes hydrated only for the current slice.
 */
export async function getUnifiedArchivePage(page = 1, limit = ARCHIVE_PAGE_SIZE, filters = {}) {
  const full = await getCachedUnifiedArchiveRaw(filters);

  const start = (page - 1) * limit;
  const end = start + limit;

  const slice = full.slice(start, end);
  const hydrated = await hydrateEditorialNotesForPage(slice);

  return {
    items: hydrated,
    hasMore: end < full.length,
    total: full.length,
  };
}
