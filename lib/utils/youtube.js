/**
 * Extract YouTube video ID from watch/shorts/youtu.be URL, sourceId (e.g. yt:video:VIDEO_ID), or null.
 * Matches source `lib/utils.js` behavior for feed deduplication.
 */
export function getYoutubeVideoId(url, sourceId = null) {
  if (url && typeof url === 'string') {
    const m = url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (m) return m[1];
    const vMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vMatch) return vMatch[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  }
  if (sourceId && typeof sourceId === 'string') {
    if (/^[a-zA-Z0-9_-]{11}$/.test(sourceId)) return sourceId;
    const ytMatch = sourceId.match(/yt:video:([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return ytMatch[1];
    const urlMatch = sourceId.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (urlMatch) return urlMatch[1];
  }
  return null;
}

export function youtubeThumbnailUrl(url, sourceId = null) {
  const id = getYoutubeVideoId(url, sourceId);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
