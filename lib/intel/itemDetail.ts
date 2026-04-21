import { computeTrustWarnings, type TrustBadge } from '@/lib/intel/trustWarnings';
import { whyItMattersStub } from '@/lib/intel/whyItMatters';
import type { SourceItemRow } from '@/lib/intel/db';
import type {
  DeskLane,
  HeroEligibilityMode,
  ProvenanceClass,
  TrustWarningLevel,
  TrustWarningMode,
} from '@/lib/intel/types';

export type IntelItemDetailModel = {
  id: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
  fetchedAt: string | null;
  contentUseMode: string | null;
  provenanceClass: ProvenanceClass | null;
  sourceName: string | null;
  sourceSlug: string | null;
  deskLane: DeskLane | null;
  clusterKeys: Record<string, string>;
  missionTags: string[];
  stateChangeType: string | null;
  whyItMatters: string | null;
  trustBadges: TrustBadge[];
  trustExplain: string | null;
  trustWarningText: string | null;
  trustWarningMode: TrustWarningMode;
  trustWarningLevel: TrustWarningLevel;
  requiresIndependentVerification: boolean;
};

function parseTrustWarningMode(value: unknown): TrustWarningMode {
  return value === 'source_controlled_official_claims' ? value : 'none';
}

function parseTrustWarningLevel(value: unknown): TrustWarningLevel {
  if (value === 'high' || value === 'caution' || value === 'info') return value;
  return 'info';
}

function parseHeroEligibilityMode(value: unknown): HeroEligibilityMode {
  if (
    value === 'normal' ||
    value === 'demote_low_substance' ||
    value === 'never_hero_without_corroboration'
  ) {
    return value;
  }
  return 'normal';
}

function parseDeskLane(value: unknown): DeskLane | null {
  if (
    value === 'osint' ||
    value === 'voices' ||
    value === 'watchdogs' ||
    value === 'defense_ops' ||
    value === 'indicators' ||
    value === 'statements'
  ) {
    return value;
  }
  return null;
}

function parseProvenanceClass(value: unknown): ProvenanceClass {
  if (
    value === 'PRIMARY' ||
    value === 'WIRE' ||
    value === 'SPECIALIST' ||
    value === 'INDIE' ||
    value === 'COMMENTARY' ||
    value === 'SCHEDULE'
  ) {
    return value;
  }
  return 'WIRE';
}

export function buildIntelItemDetailModel(row: SourceItemRow): IntelItemDetailModel | null {
  if (!row?.id || !row?.title || !row?.canonical_url) return null;

  const s = row.sources;
  const provenanceClass = s?.provenance_class ?? null;
  const missionTags = Array.isArray(row.mission_tags) ? row.mission_tags : [];
  const clusterKeys =
    row.cluster_keys && typeof row.cluster_keys === 'object' && !Array.isArray(row.cluster_keys)
      ? row.cluster_keys
      : {};

  const trustWarningMode = parseTrustWarningMode(s?.trust_warning_mode);
  const trustWarningLevel = parseTrustWarningLevel(s?.trust_warning_level);
  const requiresIndependentVerification = Boolean(s?.requires_independent_verification);
  const heroEligibilityMode = parseHeroEligibilityMode(s?.hero_eligibility_mode);
  const trustWarningText = typeof s?.trust_warning_text === 'string' ? s.trust_warning_text : null;

  const trust = computeTrustWarnings({
    source: {
      trustWarningMode,
      trustWarningLevel,
      requiresIndependentVerification,
      heroEligibilityMode,
      trustWarningText,
    },
    item: {
      title: row.title,
      summary: row.summary,
      sourceSlug: s?.slug ?? '',
      institutionalArea:
        typeof row.institutional_area === 'string' ? row.institutional_area : 'unknown',
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
    deskLane: parseDeskLane(s?.desk_lane) ?? parseDeskLane(row.desk_lane) ?? null,
    clusterKeys,
    missionTags,
    stateChangeType: (row.state_change_type as string | null) ?? null,
    whyItMatters: whyItMattersStub(
      parseProvenanceClass(provenanceClass),
      (row.state_change_type as string | null) ?? 'unknown',
      clusterKeys,
    ),
    trustBadges: Array.isArray(trust?.trustBadges) ? trust.trustBadges : [],
    trustExplain: trust?.trustExplain ?? null,
    trustWarningText,
    trustWarningMode,
    trustWarningLevel,
    requiresIndependentVerification: Boolean(trust?.requires_independent_verification),
  };
}

