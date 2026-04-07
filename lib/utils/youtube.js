/**
 * Extract YouTube video ID from watch/shorts/youtu.be URL, sourceId (e.g. yt:video:VIDEO_ID), or null.
 * Order matches RSS `youtubeThumbFromUrl` so `watch?a=1&v=…` and other query shapes resolve.
 */
export function getYoutubeVideoId(url, sourceId = null) {
  if (url && typeof url === 'string') {
    const u = url.trim();
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const re of patterns) {
      const m = u.match(re);
      if (m?.[1]) return m[1];
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(u)) return u;
  }
  if (sourceId && typeof sourceId === 'string') {
    if (/^[a-zA-Z0-9_-]{11}$/.test(sourceId)) return sourceId;
    const ytMatch = sourceId.match(/yt:video:([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return ytMatch[1];
    const urlMatch = sourceId.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (urlMatch) return urlMatch[1];
    const urlMatch2 = sourceId.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (urlMatch2) return urlMatch2[1];
  }
  return null;
}

/** Primary thumb URL (hq). */
export function youtubeThumbnailUrl(url, sourceId = null) {
  const id = getYoutubeVideoId(url, sourceId);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/**
 * Ordered fallbacks when hqdefault 404s or is a grey placeholder for some videos.
 * Matches source intent: try multiple i.ytimg.com variants (see VoiceFeedCard reliability).
 */
export function youtubeThumbnailCandidates(url, sourceId = null) {
  const id = getYoutubeVideoId(url, sourceId);
  if (!id) return [];
  return [
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/default.jpg`,
  ];
}
