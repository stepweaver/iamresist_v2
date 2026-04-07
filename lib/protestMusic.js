import { unstable_cache } from 'next/cache';
import { getAllProtestSongs } from '@/lib/notion/protestMusic.repo';
import { enrichProtestMusicWithDescriptions } from '@/lib/videoContent';
import { slugify } from '@/lib/utils/slugify';

async function getProtestSongsCached() {
  return getAllProtestSongs({ limit: 200 });
}

/**
 * Get a single protest song by URL slug (title-derived). Returns null if not found.
 * Enriches with editorial description from Notion page body.
 */
export async function getProtestSongBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const songs = await unstable_cache(getProtestSongsCached, ['protest-songs-list'], {
    revalidate: 600,
    tags: ['protest-music'],
  })();

  const match = (songs || []).find(
    (s) => slugify(s.title).toLowerCase() === normalizedSlug
  );
  if (!match) return null;

  const [enriched] = await enrichProtestMusicWithDescriptions([match]);
  if (!enriched) return null;

  return {
    ...enriched,
    songSlug: slugify(enriched.title),
  };
}
