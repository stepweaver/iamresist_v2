/**
 * Reusable legacy-core identity evaluation.
 *
 * Ranking and diagnostics use this to detect unresolved REVIEW state.
 * CLI/report/apply code lives in reclassify.ts and must not be imported
 * from the ranking path.
 *
 * Evaluation is in-memory and deterministic. Fail closed: if identity
 * cannot be reconstructed, the theme is quarantined from ranking.
 */
import { scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import {
  alignedFeaturesFromMember,
  canExpandThemeCore,
  hasEventSpecificCoreIdentity,
  hasHardEventEvidence,
  identityClassForAttachment,
  isSeedMembership,
} from '@/lib/themeMemory/identity';
import {
  extractThemeFingerprint,
  fingerprintFromMembership,
  mergeFingerprints,
} from '@/lib/themeMemory/features';
import { themeItemKey } from '@/lib/themeMemory/store';
import type { ThemeFingerprint, ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';

export type ThemeReclassifyProposedClass = 'KEEP_CORE' | 'DOWNGRADE_CONTEXTUAL' | 'REVIEW';

export type ThemeSeedResolutionStatus = 'identified' | 'missing' | 'ambiguous' | 'unmatched_seed_key';

export type ThemeSeedResolution = {
  status: ThemeSeedResolutionStatus;
  seed: ThemeMembershipRecord | null;
  candidates: ThemeMembershipRecord[];
  reasons: string[];
};

export type ThemeLegacyClassDecision = {
  membershipId: string;
  themeId: string;
  sourceSystem: string;
  sourceSlug: string;
  sourceName: string;
  title: string;
  currentIdentityClass: string | null;
  proposedClass: ThemeReclassifyProposedClass;
  reasons: string[];
  firstAssignedAt: string;
  itemObservedAt: string;
  contributedToReconstructedCore: boolean;
  isSeed: boolean;
};

export const THEME_LEGACY_REVIEW_QUARANTINE = 'unresolved_legacy_review';
export const THEME_LEGACY_REVIEW_EVALUATION_FAILED = 'legacy_review_evaluation_failed';

export type ThemeLegacyReviewQuarantine = {
  themeId: string;
  quarantined: boolean;
  quarantineReason: string | null;
  reviewMembershipCount: number;
  coreMembershipCount: number;
  reviewReasons: string[];
};

function uniqueById(rows: ThemeMembershipRecord[]): ThemeMembershipRecord[] {
  const seen = new Set<string>();
  const out: ThemeMembershipRecord[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function currentIdentityClass(member: ThemeMembershipRecord): string | null {
  const value = member.metadata?.identityClass;
  return typeof value === 'string' ? value : null;
}

export function isLegacyCoreMembership(member: ThemeMembershipRecord): boolean {
  return currentIdentityClass(member) === 'core';
}

function seedMarkerReasons(
  member: ThemeMembershipRecord,
  theme: Pick<ThemeRecord, 'metadata'>,
): string[] {
  const reasons: string[] = [];
  const seededKey = theme.metadata?.seededItemKey;
  if (typeof seededKey === 'string' && seededKey === themeItemKey(member)) {
    reasons.push('seededItemKey');
  }
  if (member.membership_reasons.includes('seeded_creator_led_theme')) {
    reasons.push('seeded_creator_led_theme');
  }
  if (member.metadata?.identityReason === 'seed') {
    reasons.push('identityReason=seed');
  }
  return reasons;
}

/**
 * Identify the original creator seed without guessing the earliest creator.
 * Ambiguous or missing seeds fail open to REVIEW.
 */
export function resolveThemeSeed(theme: ThemeRecord, memberships: ThemeMembershipRecord[]): ThemeSeedResolution {
  const seededKey = typeof theme.metadata?.seededItemKey === 'string' ? String(theme.metadata.seededItemKey) : null;
  const marked = uniqueById(memberships.filter((row) => isSeedMembership(row, theme)));
  const keyed = seededKey ? memberships.filter((row) => themeItemKey(row) === seededKey) : [];

  if (seededKey && keyed.length === 0) {
    return {
      status: 'unmatched_seed_key',
      seed: null,
      candidates: marked,
      reasons: [`seededItemKey:${seededKey}`, 'seededItemKey_unmatched'],
    };
  }

  if (marked.length === 1) {
    return {
      status: 'identified',
      seed: marked[0],
      candidates: marked,
      reasons: seedMarkerReasons(marked[0], theme),
    };
  }

  if (marked.length > 1) {
    return {
      status: 'ambiguous',
      seed: null,
      candidates: marked,
      reasons: ['multiple_seed_markers', ...marked.map((row) => `seed_candidate:${row.id}`)],
    };
  }

  return {
    status: 'missing',
    seed: null,
    candidates: [],
    reasons: ['seed_not_identified'],
  };
}

export function fingerprintIsStableIdentity(fp: ThemeFingerprint): boolean {
  return (
    fp.distinctiveTokens.length > 0 || fp.phrases.length > 0 || Object.keys(fp.clusterKeys).length > 0
  );
}

export function reconstructedCoreFromSeed(theme: ThemeRecord, seed: ThemeMembershipRecord): ThemeFingerprint {
  const seedFp = fingerprintFromMembership(seed);
  const labelFp = extractThemeFingerprint({
    title: theme.canonical_label,
    summary: theme.summary,
  });
  return mergeFingerprints([seedFp, alignedFeaturesFromMember(labelFp, seedFp)]);
}

function timestampMs(value: string | null | undefined): number {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function scoreAgainstCore(input: {
  member: ThemeMembershipRecord;
  core: ThemeFingerprint;
  theme: ThemeRecord;
}) {
  return scoreThemeCandidate({
    item: fingerprintFromMembership(input.member),
    theme: input.core,
    themeRecord: input.theme,
    itemObservedAt: input.member.item_observed_at,
  });
}

/**
 * Seed first, then members that already have event-specific overlap with the
 * seed, then chronological first_assigned_at / item_observed_at.
 */
export function sortLegacyCoreMembers(
  theme: ThemeRecord,
  seed: ThemeMembershipRecord,
  members: ThemeMembershipRecord[],
): ThemeMembershipRecord[] {
  const seedFp = reconstructedCoreFromSeed(theme, seed);
  return [...members].sort((a, b) => {
    const aSeed = a.id === seed.id ? 0 : 1;
    const bSeed = b.id === seed.id ? 0 : 1;
    if (aSeed !== bSeed) return aSeed - bSeed;
    const aAligned = hasEventSpecificCoreIdentity(scoreAgainstCore({ member: a, core: seedFp, theme })) ? 0 : 1;
    const bAligned = hasEventSpecificCoreIdentity(scoreAgainstCore({ member: b, core: seedFp, theme })) ? 0 : 1;
    if (aAligned !== bAligned) return aAligned - bAligned;
    const assigned = timestampMs(a.first_assigned_at) - timestampMs(b.first_assigned_at);
    if (assigned !== 0) return assigned;
    const observed = timestampMs(a.item_observed_at) - timestampMs(b.item_observed_at);
    if (observed !== 0) return observed;
    return a.id.localeCompare(b.id);
  });
}

function classDecision(input: {
  member: ThemeMembershipRecord;
  proposedClass: ThemeReclassifyProposedClass;
  reasons: string[];
  contributedToReconstructedCore: boolean;
  isSeed: boolean;
}): ThemeLegacyClassDecision {
  return {
    membershipId: input.member.id,
    themeId: input.member.theme_id,
    sourceSystem: input.member.source_system,
    sourceSlug: input.member.source_slug,
    sourceName: input.member.source_name,
    title: input.member.title,
    currentIdentityClass: currentIdentityClass(input.member),
    proposedClass: input.proposedClass,
    reasons: input.reasons,
    firstAssignedAt: input.member.first_assigned_at,
    itemObservedAt: input.member.item_observed_at,
    contributedToReconstructedCore: input.contributedToReconstructedCore,
    isSeed: input.isSeed,
  };
}

function reviewAllCores(input: {
  cores: ThemeMembershipRecord[];
  reasons: string[];
  seedId?: string | null;
}): ThemeLegacyClassDecision[] {
  return input.cores.map((member) =>
    classDecision({
      member,
      proposedClass: 'REVIEW',
      reasons: input.reasons,
      contributedToReconstructedCore: false,
      isSeed: member.id === input.seedId,
    }),
  );
}

/**
 * Reconstruct a stable core from the original seed, then evaluate other
 * legacy cores against current admission rules. Ambiguous identity becomes
 * REVIEW rather than KEEP_CORE or DOWNGRADE_CONTEXTUAL.
 */
export function classifyLegacyCoreMemberships(
  theme: ThemeRecord,
  memberships: ThemeMembershipRecord[],
): {
  seedResolution: ThemeSeedResolution;
  decisions: ThemeLegacyClassDecision[];
} {
  const cores = memberships.filter(isLegacyCoreMembership);
  const seedResolution = resolveThemeSeed(theme, memberships);

  if (seedResolution.status !== 'identified' || !seedResolution.seed) {
    return {
      seedResolution,
      decisions: reviewAllCores({
        cores,
        reasons: ['theme_identity_ambiguous', ...seedResolution.reasons],
      }),
    };
  }

  const seed = seedResolution.seed;
  const seedFp = reconstructedCoreFromSeed(theme, seed);
  if (!fingerprintIsStableIdentity(seedFp)) {
    return {
      seedResolution,
      decisions: reviewAllCores({
        cores,
        reasons: ['insufficient_seed_evidence', 'changing_class_could_remove_only_core_evidence', ...seedResolution.reasons],
        seedId: seed.id,
      }).map((row) =>
        row.membershipId === seed.id
          ? {
              ...row,
              proposedClass: 'KEEP_CORE',
              isSeed: true,
              contributedToReconstructedCore: true,
              reasons: ['seed_preserved', 'insufficient_seed_evidence', ...seedResolution.reasons],
            }
          : row,
      ),
    };
  }

  const labelFp = extractThemeFingerprint({
    title: theme.canonical_label,
    summary: theme.summary,
  });
  if (fingerprintIsStableIdentity(labelFp)) {
    const seedVsLabel = scoreThemeCandidate({
      item: fingerprintFromMembership(seed),
      theme: labelFp,
      themeRecord: theme,
      itemObservedAt: seed.item_observed_at,
    });
    if (!hasEventSpecificCoreIdentity(seedVsLabel)) {
      return {
        seedResolution,
        decisions: reviewAllCores({
          cores,
          reasons: ['theme_identity_ambiguous', 'seed_label_mismatch', ...seedResolution.reasons, ...seedVsLabel.reasons.slice(0, 4)],
          seedId: seed.id,
        }),
      };
    }
  }

  const ordered = sortLegacyCoreMembers(theme, seed, cores);
  const decisions: ThemeLegacyClassDecision[] = [];
  let core = seedFp;

  for (const member of ordered) {
    if (member.id === seed.id) {
      decisions.push(
        classDecision({
          member,
          proposedClass: 'KEEP_CORE',
          reasons: ['seed_preserved', ...seedResolution.reasons],
          contributedToReconstructedCore: true,
          isSeed: true,
        }),
      );
      continue;
    }

    const memberFp = fingerprintFromMembership(member);
    const match = scoreAgainstCore({ member, core, theme });
    const admitted =
      identityClassForAttachment({
        item: { role: member.member_role },
        match,
        seeded: false,
      }) === 'core';
    const expand = admitted && canExpandThemeCore(member, match);

    if (admitted) {
      if (expand) {
        core = mergeFingerprints([core, alignedFeaturesFromMember(memberFp, core)]);
      }
      decisions.push(
        classDecision({
          member,
          proposedClass: 'KEEP_CORE',
          reasons: [
            'event_specific_core_admission',
            expand ? 'expanded_reconstructed_core' : 'keep_core_without_expanding_fingerprint',
            ...match.reasons.slice(0, 6),
          ],
          contributedToReconstructedCore: expand,
          isSeed: false,
        }),
      );
      continue;
    }

    decisions.push(
      classDecision({
        member,
        proposedClass: 'DOWNGRADE_CONTEXTUAL',
        reasons: [
          'fails_event_specific_core_admission',
          ...(hasHardEventEvidence(match) ? [] : ['no_hard_event_evidence']),
          'historical_membership_preserved',
          ...match.reasons.slice(0, 6),
        ],
        contributedToReconstructedCore: false,
        isSeed: false,
      }),
    );
  }

  return { seedResolution, decisions };
}

function uniqueReasons(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Theme-level quarantine from unresolved legacy REVIEW memberships.
 * Fail closed: evaluation errors quarantine the theme.
 */
export function evaluateThemeLegacyReviewQuarantine(
  theme: ThemeRecord,
  memberships: ThemeMembershipRecord[],
): ThemeLegacyReviewQuarantine {
  const coreMembershipCount = 0;
  try {
    const countedCores = memberships.filter(isLegacyCoreMembership).length;
    const { decisions } = classifyLegacyCoreMemberships(theme, memberships);
    const reviews = decisions.filter((row) => row.proposedClass === 'REVIEW');
    if (reviews.length === 0) {
      return {
        themeId: theme.id,
        quarantined: false,
        quarantineReason: null,
        reviewMembershipCount: 0,
        coreMembershipCount: countedCores,
        reviewReasons: [],
      };
    }
    const reviewReasons = uniqueReasons(reviews.flatMap((row) => row.reasons));
    return {
      themeId: theme.id,
      quarantined: true,
      quarantineReason: reviewReasons[0] || THEME_LEGACY_REVIEW_QUARANTINE,
      reviewMembershipCount: reviews.length,
      coreMembershipCount: countedCores,
      reviewReasons,
    };
  } catch {
    return {
      themeId: theme.id,
      quarantined: true,
      quarantineReason: THEME_LEGACY_REVIEW_EVALUATION_FAILED,
      reviewMembershipCount: coreMembershipCount,
      coreMembershipCount,
      reviewReasons: [THEME_LEGACY_REVIEW_EVALUATION_FAILED],
    };
  }
}

/**
 * Evaluate already-loaded themes/memberships in memory. One pass, no I/O.
 */
export function evaluateThemeLegacyReviewQuarantines(
  themes: ThemeRecord[],
  memberships: ThemeMembershipRecord[],
): Map<string, ThemeLegacyReviewQuarantine> {
  const byTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of memberships) {
    const list = byTheme.get(row.theme_id) || [];
    list.push(row);
    byTheme.set(row.theme_id, list);
  }
  const out = new Map<string, ThemeLegacyReviewQuarantine>();
  for (const theme of themes) {
    out.set(theme.id, evaluateThemeLegacyReviewQuarantine(theme, byTheme.get(theme.id) || []));
  }
  return out;
}
