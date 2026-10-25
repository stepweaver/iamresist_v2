// Unified Intel archive: RSS voices + Notion curated videos + Notion protest music (source parity).
import { unstable_cache } from 'next/cache';
import { getVoicesFeed, getVoicesFeedBySlug } from '@/lib/voices';
import { getVideos } from '@/lib/notion/videos.repo';
import { getAllProtestSongs } from '@/lib/notion/protestMusic.repo';
import { getCachedDescription, EDITORIAL_SIGNATURE } from '@/lib/videoContent';
import { timeAsync } from '@/lib/ops/perfTiming';
import { slugify } from '@/lib/utils/slugify';
import { recallLastKnownGood, rememberLastKnownGood } from '@/lib/feeds/lastKnownGood';
import { createFailureCooldown, isUpstreamFailure, upstreamFailure } from '@/lib/feeds/upstreamResult';
import {
  assertUpstreamAvailable,
  noteUpstreamFailure,
  recallSharedPartial,
} from '@/lib/feeds/sharedFailureBackoff';
import { isInvalidFeedConfig, selectItemsForTelescreenArchive } from '@/lib/feeds/archiveMedia';
import { TELESCREEN_FEED_STATUS } from '@/lib/telescreen';

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

function composeArchiveItems({ voiceItems = [], songs = [], videos = [], filters }) {
  const f = normalizeFilters(filters);
  let voiceSlice = (voiceItems || []).map((it) => ({ ...it, sourceType: 'voices' }));
  if (f.voiceSlug) {
    voiceSlice = voiceSlice.filter((it) => it.voice?.slug === f.voiceSlug);
  }

  const protestItems = (songs || []).map(songToFeedItem).filter(Boolean);
  const filteredProtestItems = f.artistSlug
    ? protestItems.filter((it) => it.voice?.slug === f.artistSlug)
    : protestItems;

  const curatedItems = (videos || []).map(curatedVideoToFeedItem).filter(Boolean);
  // Eligibility runs before dedupe and sort so pagination totals count videos only.
  const eligible = selectItemsForTelescreenArchive([
    ...voiceSlice,
    ...filteredProtestItems,
    ...curatedItems,
  ]);

  return sortWithCurated24hBoost(dedupeUnifiedArchiveItems(eligible));
}

function voiceSlugsWithVideos(items) {
  const slugs = [];
  const seen = new Set();
  for (const item of items) {
    if (item?.sourceType !== 'voices') continue;
    const slug = String(item?.voice?.slug || '').trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

function finalizeArchive(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    items: list,
    feedStatus: list.length > 0 ? TELESCREEN_FEED_STATUS.ok : TELESCREEN_FEED_STATUS.empty,
  };
}

function normalizeArchivePayload(full) {
  if (full && !Array.isArray(full) && Array.isArray(full.items)) {
    return {
      items: full.items,
      feedStatus: full.feedStatus || (full.items.length > 0 ? TELESCREEN_FEED_STATUS.ok : TELESCREEN_FEED_STATUS.empty),
    };
  }
  const items = Array.isArray(full) ? full : [];
  return {
    items,
    feedStatus: items.length > 0 ? TELESCREEN_FEED_STATUS.ok : TELESCREEN_FEED_STATUS.empty,
  };
}

async function loadArchiveVoices(filters) {
  const f = normalizeFilters(filters);
  const includeVoices = f.sourceType === '' || f.sourceType === 'voices';
  if (!includeVoices) return { items: [], failed: false };

  try {
    const items = f.voiceSlug ? await getVoicesFeedBySlug(f.voiceSlug) : await getVoicesFeed();
    return { items: items || [], failed: false, invalid: false };
  } catch (err) {
    if (isInvalidFeedConfig(err)) return { items: [], failed: false, invalid: true };
    if (!isUpstreamFailure(err)) throw err;
    return { items: [], failed: true, invalid: false };
  }
}

function notionRead(load) {
  return load().then(
    (items) => ({ items: items || [], failed: false }),
    (err) => {
      if (isUpstreamFailure(err)) throw err;
      return { items: [], failed: true };
    },
  );
}

async function loadArchiveNotion(filters) {
  const f = normalizeFilters(filters);
  const includeProtest = f.sourceType === '' || f.sourceType === 'protest-music';
  const includeCurated = f.sourceType === '' || f.sourceType === 'curated-videos';
  const [songsOutcome, videosOutcome] = await Promise.all([
    includeProtest
      ? notionRead(() => getAllProtestSongs({ limit: NOTION_FETCH_LIMIT, throwOnError: true }))
      : Promise.resolve({ items: [], failed: false }),
    includeCurated
      ? notionRead(() => getVideos({ limit: NOTION_FETCH_LIMIT, throwOnError: true }))
      : Promise.resolve({ items: [], failed: false }),
  ]);
  if (songsOutcome.failed || videosOutcome.failed) {
    console.warn('[unified-archive] Notion directory failed; not caching an empty collection');
  }
  return {
    songs: songsOutcome.items,
    videos: videosOutcome.items,
    notionFailed: songsOutcome.failed || videosOutcome.failed,
  };
}

async function buildUnifiedArchiveRaw(filters = {}) {
  const failureKey = archiveFailureKey(filters);
  await assertUpstreamAvailable(cooldownForArchive(failureKey), failureKey);

  const [voicesOutcome, notion] = await Promise.all([
    loadArchiveVoices(filters),
    loadArchiveNotion(filters),
  ]);

  if (voicesOutcome.invalid) {
    return { items: [], feedStatus: TELESCREEN_FEED_STATUS.invalid };
  }

  if (voicesOutcome.failed || notion.notionFailed) {
    const partial = composeArchiveItems({
      voiceItems: voicesOutcome.failed ? [] : voicesOutcome.items,
      songs: notion.songs,
      videos: notion.videos,
      filters,
    });
    const err = upstreamFailure('unified-archive');
    if (partial.length > 0) err.partial = partial;
    await noteUpstreamFailure(cooldownForArchive(failureKey), failureKey, {
      tags: [FEED_CACHE_TAG, 'voices-feed', 'curated-videos', 'protest-music'],
      partial: partial.length > 0 ? partial : undefined,
    });
    throw err;
  }

  return finalizeArchive(composeArchiveItems({
    voiceItems: voicesOutcome.items,
    songs: notion.songs,
    videos: notion.videos,
    filters,
  }));
}

async function buildDegradedArchive(filters) {
  const notion = await loadArchiveNotion(filters);
  const items = composeArchiveItems({
    voiceItems: [],
    songs: notion.songs,
    videos: notion.videos,
    filters,
  });
  if (notion.notionFailed) {
    const err = upstreamFailure('unified-archive');
    if (items.length > 0) err.partial = items;
    throw err;
  }
  return items;
}

function unifiedCacheKey(filters) {
  const f = normalizeFilters(filters);
  return ['unified-archive-v7', f.sourceType, f.voiceSlug, f.artistSlug];
}

const FEED_CACHE_TAG = 'unified-archive';
const archiveCooldowns = new Map();
const MAX_ARCHIVE_COOLDOWNS = 24;

function cooldownForArchive(key) {
  let cooldown = archiveCooldowns.get(key);
  if (!cooldown) {
    if (archiveCooldowns.size >= MAX_ARCHIVE_COOLDOWNS) {
      const oldest = archiveCooldowns.keys().next().value;
      archiveCooldowns.delete(oldest);
    }
    cooldown = createFailureCooldown();
    archiveCooldowns.set(key, cooldown);
  }
  return cooldown;
}

function archiveFailureKey(filters) {
  const f = normalizeFilters(filters);
  return `unified-archive:${f.sourceType}:${f.voiceSlug}:${f.artistSlug}`;
}

async function getCachedUnifiedArchiveRaw(filters) {
  const key = unifiedCacheKey(filters);
  return unstable_cache(() => buildUnifiedArchiveRaw(filters), key, {
    revalidate: REVALIDATE,
    tags: [FEED_CACHE_TAG],
  })();
}

function getDegradedUnifiedArchive(filters) {
  const key = ['unified-archive-degraded-v1', ...unifiedCacheKey(filters).slice(1)];
  return unstable_cache(() => buildDegradedArchive(filters), key, {
    revalidate: 60,
    tags: [FEED_CACHE_TAG],
  })();
}

function paginateArchive(full, page, limit) {
  const items = Array.isArray(full) ? full : [];
  const start = (page - 1) * limit;
  const end = start + limit;
  return { slice: items.slice(start, end), total: items.length, end };
}

async function archivePageFromItems(items, page, limit, feedStatus) {
  const list = Array.isArray(items) ? items : [];
  const { slice, total, end } = paginateArchive(list, page, limit);
  const hydrated = await hydrateEditorialNotesForPage(slice);
  return {
    items: hydrated,
    hasMore: end < total,
    total,
    feedStatus: feedStatus || (total > 0 ? TELESCREEN_FEED_STATUS.ok : TELESCREEN_FEED_STATUS.empty),
    videoVoiceSlugs: voiceSlugsWithVideos(list),
  };
}

async function degradedArchivePage(filters, page, limit) {
  const failureKey = archiveFailureKey(filters);
  const lkgKey = failureKey;
  const snap = recallLastKnownGood(lkgKey);
  if (Array.isArray(snap) && snap.length > 0) return archivePageFromItems(snap, page, limit, TELESCREEN_FEED_STATUS.ok);

  const partial = await recallSharedPartial(failureKey);
  if (Array.isArray(partial) && partial.length > 0) {
    return archivePageFromItems(partial, page, limit, TELESCREEN_FEED_STATUS.ok);
  }

  try {
    const degraded = await getDegradedUnifiedArchive(filters);
    const list = Array.isArray(degraded) ? degraded : [];
    if (list.length > 0) return archivePageFromItems(list, page, limit, TELESCREEN_FEED_STATUS.ok);
    return archivePageFromItems([], page, limit, TELESCREEN_FEED_STATUS.unavailable);
  } catch (err) {
    if (isUpstreamFailure(err) && Array.isArray(err.partial) && err.partial.length > 0) {
      return archivePageFromItems(err.partial, page, limit, TELESCREEN_FEED_STATUS.ok);
    }
    if (isUpstreamFailure(err)) return archivePageFromItems([], page, limit, TELESCREEN_FEED_STATUS.unavailable);
    throw err;
  }
}

export async function hydrateEditorialNotesForPage(items) {
  return timeAsync('notion-editorial-hydration', () =>
    Promise.all(
      items.map(async (it) => {
        if (it.sourceType !== 'curated-videos' && it.sourceType !== 'protest-music') return it;

        const pageId = it.sourceId || it.id;
        const note = await getCachedDescription(pageId);
        if (!note) return it;

        return {
          ...it,
          description: `${note}\n\n${EDITORIAL_SIGNATURE}`,
        };
      }),
    ),
  );
}

/**
 * Paginated unified archive. Editorial notes hydrated only for the current slice.
 */
export async function getUnifiedArchivePage(page = 1, limit = ARCHIVE_PAGE_SIZE, filters = {}) {
  const failureKey = archiveFailureKey(filters);
  try {
    const payload = normalizeArchivePayload(await getCachedUnifiedArchiveRaw(filters));
    if (payload.feedStatus === TELESCREEN_FEED_STATUS.invalid) {
      return archivePageFromItems([], page, limit, TELESCREEN_FEED_STATUS.invalid);
    }
    if (payload.items.length > 0) rememberLastKnownGood(failureKey, payload.items);
    return archivePageFromItems(payload.items, page, limit, payload.feedStatus);
  } catch (err) {
    if (isInvalidFeedConfig(err)) {
      return archivePageFromItems([], page, limit, TELESCREEN_FEED_STATUS.invalid);
    }
    if (!isUpstreamFailure(err)) throw err;
    const snap = recallLastKnownGood(failureKey);
    if (Array.isArray(snap) && snap.length > 0) return archivePageFromItems(snap, page, limit, TELESCREEN_FEED_STATUS.ok);
    if (Array.isArray(err.partial) && err.partial.length > 0) {
      return archivePageFromItems(err.partial, page, limit, TELESCREEN_FEED_STATUS.ok);
    }
    return degradedArchivePage(filters, page, limit);
  }
}
