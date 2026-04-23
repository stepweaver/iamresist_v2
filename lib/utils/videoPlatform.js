import { getYoutubeVideoId as getYoutubeVideoIdImpl } from '@/lib/utils/youtube';

function normalizeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const url = new URL(u.trim());
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

/**
 * YouTube passthrough: source of truth remains `lib/utils/youtube.js`.
 * Exposed here so callers can depend on a platform-aware layer.
 */
export function getYoutubeVideoId(url, sourceId = null) {
  return getYoutubeVideoIdImpl(url, sourceId);
}

/**
 * Conservative TikTok post ID extraction.
 * Returns the numeric video/post id or null.
 */
export function getTikTokVideoId(url, sourceId = null) {
  if (sourceId && typeof sourceId === 'string') {
    const s = sourceId.trim();
    if (/^\d{10,}$/.test(s)) return s;
    const m =
      s.match(/tt:video:(\d{10,})/i) ||
      s.match(/tiktok:video:(\d{10,})/i) ||
      s.match(/tiktok:(\d{10,})/i);
    if (m?.[1]) return m[1];
  }

  if (!url || typeof url !== "string") return null;
  const raw = url.trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = (parsed.hostname || '').toLowerCase();
  if (host !== 'tiktok.com' && !host.endsWith('.tiktok.com')) return null;

  const pathname = parsed.pathname || '';

  // Canonical post URL:
  // https://www.tiktok.com/@username/video/1234567890123456789
  {
    const m = pathname.match(/^\/@[^/]+\/video\/(\d{10,})/);
    if (m?.[1]) return m[1];
  }

  // Official iframe player URL:
  // https://www.tiktok.com/player/v1/1234567890123456789
  {
    const m = pathname.match(/^\/player\/v1\/(\d{10,})/);
    if (m?.[1]) return m[1];
  }

  // Shortlink case: https://www.tiktok.com/t/...
  // We intentionally do not resolve these here (would require network).
  return null;
}

export function detectVideoPlatform(url, sourceId = null) {
  const yt = getYoutubeVideoId(url, sourceId);
  if (yt) return 'youtube';
  const tt = getTikTokVideoId(url, sourceId);
  if (tt) return 'tiktok';
  return null;
}

/**
 * Canonical key for dedupe / equality checks.
 * - YouTube => yt:<id>
 * - TikTok  => tt:<id>
 * - else    => url:<normalized-url> (or null)
 */
export function getCanonicalVideoKey(url, sourceId = null) {
  const yt = getYoutubeVideoId(url, sourceId);
  if (yt) return `yt:${yt}`;
  const tt = getTikTokVideoId(url, sourceId);
  if (tt) return `tt:${tt}`;
  const normalized = normalizeUrl(url);
  return normalized ? `url:${normalized}` : null;
}

/** Matches existing YouTube embed params in `InlinePlayerModalClean.jsx`. */
export function buildYouTubeEmbedUrl(videoId, origin = '') {
  if (!videoId) return '';
  const params = new URLSearchParams({
    autoplay: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
  });

  if (origin) params.set('origin', origin);

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function buildTikTokEmbedUrl(postId) {
  if (!postId) return '';
  return `https://www.tiktok.com/player/v1/${postId}`;
}

