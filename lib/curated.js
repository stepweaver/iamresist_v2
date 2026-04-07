import { unstable_cache } from 'next/cache';
import { getVideos } from '@/lib/notion/videos.repo';
import { enrichVideosWithDescriptions } from '@/lib/videoContent';
import { slugify } from '@/lib/utils/slugify';

async function getCuratedVideosCached() {
  return getVideos({ limit: 50 });
}

/**
 * Get a single curated video by URL slug (title-derived). Returns null if not found.
 * Enriches with description (editorial note) for the page.
 */
export async function getCuratedVideoBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const videos = await unstable_cache(getCuratedVideosCached, ['curated-videos-list'], {
    revalidate: 600,
    tags: ['curated-videos', 'homepage-intel-feed'],
  })();

  const match = (videos || []).find(
    (v) => slugify(v.title).toLowerCase() === normalizedSlug
  );
  if (!match) return null;

  const [enriched] = await enrichVideosWithDescriptions([match]);
  if (!enriched) return null;

  return {
    ...enriched,
    slug: slugify(enriched.title),
  };
}
