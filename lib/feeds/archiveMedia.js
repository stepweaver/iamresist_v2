/**
 * Deterministic video classification for Telescreen archive items.
 * Uses the item URL, source id, and RSS media metadata already on the item.
 * No network calls, title keywords, thumbnails, or creator-platform guesses.
 */

const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;
const VIDEO_FILE = /\.(mp4|m4v|webm|mov|ogv|m3u8)$/i;
const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|wav|flac)$/i;

const VIDEO_FEED_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'rumble.com', 'tiktok.com'];

export const INVALID_FEED_CONFIG = 'INVALID_FEED_CONFIG';

const INVALID_FEED_FETCH_REASONS = new Set([
  'missing_feed_url',
  'invalid_feed_url',
  'html_body',
  'non_feed_body',
]);

export function invalidFeedConfig(operation) {
  const err = new Error(`${operation}_invalid_feed_config`);
  err.code = INVALID_FEED_CONFIG;
  err.operation = operation;
  return err;
}

export function isInvalidFeedConfig(err) {
  return Boolean(err && err.code === INVALID_FEED_CONFIG);
}

export function isInvalidFeedFetchReason(reason) {
  return INVALID_FEED_FETCH_REASONS.has(reason);
}

export function isInvalidFeedFetchReasonList(reasons) {
  return Array.isArray(reasons) && reasons.length > 0 && reasons.every((reason) => isInvalidFeedFetchReason(reason));
}

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

function hostOf(url) {
  return url.hostname.replace(/^www\./i, '').toLowerCase();
}

function isYoutubeId(value) {
  return typeof value === 'string' && YOUTUBE_ID.test(value);
}

function isYoutubeHost(host) {
  return host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com');
}

export function isConfiguredFeedUrl(feedUrl) {
  return Boolean(parseHttpUrl(feedUrl));
}

/**
 * The feed URL itself is a video platform source.
 * A YouTube platform label or a Substack host does not qualify.
 */
export function isVideoCapableFeedUrl(feedUrl) {
  const parsed = parseHttpUrl(feedUrl);
  if (!parsed) return false;
  const host = hostOf(parsed);
  if (host === 'youtu.be') return true;
  return VIDEO_FEED_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function youtubeIdFromUrl(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  const host = hostOf(parsed);
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return isYoutubeId(id) ? id : null;
  }
  if (!isYoutubeHost(host)) return null;
  const fromQuery = parsed.searchParams.get('v');
  if (isYoutubeId(fromQuery)) return fromQuery;
  const parts = parsed.pathname.split('/').filter(Boolean);
  const markers = new Set(['shorts', 'embed', 'live', 'v', 'watch']);
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (markers.has(parts[index]) && isYoutubeId(parts[index + 1])) return parts[index + 1];
  }
  return null;
}

function isVimeoVideo(parsed) {
  const host = hostOf(parsed);
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return false;
  return /\/(?:video\/)?\d{6,12}(?:\/|$)/.test(`${parsed.pathname}/`);
}

function isRumbleVideo(parsed) {
  if (hostOf(parsed) !== 'rumble.com') return false;
  return /^\/(?:embed\/)?v[0-9a-z]+/i.test(parsed.pathname);
}

function isTikTokVideo(parsed) {
  const host = hostOf(parsed);
  if (host !== 'tiktok.com' && !host.endsWith('.tiktok.com')) return false;
  return /\/video\/\d+/.test(parsed.pathname);
}

function isInstagramVideo(parsed) {
  if (hostOf(parsed) !== 'instagram.com') return false;
  return /^\/(?:reel|reels|tv)\//i.test(parsed.pathname);
}

function isDailymotionVideo(parsed) {
  const host = hostOf(parsed);
  if (host === 'dai.ly') return /^\/[a-z0-9]+$/i.test(parsed.pathname);
  if (host !== 'dailymotion.com') return false;
  return /^\/video\/[a-z0-9]+/i.test(parsed.pathname);
}

function isDirectVideoFile(parsed) {
  return VIDEO_FILE.test(parsed.pathname);
}

function isDirectAudioFile(parsed) {
  return AUDIO_FILE.test(parsed.pathname);
}

function isRecognizedVideoPage(parsed) {
  return Boolean(youtubeIdFromUrl(parsed.href) || isVimeoVideo(parsed) || isRumbleVideo(parsed) || isTikTokVideo(parsed) || isInstagramVideo(parsed) || isDailymotionVideo(parsed));
}

export function isRecognizedVideoUrl(value) {
  const parsed = parseHttpUrl(value);
  if (!parsed) return false;
  return isRecognizedVideoPage(parsed) || isDirectVideoFile(parsed);
}

function mediaField(entry, name) {
  if (!entry || typeof entry !== 'object') return '';
  const direct = entry[name];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = entry.$ && entry.$[name];
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return '';
}

function classifyMediaEntry(entry) {
  const url = mediaField(entry, 'url') || mediaField(entry, 'href');
  const parsed = parseHttpUrl(url);
  if (!parsed) return 'unknown';
  const mime = mediaField(entry, 'type').split(';')[0].trim().toLowerCase();
  const medium = mediaField(entry, 'medium').trim().toLowerCase();
  if (mime.startsWith('image/') || medium === 'image') return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/') || medium === 'video') return 'video';
  if (medium === 'audio') return 'audio';
  if (isRecognizedVideoPage(parsed) || isDirectVideoFile(parsed)) return 'video';
  if (isDirectAudioFile(parsed)) return 'audio';
  return 'unknown';
}

function pushRawMedia(out, entry) {
  const url = mediaField(entry, 'url') || mediaField(entry, 'href');
  if (!url) return;
  out.push({
    url,
    type: mediaField(entry, 'type'),
    medium: mediaField(entry, 'medium'),
  });
}

/**
 * Compact video/audio metadata copied off a parsed RSS item.
 * Image enclosures and description HTML are ignored.
 */
export function extractRssMedia(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return [];
  const raw = [];
  const enclosure = rawItem.enclosure;
  if (Array.isArray(enclosure)) enclosure.forEach((entry) => pushRawMedia(raw, entry));
  else pushRawMedia(raw, enclosure);

  const mediaContent = rawItem['media:content'];
  if (Array.isArray(mediaContent)) mediaContent.forEach((entry) => pushRawMedia(raw, entry));
  else pushRawMedia(raw, mediaContent);

  const links = Array.isArray(rawItem.links) ? rawItem.links : [];
  for (const link of links) {
    const rel = String(link?.rel || '').toLowerCase();
    const type = String(link?.type || '').toLowerCase();
    if (rel === 'enclosure' || type.startsWith('video/') || type.startsWith('audio/')) {
      pushRawMedia(raw, { url: link.href || link.url, type: link.type, medium: '' });
    }
  }

  const stored = [];
  const seen = new Set();
  for (const entry of raw) {
    const kind = classifyMediaEntry(entry);
    if (kind !== 'video' && kind !== 'audio') continue;
    const url = entry.url.trim();
    if (seen.has(url)) continue;
    seen.add(url);
    stored.push({
      url,
      type: entry.type.toLowerCase(),
      medium: entry.medium.toLowerCase(),
    });
  }
  return stored;
}

function youtubeUrlFromSourceId(sourceId) {
  if (typeof sourceId !== 'string') return null;
  const trimmed = sourceId.trim();
  if (!trimmed) return null;
  const fromUrl = youtubeIdFromUrl(trimmed);
  if (fromUrl) return `https://www.youtube.com/watch?v=${fromUrl}`;
  const prefixed = trimmed.match(/(?:^|[^\w-])yt:video:([a-zA-Z0-9_-]{11})(?:[^\w-]|$)/);
  if (prefixed) return `https://www.youtube.com/watch?v=${prefixed[1]}`;
  return null;
}

function mediaList(item) {
  return Array.isArray(item?.media) ? item.media : [];
}

export function videoDestinationFor(item) {
  if (!item || typeof item !== 'object') return null;
  if (isRecognizedVideoUrl(item.url)) return String(item.url).trim();
  const fromSource = youtubeUrlFromSourceId(item.sourceId);
  if (fromSource) return fromSource;
  for (const entry of mediaList(item)) {
    if (classifyMediaEntry(entry) === 'video' && entry.url) return entry.url;
  }
  return null;
}

function hasAudioMedia(item) {
  return mediaList(item).some((entry) => classifyMediaEntry(entry) === 'audio');
}

export function isProtestArchiveItem(item) {
  return item?.isProtestMusic === true || item?.sourceType === 'protest-music';
}

export function classifyArchiveMedia(item) {
  if (isProtestArchiveItem(item)) {
    return { kind: 'music', destination: typeof item?.url === 'string' ? item.url : null };
  }
  const destination = videoDestinationFor(item);
  if (destination) return { kind: 'video', destination };
  if (hasAudioMedia(item)) return { kind: 'audio', destination: null };
  return { kind: 'article', destination: null };
}

export function isVerifiedArchiveVideo(item) {
  return classifyArchiveMedia(item).kind === 'video';
}

/** Protest music stays. Everything else must be a verified video. */
export function selectItemsForTelescreenArchive(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => isProtestArchiveItem(item) || isVerifiedArchiveVideo(item));
}

export function selectTelescreenVoices(voices, { videoSlugs = [], selectedSlug = null } = {}) {
  const slugs = new Set(
    (Array.isArray(videoSlugs) ? videoSlugs : [])
      .map((slug) => String(slug || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const selected = String(selectedSlug || '').trim().toLowerCase();
  return (Array.isArray(voices) ? voices : []).filter((voice) => {
    const slug = String(voice?.slug || '').trim().toLowerCase();
    if (selected && slug === selected) return true;
    if (slug && slugs.has(slug)) return true;
    return isVideoCapableFeedUrl(voice?.feedUrl);
  });
}
