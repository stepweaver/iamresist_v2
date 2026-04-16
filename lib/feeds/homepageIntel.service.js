import 'server-only';

import { unstable_cache } from 'next/cache';
import { getHomepageVoicesPool } from '@/lib/voices';
import { getVideos } from '@/lib/notion/videos.repo';
import { enrichVideosWithDescriptions } from '@/lib/videoContent';
import {
  dedupeUnifiedArchiveItems,
  hydrateEditorialNotesForPage,
} from '@/lib/feeds/unifiedArchive.service';
import { HOMEPAGE_INTEL_FEED_SIZE } from '@/lib/constants';
import { slugify } from '@/lib/utils/slugify';
import { assessMissionScope } from '@/lib/intel/missionScope';

const CURATED_VOICE = {
  id: 'curated-videos',
  title: 'Curated Videos',
  slug: 'curated-videos',
  homeUrl: null,
  platform: 'YouTube',
};

function recencyBoost(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return 0;

  const ageHours = (Date.now() - t) / 3600000;
  if (ageHours <= 6) return 10;
  if (ageHours <= 24) return 6;
  if (ageHours <= 72) return 2;
  return 0;
}

function curatedVideoToFeedItem(video) {
  if (!video?.url) return null;

  const missionScope = assessMissionScope({
    title: video.title ?? '',
    summary: video.description ?? '',
    categories: [],
  });

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
    missionScope,
    homepageMissionScore:
      (missionScope.scoreDelta ?? 0) + 4 + recencyBoost(video.dateAdded || video.createdTime),
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
    const scoreA = a?.homepageMissionScore ?? 0;
    const scoreB = b?.homepageMissionScore ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b?.publishedAt || 0) - new Date(a?.publishedAt || 0);
  });
}

async function buildHomepageIntelFeed() {
  const [voiceItems, curatedVideosRaw] = await Promise.all([
    getHomepageVoicesPool(),
    getVideos({ limit: 8 }),
  ]);

  const curatedVideos = await enrichVideosWithDescriptions(curatedVideosRaw || []);

  const voicesWithSource = (voiceItems || []).map((it) => ({
    ...it,
    sourceType: 'voices',
  }));

  const curatedItems = (curatedVideos || [])
    .map(curatedVideoToFeedItem)
    .filter(Boolean)
    .filter((item) => item.missionScope?.allowedOnHomepageCommentary);

  const combined = dedupeUnifiedArchiveItems([...curatedItems, ...voicesWithSource]);
  const sorted = sortHomepageItems(combined);
  const limited = limitOnePerCreator(sorted, HOMEPAGE_INTEL_FEED_SIZE);

  return hydrateEditorialNotesForPage(limited);
}

export const getHomepageIntelFeed = unstable_cache(
  buildHomepageIntelFeed,
  ['homepage-intel-feed-v4'],
  {
    revalidate: 120,
    tags: ['homepage-intel-feed', 'unified-archive', 'curated-videos', 'voices-homepage-feed'],
  }
);