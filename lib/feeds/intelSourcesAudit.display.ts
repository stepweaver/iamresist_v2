/**
 * Public Sources page placement.
 * Only active, configured sources are shown. Retired desks, disabled
 * placeholders, and Congress.gov rows that are waiting on CONGRESS_GOV_API_KEY
 * stay in the manifest and the database, and are omitted here.
 * Historical source_items are not deleted by this filter.
 */

export const CONGRESS_GOV_SOURCE_SLUGS = [
  'congress-bills-recent',
  'congress-committee-meetings-house',
  'congress-committee-meetings-senate',
  'congress-summaries',
  'congress-house-votes',
  'congress-crs-reports',
] as const;

const CONGRESS_GOV_SLUGS = new Set<string>(CONGRESS_GOV_SOURCE_SLUGS);

/** Previously removed from the public audit. Keep them out of the directory. */
const HIDDEN_PUBLIC_SLUGS = new Set([
  'indicator-pentagon-pizza',
  'sam-gov-contracting',
  'uncovering-epstein-network',
]);

const ACTIVE_LANES = new Set(['osint', 'watchdogs']);

export type PublicAuditPlacement = 'active' | 'hidden';

export function isCongressGovSource(slug: string | null | undefined): boolean {
  return typeof slug === 'string' && CONGRESS_GOV_SLUGS.has(slug);
}

export function publicAuditPlacement(input: {
  slug: string;
  deskLane: string | null | undefined;
  manifestEnabled: boolean;
}): PublicAuditPlacement {
  if (!input.manifestEnabled) return 'hidden';
  if (HIDDEN_PUBLIC_SLUGS.has(input.slug)) return 'hidden';
  const lane = String(input.deskLane || '');
  if (lane === 'voices' || lane === 'defense_ops' || lane === 'statements') return 'hidden';
  if (isCongressGovSource(input.slug) && !input.manifestEnabled) return 'hidden';
  if (ACTIVE_LANES.has(lane)) return 'active';
  return 'hidden';
}
