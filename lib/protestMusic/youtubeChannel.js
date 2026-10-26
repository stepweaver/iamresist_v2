/** Verified YouTube channel ids are 24 characters and start with UC. */
export const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

const ARTIST_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function isYoutubeHost(hostname) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  return host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com';
}

/**
 * Channel id from a YouTube `/channel/UC…` URL or the official uploads feed URL.
 * Handles, /c/, /user/, and non-YouTube profiles return null. Never fetches.
 */
export function channelIdFromProfileUrl(value) {
  const url = parseHttpUrl(value);
  if (!url || !isYoutubeHost(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const channelIndex = parts.findIndex((part) => part.toLowerCase() === 'channel');
  if (channelIndex >= 0) {
    const candidate = parts[channelIndex + 1] || '';
    return YOUTUBE_CHANNEL_ID.test(candidate) ? candidate : null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/feeds/videos.xml') {
    const candidate = url.searchParams.get('channel_id') || '';
    return YOUTUBE_CHANNEL_ID.test(candidate) ? candidate : null;
  }
  return null;
}

export function isYoutubeHandleUrl(value) {
  const url = parseHttpUrl(value);
  if (!url || !isYoutubeHost(url.hostname)) return false;
  return url.pathname.split('/').filter(Boolean).some((part) => part.startsWith('@'));
}

/** Accept a raw UC id or a YouTube URL that already contains one. */
export function normalizeYoutubeChannelId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (YOUTUBE_CHANNEL_ID.test(trimmed)) return trimmed;
  return channelIdFromProfileUrl(trimmed);
}

/**
 * YouTube sometimes omits the UC prefix on `yt:channelId`.
 * A value matches only when it is the same verified id.
 */
export function channelIdsMatch(expected, actual) {
  const wanted = normalizeYoutubeChannelId(expected);
  if (!wanted || actual == null) return false;
  const raw = String(actual).trim();
  if (!raw) return false;
  if (raw === wanted) return true;
  if (YOUTUBE_CHANNEL_ID.test(`UC${raw}`) && `UC${raw}` === wanted) return true;
  const fromUrl = channelIdFromProfileUrl(raw);
  return Boolean(fromUrl && fromUrl === wanted);
}

/** Official uploads feed. The URL is built only from a validated channel id. */
export function youtubeUploadsFeedUrl(channelId) {
  if (!YOUTUBE_CHANNEL_ID.test(channelId || '')) return null;
  const url = new URL('https://www.youtube.com/feeds/videos.xml');
  url.searchParams.set('channel_id', channelId);
  return url.toString();
}

export function explicitChannelIdText(prop) {
  if (!prop) return '';
  if (typeof prop === 'string') return prop.trim();
  if (typeof prop.url === 'string' && prop.url.trim()) return prop.url.trim();
  if (Array.isArray(prop.rich_text)) {
    return prop.rich_text.map((part) => part?.plain_text || '').join('').trim();
  }
  return '';
}

/**
 * One song's verified channel id.
 * An explicit id wins. An invalid explicit id does not fall through to another URL.
 * Handles and other profiles stay unverified.
 */
export function resolveSongChannelId(song) {
  const explicitRaw = typeof song?.youtubeChannelId === 'string' ? song.youtubeChannelId.trim() : '';
  if (explicitRaw) {
    const explicit = normalizeYoutubeChannelId(explicitRaw);
    if (!explicit) return { status: 'invalid', channelId: null };
    return { status: 'verified', channelId: explicit };
  }
  const fromUrl = channelIdFromProfileUrl(song?.artistChannelUrl);
  if (fromUrl) return { status: 'verified', channelId: fromUrl };
  return { status: 'missing', channelId: null };
}

/** One channel id for an artist, or null when missing, invalid, or conflicting. */
export function resolveArtistChannelId(songs) {
  let resolved = null;
  for (const song of songs || []) {
    const result = resolveSongChannelId(song);
    if (result.status === 'invalid') return null;
    if (result.status !== 'verified') continue;
    if (resolved && resolved !== result.channelId) return null;
    resolved = result.channelId;
  }
  return resolved;
}

export function normalizeArtistSlug(slug) {
  const value = String(slug || '').trim().toLowerCase();
  if (!value || value.length > 100 || !ARTIST_SLUG.test(value)) return '';
  return value;
}

export function artistProfileUrl(songs) {
  for (const song of songs || []) {
    const url = typeof song?.artistChannelUrl === 'string' ? song.artistChannelUrl.trim() : '';
    if (/^https?:\/\//i.test(url)) return url;
  }
  return null;
}

/** Auto-generated YouTube Topic channels with no artist name in the label. */
export function isAnonymousTopicLabel(label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return /^(?:-\s*)?topic$/i.test(text);
}
