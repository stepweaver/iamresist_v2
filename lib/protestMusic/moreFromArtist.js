import { getYoutubeVideoId } from '@/lib/utils/youtube';
import {
  artistProfileUrl,
  channelIdsMatch,
  isAnonymousTopicLabel,
  normalizeArtistSlug,
  resolveArtistChannelId,
} from '@/lib/protestMusic/youtubeChannel';

export const RECENT_UPLOAD_LIMIT = 4;
/** Extra uploads so the playing video can be removed and four others remain. */
export const RECENT_FETCH_HEADROOM = 8;

export function creatorMoreRequest(item) {
  if (!item?.voice) return null;
  if (item.sourceType === 'protest-music' || item.isProtestMusic === true) {
    const slug = normalizeArtistSlug(item.voice?.slug);
    if (!slug) return null;
    return {
      kind: 'protest-music',
      url: `/api/voices-more?bucket=protest-music&artist=${encodeURIComponent(slug)}`,
    };
  }
  const isCuratedBucket =
    item.sourceType === 'curated-videos' ||
    item.voice?.slug === 'curated-videos' ||
    item.isCurated === true;
  if (isCuratedBucket) return { kind: 'curated', url: '/api/voices-more?bucket=curated' };
  const slug = item.voice?.slug;
  if (!slug || slug === 'curated-videos') return null;
  return {
    kind: 'voice',
    url: `/api/voices-more?slug=${encodeURIComponent(String(slug).trim())}`,
  };
}

export function belongsToArtist(item, artistSlug) {
  const wanted = normalizeArtistSlug(artistSlug);
  const slug = normalizeArtistSlug(item?.voice?.slug);
  return Boolean(wanted && slug && wanted === slug);
}

export function videoKey(item) {
  const yt = getYoutubeVideoId(item?.url, item?.sourceId);
  if (yt) return `yt:${yt}`;
  if (item?.url) return `url:${item.url}`;
  if (item?.id) return `id:${item.id}`;
  return '';
}

function timeOf(item) {
  const time = new Date(item?.publishedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function byNewest(a, b) {
  return timeOf(b) - timeOf(a);
}

function canonicalWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function toRecentItem(raw, artist) {
  const videoId = getYoutubeVideoId(raw?.url, raw?.sourceId);
  if (!videoId || !artist?.slug) return null;
  return {
    id: `protest-upload-${videoId}`,
    sourceId: raw?.sourceId || `yt:video:${videoId}`,
    title: raw?.title || '',
    url: canonicalWatchUrl(videoId),
    publishedAt: raw?.publishedAt || null,
    sourceType: 'protest-music',
    isProtestMusic: false,
    isDiscoveredUpload: true,
    description: '',
    ...(raw?.channelId ? { channelId: raw.channelId } : {}),
    voice: {
      id: artist.slug,
      title: artist.title || '',
      slug: artist.slug,
      homeUrl: artist.homeUrl ?? null,
      platform: 'YouTube',
    },
  };
}

export function toFeaturedItem(song) {
  if (!song?.url || !song?.slug) return null;
  return {
    id: song.id,
    sourceId: song.id,
    title: song.title,
    url: song.url,
    publishedAt: song.createdTime ?? null,
    sourceType: 'protest-music',
    isProtestMusic: true,
    songSlug: song.songSlug,
    description: '',
    voice: {
      id: song.slug,
      title: song.artist,
      slug: song.slug,
      homeUrl: song.artistChannelUrl ?? null,
      platform: 'YouTube',
    },
  };
}

/**
 * Keep uploads from the verified channel only.
 * An anonymous YouTube Topic feed is not an artist catalog.
 * Items that name a different channel id are dropped.
 */
export function acceptChannelUploads({ expectedChannelId, feed, items }) {
  if (!expectedChannelId) return [];
  const feedChannel = feed?.channelId || '';
  const label = `${feed?.author || ''} ${feed?.title || ''}`.trim();
  if (feedChannel && !channelIdsMatch(expectedChannelId, feedChannel)) return [];
  if (!feedChannel && !label) return [];
  if (isAnonymousTopicLabel(label) || isAnonymousTopicLabel(feed?.title)) return [];
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item?.channelId) return true;
    return channelIdsMatch(expectedChannelId, item.channelId);
  });
}

/**
 * Recent uploads and curated tracks stay separate.
 * The playing video is removed. A video id appears once, preferring the curated track.
 */
export function finalizeProtestRelated({ current, uploads, curated, recentLimit = RECENT_UPLOAD_LIMIT } = {}) {
  const currentKey = videoKey(current);
  const featured = [];
  const featuredKeys = new Set();
  for (const song of [...(curated || [])].sort(byNewest)) {
    const key = videoKey(song);
    if (!key || key === currentKey || featuredKeys.has(key)) continue;
    featuredKeys.add(key);
    featured.push(song);
  }

  const limit = Number.isFinite(recentLimit) ? Math.max(0, recentLimit) : RECENT_UPLOAD_LIMIT;
  const recent = [];
  const recentKeys = new Set();
  for (const upload of [...(uploads || [])].sort(byNewest)) {
    const key = videoKey(upload);
    if (!key || key === currentKey || featuredKeys.has(key) || recentKeys.has(key)) continue;
    recentKeys.add(key);
    recent.push(upload);
    if (recent.length >= limit) break;
  }
  return { recent, featured };
}

/** Sidebar caps still apply. When both groups exist, each stays visible. */
export function limitRelatedSections(recent, featured, cap) {
  const room = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0;
  if (room === 0) return { recent: [], featured: [] };
  const recentAvailable = (recent || []).slice(0, RECENT_UPLOAD_LIMIT);
  const featuredAvailable = featured || [];
  if (recentAvailable.length === 0) {
    return { recent: [], featured: featuredAvailable.slice(0, room) };
  }
  if (featuredAvailable.length === 0) {
    return { recent: recentAvailable.slice(0, room), featured: [] };
  }
  const recentSlots = Math.min(recentAvailable.length, room - 1);
  return {
    recent: recentAvailable.slice(0, recentSlots),
    featured: featuredAvailable.slice(0, room - recentSlots),
  };
}

export function artistIdentityFromSongs(songs) {
  const list = songs || [];
  const named = list.find((song) => song?.artist);
  return {
    title: named?.artist || '',
    slug: named?.slug || '',
    homeUrl: artistProfileUrl(list),
    channelId: resolveArtistChannelId(list),
  };
}
