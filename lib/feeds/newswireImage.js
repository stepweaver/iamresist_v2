/**
 * Haaretz RSS often ships ~108×81 CDN thumbs (?width=&height=). Using them as card heroes
 * looks blurry; dropping them lets OG enrichment pull full og:image instead.
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
 * Clears tiny Haaretz thumbs so {@link enrichStoriesWithOgImages} can replace them.
 * @param {Array<{ image?: string | null, sourceSlug?: string }>} stories
 */
export function dropTinyHaaretzThumbsForOgEnrichment(stories) {
  if (!Array.isArray(stories)) return;
  for (const s of stories) {
    if (s?.image && isTinyHaaretzRssThumb(s.image, s.sourceSlug)) {
      s.image = null;
    }
  }
}
