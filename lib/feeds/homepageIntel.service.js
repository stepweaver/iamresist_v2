import 'server-only';

import { unstable_cache } from 'next/cache';
import { getHomepageVoicesPool } from '@/lib/voices';
import { getVideos } from '@/lib/notion/videos.repo';
import { enrichVideosWithDescriptions } from '@/lib/videoContent';
import {
  dedupeUnifiedArchiveItems,
  hydrateEditorialNotesForPage,
} from '@/lib/feeds/unifiedArchive.service';
import { createFailureCooldown, isUpstreamFailure, upstreamFailure } from '@/lib/feeds/upstreamResult';
import { recallLastKnownGood, rememberLastKnownGood } from '@/lib/feeds/lastKnownGood';
import {
  assertUpstreamAvailable,
  noteUpstreamFailure,
  recallSharedPartial,
} from '@/lib/feeds/sharedFailureBackoff';
import { timeAsync } from '@/lib/ops/perfTiming';
import { HOMEPAGE_INTEL_FEED_SIZE } from '@/lib/constants';
import { slugify } from '@/lib/utils/slugify';

const HOMEPAGE_INTEL_KEY = 'homepage-intel';
const homepageIntelCooldown = createFailureCooldown();

const CURATED_VOICE = {
  id: 'curated-videos',
  title: 'Curated Videos',
  slug: 'curated-videos',
  homeUrl: null,
  platform: 'YouTube',
};

function curatedVideoToFeedItem(video) {
  if (!video?.url) return null;

  return {
    id: `curated-${video.id}`,
    sourceId: video.id,
    title: video.title,
    url: video.url,
    publishedAt: video.dateAdded || video.createdTime || null,
    createdTime: video.createdTime ?? null,
    sourceType: 'curated-videos',
    voice: { ...CURATED_VOICE, platform: video.platform || 'YouTube' },
    description: video.description || '',
    slug: slugify(video.title),
    isCurated: true,
  };
}

function creatorKey(item) {
  if (!item) return 'unknown';
  if (item.sourceType === 'curated-videos') return 'curated-videos';
  if (item.sourceType === 'protest-music') {
    return `artist:${item.voice?.slug || item.voice?.id || 'unknown'}`;
  }
  return `voice:${item.voice?.slug || item.voice?.id || 'unknown'}`;
}

function limitOnePerCreator(items, limit = HOMEPAGE_INTEL_FEED_SIZE) {
  const out = [];
  const seen = new Set();

  for (const item of items) {
    const key = creatorKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }

  return out;
}

function sortHomepageItems(items) {
  return [...items].sort((a, b) => {
    return new Date(b?.publishedAt || b?.createdTime || 0) - new Date(a?.publishedAt || a?.createdTime || 0);
  });
}

async function buildHomepageIntelFeed() {
  return timeAsync('homepage-intel', async () => {
    await assertUpstreamAvailable(homepageIntelCooldown, HOMEPAGE_INTEL_KEY);

    const [voiceOutcome, curatedOutcome] = await Promise.all([
      getHomepageVoicesPool().then(
        (items) => ({ items: items || [], failed: false }),
        (err) => {
          if (!isUpstreamFailure(err)) throw err;
          return { items: [], failed: true };
        },
      ),
      getVideos({ limit: 8, throwOnError: true }).then(
        (videos) => ({ videos: videos || [], failed: false }),
        (err) => {
          if (isUpstreamFailure(err)) throw err;
          console.warn('[homepage-intel] curated videos failed; not caching an empty curated list');
          return { videos: [], failed: true };
        },
      ),
    ]);
    const voiceItems = voiceOutcome.items;
    const voicesFailed = voiceOutcome.failed;

    const curatedVideos = curatedOutcome.failed
      ? []
      : await enrichVideosWithDescriptions(curatedOutcome.videos || []);

    const voicesWithSource = (voiceItems || []).map((it) => ({
      ...it,
      sourceType: 'voices',
    }));

    const curatedItems = (curatedVideos || [])
      .map(curatedVideoToFeedItem)
      .filter(Boolean);

    const combined = dedupeUnifiedArchiveItems([...curatedItems, ...voicesWithSource]);
    const sorted = sortHomepageItems(combined);
    const limited = limitOnePerCreator(sorted, HOMEPAGE_INTEL_FEED_SIZE);

    if (voicesFailed || curatedOutcome.failed) {
      const err = upstreamFailure('homepage-intel');
      if (limited.length > 0) err.partial = limited;
      await noteUpstreamFailure(homepageIntelCooldown, HOMEPAGE_INTEL_KEY, {
        tags: ['homepage-intel-feed', 'voices-homepage-feed', 'curated-videos'],
        partial: limited.length > 0 ? limited : undefined,
      });
      throw err;
    }

    return hydrateEditorialNotesForPage(limited);
  });
}

const cachedHomepageIntelFeed = unstable_cache(
  buildHomepageIntelFeed,
  ['homepage-intel-feed-v5'],
  {
    revalidate: 120,
    tags: ['homepage-intel-feed', 'unified-archive', 'curated-videos', 'voices-homepage-feed'],
  }
);

export async function getHomepageIntelFeed() {
  try {
    const items = await cachedHomepageIntelFeed();
    if (Array.isArray(items) && items.length > 0) rememberLastKnownGood(HOMEPAGE_INTEL_KEY, items);
    return items;
  } catch (err) {
    if (!isUpstreamFailure(err)) throw err;
    const snap = recallLastKnownGood(HOMEPAGE_INTEL_KEY);
    if (Array.isArray(snap) && snap.length > 0) err.fallback = snap;
    else if (Array.isArray(err.partial) && err.partial.length > 0) err.fallback = err.partial;
    else {
      const partial = await recallSharedPartial(HOMEPAGE_INTEL_KEY);
      if (Array.isArray(partial) && partial.length > 0) err.fallback = partial;
    }
    throw err;
  }
}
