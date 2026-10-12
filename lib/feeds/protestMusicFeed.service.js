import { unstable_cache } from 'next/cache';
import { getLatestProtestSong, getAllProtestSongs } from '@/lib/notion/protestMusic.repo';
import { enrichProtestMusicWithDescriptions } from '@/lib/videoContent';
import { slugify } from '@/lib/utils/slugify';
import { createFailureCooldown, isUpstreamFailure, upstreamFailure } from '@/lib/feeds/upstreamResult';
import { readThroughLastKnownGood } from '@/lib/feeds/lastKnownGood';

const HOMEPAGE_PROTEST_MUSIC_COUNT = 3;
const protestMusicCooldown = createFailureCooldown();

/** Normalize protest song to same shape as voice feed items (for VoiceCard). */
function songToFeedItem(song) {
  if (!song?.url) return null;
  return {
    id: song.id,
    title: song.title,
    url: song.url,
    publishedAt: song.createdTime ?? null,
    sourceType: 'protest-music',
    isProtestMusic: true,
    songSlug: song.songSlug || slugify(song.title),
    description: song.description || '',
    voice: {
      id: song.id,
      title: song.artist,
      slug: song.slug,
      homeUrl: song.artistChannelUrl ?? null,
      platform: 'YouTube',
    },
  };
}

/** Cached latest song for homepage. Revalidates every 5 min. */
export const getLatestProtestMusicItem = unstable_cache(
  async () => {
    const song = await getLatestProtestSong();
    if (!song) return null;
    const [enriched] = await enrichProtestMusicWithDescriptions([song]);
    return songToFeedItem(enriched);
  },
  ['protest-music-homepage-v2'],
  { revalidate: 300, tags: ['protest-music'] }
);

/** Cached recent songs (up to HOMEPAGE_PROTEST_MUSIC_COUNT) for homepage grid. */
async function loadRecentProtestMusicItems() {
  if (protestMusicCooldown.active()) throw upstreamFailure('protest-music');
  try {
    const songs = await getAllProtestSongs({ limit: HOMEPAGE_PROTEST_MUSIC_COUNT, throwOnError: true });
    protestMusicCooldown.clear();
    if (!songs.length) return [];
    const enriched = await enrichProtestMusicWithDescriptions(songs);
    return enriched.map(songToFeedItem).filter(Boolean);
  } catch (err) {
    if (isUpstreamFailure(err)) throw err;
    protestMusicCooldown.trip();
    console.warn('[protest-music] upstream failed; not caching an empty homepage list');
    throw upstreamFailure('protest-music');
  }
}

export const getRecentProtestMusicItems = unstable_cache(
  loadRecentProtestMusicItems,
  ['protest-music-homepage-recent-v1'],
  { revalidate: 300, tags: ['protest-music'] }
);

export async function getRecentProtestMusicItemsWithFallback() {
  return readThroughLastKnownGood('homepage-protest-music', () => getRecentProtestMusicItems());
}
