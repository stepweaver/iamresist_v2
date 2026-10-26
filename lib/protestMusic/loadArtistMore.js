import 'server-only';

import { unstable_cache } from 'next/cache';
import { fetchFeedItemsWithMeta } from '@/lib/feeds/rss';
import { getAllProtestSongs } from '@/lib/notion/protestMusic.repo';
import {
  acceptChannelUploads,
  artistIdentityFromSongs,
  finalizeProtestRelated,
  RECENT_FETCH_HEADROOM,
  toFeaturedItem,
  toRecentItem,
} from '@/lib/protestMusic/moreFromArtist';
import {
  normalizeArtistSlug,
  youtubeUploadsFeedUrl,
} from '@/lib/protestMusic/youtubeChannel';

export const PROTEST_UPLOADS_REVALIDATE_SECONDS = 1800;
/** One short retry. The player already shows curated tracks while this runs. */
export const PROTEST_UPLOADS_RETRY_DELAYS_MS = Object.freeze([800]);

async function fetchVerifiedUploads(channelId) {
  const feedUrl = youtubeUploadsFeedUrl(channelId);
  if (!feedUrl) {
    const error = new Error('invalid_channel');
    error.code = 'PROTEST_UPLOADS_UNAVAILABLE';
    throw error;
  }
  const result = await fetchFeedItemsWithMeta(feedUrl, {
    limit: 12,
    tags: ['voices-more', 'protest-music', `protest-uploads:${channelId}`],
    youtubeRetryDelaysMs: PROTEST_UPLOADS_RETRY_DELAYS_MS,
    onFailure: 'empty',
    includeFeedMeta: true,
  });
  if (!result.ok) {
    const error = new Error(result.reason || 'feed_unavailable');
    error.code = 'PROTEST_UPLOADS_UNAVAILABLE';
    throw error;
  }
  return { items: result.items || [], feed: result.feed || null };
}

const getCachedVerifiedUploads = unstable_cache(
  fetchVerifiedUploads,
  ['protest-music-youtube-uploads-v1'],
  { revalidate: PROTEST_UPLOADS_REVALIDATE_SECONDS, tags: ['protest-music', 'voices-more'] },
);

/**
 * Recent uploads for one protest artist.
 * The channel id is resolved from Notion. Callers cannot supply a feed URL.
 * A failed or unverified feed leaves the curated tracks in place.
 */
export async function loadProtestArtistMore(artistSlug, deps = {}) {
  const slug = normalizeArtistSlug(artistSlug);
  if (!slug) return { recent: [], featured: [], feedFailed: false, channelId: null };

  const getSongs = deps.getSongs || getAllProtestSongs;
  const getUploads = deps.getUploads || getCachedVerifiedUploads;
  const songs = await getSongs({ limit: 400, throwOnError: true });
  const artistSongs = (songs || []).filter((song) => song?.slug === slug);
  const featured = artistSongs.map(toFeaturedItem).filter(Boolean);
  const artist = artistIdentityFromSongs(artistSongs);

  if (!artist.channelId) {
    return { recent: [], featured, feedFailed: false, channelId: null };
  }

  let fetched;
  try {
    fetched = await getUploads(artist.channelId);
  } catch {
    return { recent: [], featured, feedFailed: true, channelId: artist.channelId };
  }

  const accepted = acceptChannelUploads({
    expectedChannelId: artist.channelId,
    feed: fetched?.feed,
    items: fetched?.items || [],
  });
  const uploads = accepted.map((item) => toRecentItem(item, artist)).filter(Boolean);
  const { recent } = finalizeProtestRelated({
    current: null,
    uploads,
    curated: featured,
    recentLimit: RECENT_FETCH_HEADROOM,
  });
  return { recent, featured, feedFailed: false, channelId: artist.channelId };
}
