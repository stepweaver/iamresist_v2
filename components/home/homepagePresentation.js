/** Presentation caps for the editorial front page. Upstream ranking is unchanged. */

export const HOME_BRIEFING_STORY_LIMIT = 3;
export const HOME_TELESCREEN_VIDEO_LIMIT = 2;
export const HOME_PROTEST_MUSIC_LIMIT = 1;

export function takeLeadingBriefingStories(items, limit = HOME_BRIEFING_STORY_LIMIT) {
  const list = Array.isArray(items) ? items : [];
  const cap = Number.isFinite(limit) && limit > 0 ? limit : list.length;
  return list.slice(0, cap);
}

export function creatorKeyForVideo(item) {
  const voice = item?.voice || {};
  const name = String(voice.slug || voice.id || voice.name || '').trim().toLowerCase();
  if (name) return name;
  if (item?.sourceType) return String(item.sourceType);
  return String(item?.id || item?.url || 'unknown');
}

/** First `limit` videos in ranked order, skipping a later video from a creator already shown. */
export function takeDistinctCreatorVideos(items, limit = HOME_TELESCREEN_VIDEO_LIMIT) {
  const cap = Number.isFinite(limit) && limit > 0 ? limit : 0;
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const key = creatorKeyForVideo(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Prefer an in-progress book, then the first shelf book in the existing list order.
 * A Reading status is not required.
 */
export function selectFeaturedShelfBook(books) {
  const list = (Array.isArray(books) ? books : []).filter((book) => book && book.slug);
  if (!list.length) return null;
  return list.find((book) => book.status === 'Reading') || list[0];
}
