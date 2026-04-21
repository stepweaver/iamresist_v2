import { computeTrustWarnings } from '@/lib/intel/trustWarnings';
import { whyItMattersStub } from '@/lib/intel/whyItMatters';
import type { SourceItemRow } from '@/lib/intel/db';

export type IntelItemDetailModel = {
  id: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
  fetchedAt: string | null;
  contentUseMode: string | null;
  provenanceClass: string | null;
  sourceName: string | null;
  sourceSlug: string | null;
  deskLane: string | null;
  clusterKeys: Record<string, string>;
  missionTags: string[];
  stateChangeType: string | null;
  whyItMatters: string | null;
  trustBadges: any[];
  trustExplain: string | null;
  trustWarningText: string | null;
  trustWarningMode: string;
  trustWarningLevel: string;
  requiresIndependentVerification: boolean;
};

export function buildIntelItemDetailModel(row: SourceItemRow): IntelItemDetailModel | null {
  if (!row?.id || !row?.title || !row?.canonical_url) return null;

  const s = row.sources;
  const provenanceClass = s?.provenance_class ?? null;
  const missionTags = Array.isArray(row.mission_tags) ? row.mission_tags : [];
  const clusterKeys =
    row.cluster_keys && typeof row.cluster_keys === 'object' && !Array.isArray(row.cluster_keys)
      ? row.cluster_keys
      : {};

  const trust = computeTrustWarnings({
    source: {
      trustWarningMode: s?.trust_warning_mode || 'none',
      trustWarningLevel: s?.trust_warning_level || 'info',
      requiresIndependentVerification: Boolean(s?.requires_independent_verification),
      heroEligibilityMode: s?.hero_eligibility_mode || 'normal',
      trustWarningText: typeof s?.trust_warning_text === 'string' ? s.trust_warning_text : null,
    },
    item: {
      title: row.title,
      summary: row.summary,
      sourceSlug: s?.slug ?? null,
      institutionalArea: typeof row.institutional_area === 'string' ? row.institutional_area : 'unknown',
      missionTags,
      clusterKeys,
    },
  });

  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? null,
    canonicalUrl: row.canonical_url,
    publishedAt: row.published_at ?? null,
    fetchedAt: row.fetched_at ?? null,
    contentUseMode: row.content_use_mode ?? null,
    provenanceClass,
    sourceName: s?.name ?? null,
    sourceSlug: s?.slug ?? null,
    deskLane: (typeof s?.desk_lane === 'string' ? s.desk_lane : null) ?? (row.desk_lane as any) ?? null,
    clusterKeys,
    missionTags,
    stateChangeType: (row.state_change_type as any) ?? null,
    whyItMatters: whyItMattersStub(provenanceClass, row.state_change_type, clusterKeys),
    trustBadges: Array.isArray(trust?.trustBadges) ? trust.trustBadges : [],
    trustExplain: trust?.trustExplain ?? null,
    trustWarningText: trust?.trustWarningText ?? null,
    trustWarningMode: trust?.trustWarningMode ?? 'none',
    trustWarningLevel: trust?.trustWarningLevel ?? 'info',
    requiresIndependentVerification: Boolean(trust?.requiresIndependentVerification),
  };
}

