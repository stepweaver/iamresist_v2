import 'server-only';

import { unstable_cache } from 'next/cache';
import { fetchFeedItemsWithMeta } from '@/lib/feeds/rss';
import { fetchChannelListing } from '@/lib/protestMusic/channelListing';
import { getAllProtestSongs } from '@/lib/notion/protestMusic.repo';
import {
  artistIdentityFromSongs,
  explainChannelUploads,
  finalizeProtestRelated,
  RECENT_FETCH_HEADROOM,
  toFeaturedItem,
  toRecentItem,
  uploadsDiagnostic,
} from '@/lib/protestMusic/moreFromArtist';
import {
  normalizeArtistSlug,
  youtubeUploadsFeedUrl,
} from '@/lib/protestMusic/youtubeChannel';

export const PROTEST_UPLOADS_REVALIDATE_SECONDS = 1800;
/** One short retry. The player already shows curated tracks while this runs. */
export const PROTEST_UPLOADS_RETRY_DELAYS_MS = Object.freeze([800]);

function unavailable(reason, listingReason = null) {
  const error = new Error(reason || 'feed_unavailable');
  error.code = 'PROTEST_UPLOADS_UNAVAILABLE';
  error.reason = reason || 'request_failed';
  if (listingReason) error.listingReason = listingReason;
  return error;
}

/**
 * Official uploads RSS first. A transient 404 is not an empty catalog.
 * When that feed fails, read the same channel's public videos tab once.
 * A listing that names a different channel is refused.
 */
export async function resolveVerifiedUploads(channelId, deps = {}) {
  const feedUrl = youtubeUploadsFeedUrl(channelId);
  if (!feedUrl) throw unavailable('invalid_channel');

  const fetchFeed = deps.fetchFeed || ((url) => fetchFeedItemsWithMeta(url, {
    limit: 12,
    tags: ['voices-more', 'protest-music', `protest-uploads:${channelId}`],
    youtubeRetryDelaysMs: PROTEST_UPLOADS_RETRY_DELAYS_MS,
    onFailure: 'empty',
    includeFeedMeta: true,
  }));
  const fetchListing = deps.fetchListing || fetchChannelListing;
  const result = await fetchFeed(feedUrl);
  if (result?.ok) {
    return {
      items: result.items || [],
      feed: result.feed || null,
      source: 'rss',
      rssReason: null,
      rejectedReason: null,
    };
  }

  const rssReason = result?.reason || 'request_failed';
  const listing = await fetchListing(channelId);
  if (listing?.ok) {
    return {
      items: listing.items || [],
      feed: listing.feed || null,
      source: 'channel_listing',
      rssReason,
      rejectedReason: null,
    };
  }
  if (
    listing?.reason === 'channel_mismatch' ||
    listing?.reason === 'anonymous_topic' ||
    listing?.reason === 'missing_identity' ||
    listing?.reason === 'channel_unavailable'
  ) {
    return {
      items: [],
      feed: listing.feed || null,
      source: 'channel_listing',
      rssReason,
      rejectedReason: listing.reason,
    };
  }
  throw unavailable(rssReason, listing?.reason || 'listing_unavailable');
}

async function fetchVerifiedUploads(channelId) {
  return resolveVerifiedUploads(channelId);
}

const getCachedVerifiedUploads = unstable_cache(
  fetchVerifiedUploads,
  ['protest-music-youtube-uploads-v3'],
  { revalidate: PROTEST_UPLOADS_REVALIDATE_SECONDS, tags: ['protest-music', 'voices-more'] },
);

/**
 * Recent uploads for one protest artist.
 * The channel id is resolved from Notion. Callers cannot supply a feed URL.
 * A failed or unverified feed leaves the curated tracks in place.
 */
function resultFor(slug, fields) {
  if (fields.uploads?.status === 'upstream_failed' || fields.uploads?.status === 'rejected') {
    console.warn('[protest-uploads]', { artist: slug, ...fields.uploads });
  } else if (fields.uploads?.source === 'channel_listing' && fields.uploads?.rssReason) {
    console.warn('[protest-uploads] rss unavailable; used channel listing', {
      artist: slug,
      rssReason: fields.uploads.rssReason,
    });
  }
  return fields;
}

export async function loadProtestArtistMore(artistSlug, deps = {}) {
  const slug = normalizeArtistSlug(artistSlug);
  if (!slug) {
    return resultFor(slug, {
      recent: [],
      featured: [],
      feedFailed: false,
      channelId: null,
      uploads: uploadsDiagnostic({ status: 'unverified_channel', reason: 'invalid_channel' }),
    });
  }

  const getSongs = deps.getSongs || getAllProtestSongs;
  const getUploads = deps.getUploads || getCachedVerifiedUploads;
  const songs = await getSongs({ limit: 400, throwOnError: true });
  const artistSongs = (songs || []).filter((song) => song?.slug === slug);
  const featured = artistSongs.map(toFeaturedItem).filter(Boolean);
  const artist = artistIdentityFromSongs(artistSongs);

  if (!artist.channelId) {
    return resultFor(slug, {
      recent: [],
      featured,
      feedFailed: false,
      channelId: null,
      uploads: uploadsDiagnostic({ status: 'unverified_channel' }),
    });
  }

  let fetched;
  try {
    fetched = await getUploads(artist.channelId);
  } catch (err) {
    return resultFor(slug, {
      recent: [],
      featured,
      feedFailed: true,
      channelId: artist.channelId,
      uploads: uploadsDiagnostic({
        status: 'upstream_failed',
        reason: err?.reason || err?.message || 'request_failed',
        rssReason: err?.reason || err?.message || null,
      }),
    });
  }

  const source = fetched?.source === 'channel_listing' ? 'channel_listing' : 'rss';
  const rssReason = source === 'channel_listing' ? fetched?.rssReason || null : null;
  if (fetched?.rejectedReason) {
    return resultFor(slug, {
      recent: [],
      featured,
      feedFailed: false,
      channelId: artist.channelId,
      uploads: uploadsDiagnostic({
        status: 'rejected',
        reason: fetched.rejectedReason,
        source,
        rssReason,
      }),
    });
  }

  const explained = explainChannelUploads({
    expectedChannelId: artist.channelId,
    feed: fetched?.feed,
    items: fetched?.items || [],
  });
  if (explained.reason && explained.reason !== 'empty') {
    return resultFor(slug, {
      recent: [],
      featured,
      feedFailed: false,
      channelId: artist.channelId,
      uploads: uploadsDiagnostic({
        status: 'rejected',
        reason: explained.reason,
        source,
        rssReason,
      }),
    });
  }
  if (explained.reason === 'empty') {
    return resultFor(slug, {
      recent: [],
      featured,
      feedFailed: false,
      channelId: artist.channelId,
      uploads: uploadsDiagnostic({ status: 'empty', source, rssReason }),
    });
  }

  const uploads = explained.items.map((item) => toRecentItem(item, artist)).filter(Boolean);
  const { recent } = finalizeProtestRelated({
    current: null,
    uploads,
    curated: featured,
    recentLimit: RECENT_FETCH_HEADROOM,
  });
  return resultFor(slug, {
    recent,
    featured,
    feedFailed: false,
    channelId: artist.channelId,
    uploads: uploadsDiagnostic({ status: 'ok', source, rssReason }),
  });
}
