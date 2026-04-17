import { polishFeedCardImageUrl } from '@/lib/feeds/feedItemImage.js';

/**
 * Haaretz RSS often ships very small CDN thumbs via width/height params.
 * Upgrade the feed-native URL first; only fall back to text-only if it stays tiny.
 */

/** Haaretz thumbs often use haarets.co.il CDN; article pages use .co.il / .com. */
const HARETZ_HOST_RE = /(haarets\.co\.il|haaretz\.co\.il|haaretz\.com|haaretz\.co\.uk)/i;

/**
 * @param {string | null | undefined} imageUrl
 * @param {string | undefined} sourceSlug
 * @returns {boolean}
 */
export function isTinyHaaretzRssThumb(imageUrl, sourceSlug) {
  if (!imageUrl || sourceSlug !== 'haaretz') return false;
  if (!HARETZ_HOST_RE.test(imageUrl)) return false;
  try {
    const u = new URL(imageUrl);
    const w = parseInt(u.searchParams.get('width') || '0', 10);
    const h = parseInt(u.searchParams.get('height') || '0', 10);
    if (w > 0 && w <= 480) return true;
    if (h > 0 && h <= 360) return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * Normalize tiny Haaretz thumbs before any slower article-image fallback runs.
 * @param {Array<{ image?: string | null, sourceSlug?: string }>} stories
 */
export function dropTinyHaaretzThumbsForOgEnrichment(stories) {
  if (!Array.isArray(stories)) return;
  for (const s of stories) {
    if (s?.image && isTinyHaaretzRssThumb(s.image, s.sourceSlug)) {
      const upgraded = polishFeedCardImageUrl(s.image);
      s.image = upgraded && !isTinyHaaretzRssThumb(upgraded, s.sourceSlug) ? upgraded : null;
    }
  }
}
