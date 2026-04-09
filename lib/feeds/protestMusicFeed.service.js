import { unstable_cache } from 'next/cache';
import { getLatestProtestSong } from '@/lib/notion/protestMusic.repo';
import { enrichProtestMusicWithDescriptions } from '@/lib/videoContent';
import { slugify } from '@/lib/utils/slugify';

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
