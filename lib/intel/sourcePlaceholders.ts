/**
 * Static desk thumbnails for primary government-document feeds (no OG/RSS art).
 * Paths are under /public/images/intel/.
 */
const PLACEHOLDER_BY_SOURCE_SLUG: Record<string, string> = {
  'fr-published': '/images/intel/placeholder-federal-register.png',
  'fr-public-inspection': '/images/intel/placeholder-federal-register.png',
  'govinfo-bills': '/images/intel/placeholder-govinfo.png',
  'govinfo-crec': '/images/intel/placeholder-govinfo.png',
};

export function intelPlaceholderImagePathForSourceSlug(
  slug: string | undefined | null,
): string | null {
  if (!slug || typeof slug !== 'string') return null;
  return PLACEHOLDER_BY_SOURCE_SLUG[slug] ?? null;
}
