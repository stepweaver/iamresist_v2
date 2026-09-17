/**
 * Legacy core reclassification.
 *
 * Historical identityClass=core rows may predate Theme Identity Integrity.
 * Reconstruct a stable core from the original seed, then evaluate other
 * legacy cores against CURRENT admission rules. Rejected members never
 * enter the fingerprint used for later members.
 *
 * Dry-run is report-only. Guarded apply mutates DOWNGRADE_CONTEXTUAL
 * memberships only: identity metadata, never row identity or membership history.
 */
import { scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import { THEME_SIGNAL_FORMULAS } from '@/lib/themeMemory/constants';
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
import { distinctReportingSources } from '@/lib/themeMemory/signals';
import { themeItemKey } from '@/lib/themeMemory/store';
import type { ThemeFingerprint, ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';

export const THEME_RECLASSIFY_VERSION = 'tm-reclassify-legacy-core-v1';
export const THEME_RECLASSIFY_REQUIRED_RANKING_MODE = 'shadow';

export const THEME_RECLASSIFY_WRITE_BLOCKED =
  'Theme membership reclassification is dry-run only; database writes are blocked';
export const THEME_RECLASSIFY_DRY_RUN_REQUIRED =
  'Refusing to run without --dry-run or --apply. Zero writes.';
export const THEME_RECLASSIFY_BOTH_MODES =
  'Refusing to run with both --apply and --dry-run. Zero writes.';
export const THEME_RECLASSIFY_EXPECTED_DOWNGRADES_REQUIRED =
  'Refusing apply: --expected-downgrades is required. Zero writes.';
export const THEME_RECLASSIFY_EXPECTED_DOWNGRADES_INVALID =
  'Refusing apply: --expected-downgrades must be a non-negative integer. Zero writes.';
export const THEME_RECLASSIFY_SHADOW_REQUIRED =
  'Refusing apply: ranking mode must be shadow. Zero writes.';
export const THEME_RECLASSIFY_NON_DOWNGRADE_APPLY_BLOCKED =
  'Refusing apply: mutation plan includes memberships that are not DOWNGRADE_CONTEXTUAL. Zero writes.';
export const THEME_RECLASSIFY_SEED_MUTATION_BLOCKED =
  'Refusing apply: seed memberships cannot be mutated. Zero writes.';
export const THEME_RECLASSIFY_MEMBERSHIP_MISSING =
  'Refusing apply: a proposed downgrade is missing from the snapshot. Zero writes.';
export const THEME_RECLASSIFY_NOT_CORE =
  'Refusing apply: a proposed downgrade is not identityClass=core. Zero writes.';

export function themeReclassifyExpectedMismatch(expected: number, actual: number): string {
  return `Refusing apply: expected ${expected} DOWNGRADE_CONTEXTUAL memberships, found ${actual}. Zero writes.`;
}

export function assertThemeReclassifyMode(input: {
  dryRun?: boolean;
  apply?: boolean;
  expectedDowngrades?: number | null;
}): void {
  if (input.apply && input.dryRun) {
    throw new Error(THEME_RECLASSIFY_BOTH_MODES);
  }
  if (input.apply) {
    if (input.expectedDowngrades == null) {
      throw new Error(THEME_RECLASSIFY_EXPECTED_DOWNGRADES_REQUIRED);
    }
    if (
      Number.isNaN(input.expectedDowngrades) ||
      !Number.isInteger(input.expectedDowngrades) ||
      input.expectedDowngrades < 0
    ) {
      throw new Error(THEME_RECLASSIFY_EXPECTED_DOWNGRADES_INVALID);
    }
    return;
  }
  if (!input.dryRun) {
    throw new Error(THEME_RECLASSIFY_DRY_RUN_REQUIRED);
  }
}

export type ThemeReclassifyProposedClass = 'KEEP_CORE' | 'DOWNGRADE_CONTEXTUAL' | 'REVIEW';

export type ThemeSeedResolutionStatus = 'identified' | 'missing' | 'ambiguous' | 'unmatched_seed_key';

export type ThemeSeedResolution = {
  status: ThemeSeedResolutionStatus;
  seed: ThemeMembershipRecord | null;
  candidates: ThemeMembershipRecord[];
  reasons: string[];
};

export type ThemeReclassifyCanary = {
  id: string;
  label: string;
  suspicious: Array<{ pattern: RegExp; note: string }>;
};

export const THEME_RECLASSIFY_CANARIES: ThemeReclassifyCanary[] = [
  {
    id: '2cf707d5-8408-462b-86af-50ff1c31cc61',
    label: 'Massie / Hegseth',
    suspicious: [
      { pattern: /spaceballs/i, note: 'Spaceballs item historically attached to the Massie theme' },
      { pattern: /space weapon/i, note: 'Space-weapons vocabulary historically attached to the Massie theme' },
    ],
  },
  {
    id: '791b1e24-506c-48e7-92e3-be788e17bad8',
    label: 'Republican Senate Candidate Cheating',
    suspicious: [
      { pattern: /opioid|oxy/i, note: 'Mike Rogers opioid item historically attached to the Senate-candidate theme' },
      { pattern: /mike rogers/i, note: 'Mike Rogers item historically attached to the Senate-candidate theme' },
      { pattern: /kash patel/i, note: 'Kash Patel item historically attached to the Senate-candidate theme' },
    ],
  },
  {
    id: '5acd9b03-a48d-4781-9af6-fa1321c2f5fd',
    label: 'Supreme Court theme',
    suspicious: [
      {
        pattern: /supreme court|justices?\b|\bruling\b|\bdecision\b/i,
        note: 'Generic court/ruling vocabulary historically attached to the Supreme Court theme',
      },
    ],
  },
];

export type ThemeSignalPreview = {
  creatorBreadth: number;
  creatorItemCount: number;
  newswireSourceCount: number;
  primarySourceCount: number;
  specialistSourceCount: number;
  evidenceDepth: number;
};

export type ThemeReclassifyMembershipResult = {
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
  calibrationNotes: string[];
};

export type ThemeReclassifyThemeResult = {
  themeId: string;
  canonicalLabel: string;
  lifecycle: string;
  seedItem: { membershipId: string; title: string; itemKey: string } | null;
  seedResolution: ThemeSeedResolutionStatus;
  seedReasons: string[];
  currentCoreCount: number;
  proposedCoreCount: number;
  proposedContextualDowngrades: number;
  reviewCount: number;
  memberships: ThemeReclassifyMembershipResult[];
  signalPreview: {
    before: ThemeSignalPreview;
    after: ThemeSignalPreview;
  };
  canary: ThemeReclassifyCanary | null;
  missingCanary: boolean;
  storedMembers: Array<{
    membershipId: string;
    title: string;
    currentIdentityClass: string | null;
    isSeed: boolean;
    calibrationNotes: string[];
  }>;
};

export type ThemeReclassifyWriteStatus = 'success' | 'failed';

export type ThemeReclassifyWriteOutcome = {
  membershipId: string;
  themeId: string;
  themeLabel: string;
  sourceSystem: string;
  sourceSlug: string;
  sourceName: string;
  title: string;
  reasons: string[];
  status: ThemeReclassifyWriteStatus;
  error?: string;
};

export type ThemeReclassifyApplyPlanItem = {
  membershipId: string;
  themeId: string;
  themeLabel: string;
  sourceSystem: string;
  sourceSlug: string;
  sourceName: string;
  title: string;
  reasons: string[];
  isSeed: boolean;
  proposedClass: ThemeReclassifyProposedClass;
  existing: ThemeMembershipRecord;
  next: ThemeMembershipRecord;
};

export type ThemeReclassifyReport = {
  mode: 'dry-run' | 'apply';
  rankingMode: string;
  databaseWrites: number;
  persisted: boolean;
  reclassificationVersion: string;
  plannedWrites: number;
  successfulWrites: number;
  failedWrites: number;
  reviewUntouchedCount: number;
  keepCoreUntouchedCount: number;
  writes: ThemeReclassifyWriteOutcome[];
  themesScanned: number;
  membershipsScanned: number;
  currentCoreMemberships: number;
  keepCoreCount: number;
  downgradeContextualCount: number;
  reviewCount: number;
  themesAffected: number;
  themes: ThemeReclassifyThemeResult[];
  canaries: ThemeReclassifyThemeResult[];
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

function currentIdentityClass(member: ThemeMembershipRecord): string | null {
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

function isVoiceCreator(row: ThemeMembershipRecord): boolean {
  return row.source_system === 'voice' && row.member_role === 'creator';
}

function rankingCoreForPreview(memberships: ThemeMembershipRecord[]): ThemeMembershipRecord[] {
  return memberships.filter((row) => row.metadata?.identityClass === 'core');
}

/**
 * Inspectable ranking-signal preview over a membership set. Not a persisted
 * daily signal. Counts the provided ranking-core set only.
 */
export function previewRankingSignals(memberships: ThemeMembershipRecord[]): ThemeSignalPreview {
  const members = rankingCoreForPreview(memberships);
  const creators = members.filter(isVoiceCreator);
  const newswire = members.filter((row) => row.source_system === 'newswire');
  const primaryRows = members.filter((row) => row.member_role === 'primary');
  const specialistRows = members.filter((row) => row.member_role === 'specialist');
  const reportingRows = members.filter((row) => row.member_role === 'reporting' || row.source_system === 'newswire');
  const primarySourceCount = new Set(primaryRows.map((row) => row.source_slug)).size;
  const specialistSourceCount = new Set(specialistRows.map((row) => row.source_slug)).size;
  const reportingSourceCount = distinctReportingSources(reportingRows);
  return {
    creatorBreadth: new Set(creators.map((row) => row.source_slug)).size,
    creatorItemCount: creators.length,
    newswireSourceCount: distinctReportingSources(newswire),
    primarySourceCount,
    specialistSourceCount,
    evidenceDepth:
      primarySourceCount * THEME_SIGNAL_FORMULAS.EVIDENCE_PRIMARY_WEIGHT +
      specialistSourceCount * THEME_SIGNAL_FORMULAS.EVIDENCE_SPECIALIST_WEIGHT +
      reportingSourceCount * THEME_SIGNAL_FORMULAS.EVIDENCE_REPORTING_WEIGHT,
  };
}

export function overlayProposedCoreMemberships(
  memberships: ThemeMembershipRecord[],
  decisions: ThemeReclassifyMembershipResult[],
): ThemeMembershipRecord[] {
  const byId = new Map(decisions.map((row) => [row.membershipId, row.proposedClass]));
  return memberships.map((row) => {
    const proposed = byId.get(row.id);
    if (!proposed) return row;
    const identityClass = proposed === 'KEEP_CORE' ? 'core' : 'contextual';
    return {
      ...row,
      metadata: {
        ...row.metadata,
        identityClass,
      },
    };
  });
}

function canaryForTheme(themeId: string): ThemeReclassifyCanary | null {
  return THEME_RECLASSIFY_CANARIES.find((row) => row.id === themeId) || null;
}

function calibrationNotesFor(themeId: string, title: string): string[] {
  const canary = canaryForTheme(themeId);
  if (!canary) return [];
  return canary.suspicious.filter((entry) => entry.pattern.test(title)).map((entry) => entry.note);
}

function membershipResult(input: {
  member: ThemeMembershipRecord;
  proposedClass: ThemeReclassifyProposedClass;
  reasons: string[];
  contributedToReconstructedCore: boolean;
  isSeed: boolean;
}): ThemeReclassifyMembershipResult {
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
    calibrationNotes: calibrationNotesFor(input.member.theme_id, input.member.title),
  };
}

function reviewAllCores(input: {
  cores: ThemeMembershipRecord[];
  reasons: string[];
  seedId?: string | null;
}): ThemeReclassifyMembershipResult[] {
  return input.cores.map((member) =>
    membershipResult({
      member,
      proposedClass: 'REVIEW',
      reasons: input.reasons,
      contributedToReconstructedCore: false,
      isSeed: member.id === input.seedId,
    }),
  );
}

export function reclassifyThemeMemberships(
  theme: ThemeRecord,
  memberships: ThemeMembershipRecord[],
): {
  seedResolution: ThemeSeedResolution;
  decisions: ThemeReclassifyMembershipResult[];
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
  const decisions: ThemeReclassifyMembershipResult[] = [];
  let core = seedFp;

  for (const member of ordered) {
    if (member.id === seed.id) {
      decisions.push(
        membershipResult({
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
        membershipResult({
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
      membershipResult({
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

function emptyThemeResult(canary: ThemeReclassifyCanary): ThemeReclassifyThemeResult {
  return {
    themeId: canary.id,
    canonicalLabel: canary.label,
    lifecycle: 'missing',
    seedItem: null,
    seedResolution: 'missing',
    seedReasons: ['canary_theme_not_present'],
    currentCoreCount: 0,
    proposedCoreCount: 0,
    proposedContextualDowngrades: 0,
    reviewCount: 0,
    memberships: [],
    signalPreview: {
      before: {
        creatorBreadth: 0,
        creatorItemCount: 0,
        newswireSourceCount: 0,
        primarySourceCount: 0,
        specialistSourceCount: 0,
        evidenceDepth: 0,
      },
      after: {
        creatorBreadth: 0,
        creatorItemCount: 0,
        newswireSourceCount: 0,
        primarySourceCount: 0,
        specialistSourceCount: 0,
        evidenceDepth: 0,
      },
    },
    canary,
    missingCanary: true,
    storedMembers: [],
  };
}

export function reclassifyLegacyCoreMemberships(input: {
  themes: ThemeRecord[];
  memberships: ThemeMembershipRecord[];
  rankingMode: string;
  databaseWrites?: number;
}): ThemeReclassifyReport {
  const byTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of input.memberships) {
    const list = byTheme.get(row.theme_id) || [];
    list.push(row);
    byTheme.set(row.theme_id, list);
  }

  const themes = [...input.themes].sort((a, b) => a.id.localeCompare(b.id));
  const results: ThemeReclassifyThemeResult[] = [];

  for (const theme of themes) {
    const members = byTheme.get(theme.id) || [];
    const { seedResolution, decisions } = reclassifyThemeMemberships(theme, members);
    const proposed = overlayProposedCoreMemberships(members, decisions);
    const seed = seedResolution.seed;
    results.push({
      themeId: theme.id,
      canonicalLabel: theme.canonical_label,
      lifecycle: theme.lifecycle_status,
      seedItem: seed
        ? { membershipId: seed.id, title: seed.title, itemKey: themeItemKey(seed) }
        : null,
      seedResolution: seedResolution.status,
      seedReasons: seedResolution.reasons,
      currentCoreCount: members.filter(isLegacyCoreMembership).length,
      proposedCoreCount: decisions.filter((row) => row.proposedClass === 'KEEP_CORE').length,
      proposedContextualDowngrades: decisions.filter((row) => row.proposedClass === 'DOWNGRADE_CONTEXTUAL').length,
      reviewCount: decisions.filter((row) => row.proposedClass === 'REVIEW').length,
      memberships: decisions,
      signalPreview: {
        before: previewRankingSignals(members),
        after: previewRankingSignals(proposed),
      },
      canary: canaryForTheme(theme.id),
      missingCanary: false,
      storedMembers: members.map((row) => ({
        membershipId: row.id,
        title: row.title,
        currentIdentityClass: currentIdentityClass(row),
        isSeed: Boolean(seed && seed.id === row.id) || isSeedMembership(row, theme),
        calibrationNotes: calibrationNotesFor(theme.id, row.title),
      })),
    });
  }

  const keepCoreCount = results.reduce((sum, row) => sum + row.memberships.filter((m) => m.proposedClass === 'KEEP_CORE').length, 0);
  const downgradeContextualCount = results.reduce(
    (sum, row) => sum + row.proposedContextualDowngrades,
    0,
  );
  const reviewCount = results.reduce((sum, row) => sum + row.reviewCount, 0);
  const currentCoreMemberships = results.reduce((sum, row) => sum + row.currentCoreCount, 0);

  const canaries = THEME_RECLASSIFY_CANARIES.map((canary) => {
    const found = results.find((row) => row.themeId === canary.id);
    return found ? { ...found, canary } : emptyThemeResult(canary);
  });

  return {
    mode: 'dry-run',
    rankingMode: input.rankingMode,
    databaseWrites: input.databaseWrites ?? 0,
    persisted: false,
    reclassificationVersion: THEME_RECLASSIFY_VERSION,
    plannedWrites: 0,
    successfulWrites: 0,
    failedWrites: 0,
    reviewUntouchedCount: reviewCount,
    keepCoreUntouchedCount: keepCoreCount,
    writes: [],
    themesScanned: themes.length,
    membershipsScanned: input.memberships.length,
    currentCoreMemberships,
    keepCoreCount,
    downgradeContextualCount,
    reviewCount,
    themesAffected: results.filter((row) => row.proposedContextualDowngrades > 0 || row.reviewCount > 0).length,
    themes: results,
    canaries,
  };
}

function previewLine(label: string, before: number, after: number): string {
  return `    ${label}: ${before} -> ${after}`;
}

export function formatThemeReclassifyReport(report: ThemeReclassifyReport): string {
  const lines = [
    'Theme Memory legacy core reclassification',
    '----------------------------------------',
    `Mode: ${report.mode}`,
    `Ranking mode (unchanged): ${report.rankingMode}`,
    `Reclassification version: ${report.reclassificationVersion}`,
    `Database writes: ${report.databaseWrites}`,
    `Persisted: ${report.persisted}`,
    '',
    'Global:',
    `  Themes scanned: ${report.themesScanned}`,
    `  Memberships scanned: ${report.membershipsScanned}`,
    `  Current core memberships: ${report.currentCoreMemberships}`,
    `  KEEP_CORE: ${report.keepCoreCount}`,
    `  DOWNGRADE_CONTEXTUAL: ${report.downgradeContextualCount}`,
    `  REVIEW: ${report.reviewCount}`,
    `  Themes affected: ${report.themesAffected}`,
    `  Planned writes: ${report.plannedWrites}`,
    `  Successful writes: ${report.successfulWrites}`,
    `  Failed writes: ${report.failedWrites}`,
    `  REVIEW untouched: ${report.reviewUntouchedCount}`,
    `  KEEP_CORE untouched: ${report.keepCoreUntouchedCount}`,
    '',
    'Canary themes',
    '-------------',
  ];

  for (const theme of report.canaries) {
    lines.push(`Theme ${theme.themeId} (${theme.canary?.label || theme.canonicalLabel})`);
    if (theme.missingCanary) {
      lines.push('  status: not present in snapshot');
      lines.push('');
      continue;
    }
    pushThemeLines(lines, theme, true);
    lines.push('');
  }

  const affected = report.themes.filter(
    (row) => !row.canary && (row.proposedContextualDowngrades > 0 || row.reviewCount > 0),
  );
  if (affected.length > 0) {
    lines.push('Other affected themes');
    lines.push('---------------------');
    for (const theme of affected) {
      pushThemeLines(lines, theme, false);
      lines.push('');
    }
  }

  if (report.mode === 'apply') {
    lines.push('Changed memberships');
    lines.push('-------------------');
    if (report.writes.length === 0) {
      lines.push('  (none)');
    } else {
      for (const row of report.writes) {
        lines.push(`  membership ${row.membershipId}`);
        lines.push(`    theme: ${row.themeId} (${row.themeLabel})`);
        lines.push(`    source: ${row.sourceSystem}:${row.sourceSlug} (${row.sourceName})`);
        lines.push(`    title: ${row.title}`);
        lines.push('    core -> contextual');
        lines.push(`    reasons: ${row.reasons.join(', ') || 'none'}`);
        lines.push(`    persist: ${row.status}${row.error ? ` (${row.error})` : ''}`);
      }
    }
    lines.push('');
    lines.push('Apply result');
    lines.push('------------');
    lines.push(`  Planned writes: ${report.plannedWrites}`);
    lines.push(`  Successful writes: ${report.successfulWrites}`);
    lines.push(`  Failed writes: ${report.failedWrites}`);
    lines.push(`  REVIEW untouched: ${report.reviewUntouchedCount}`);
    lines.push(`  KEEP_CORE untouched: ${report.keepCoreUntouchedCount}`);
    lines.push(`  Ranking mode: ${report.rankingMode}`);
    lines.push(`  Reclassification version: ${report.reclassificationVersion}`);
  }

  return lines.join('\n').trimEnd();
}

function pushThemeLines(lines: string[], theme: ThemeReclassifyThemeResult, includeMemberships: boolean) {
  lines.push(`  canonical label: ${theme.canonicalLabel}`);
  lines.push(`  lifecycle: ${theme.lifecycle}`);
  lines.push(`  seed item: ${theme.seedItem ? `${theme.seedItem.membershipId} — ${theme.seedItem.title}` : 'none'}`);
  lines.push(`  seed resolution: ${theme.seedResolution}`);
  lines.push(`  current core count: ${theme.currentCoreCount}`);
  lines.push(`  proposed core count: ${theme.proposedCoreCount}`);
  lines.push(`  proposed contextual downgrades: ${theme.proposedContextualDowngrades}`);
  lines.push(`  review count: ${theme.reviewCount}`);
  lines.push('  preview signals (not persisted):');
  lines.push(previewLine('creator breadth', theme.signalPreview.before.creatorBreadth, theme.signalPreview.after.creatorBreadth));
  lines.push(
    previewLine('creator item count', theme.signalPreview.before.creatorItemCount, theme.signalPreview.after.creatorItemCount),
  );
  lines.push(
    previewLine(
      'newswire source count',
      theme.signalPreview.before.newswireSourceCount,
      theme.signalPreview.after.newswireSourceCount,
    ),
  );
  lines.push(
    previewLine('primary source count', theme.signalPreview.before.primarySourceCount, theme.signalPreview.after.primarySourceCount),
  );
  lines.push(
    previewLine(
      'specialist source count',
      theme.signalPreview.before.specialistSourceCount,
      theme.signalPreview.after.specialistSourceCount,
    ),
  );
  lines.push(previewLine('evidence depth', theme.signalPreview.before.evidenceDepth, theme.signalPreview.after.evidenceDepth));
  const storedFlags = theme.storedMembers.filter((row) => row.calibrationNotes.length > 0);
  if (storedFlags.length > 0) {
    lines.push('  historically suspicious stored members:');
    for (const row of storedFlags) {
      lines.push(
        `    ${row.membershipId} [${row.currentIdentityClass || 'unclassified'}] ${row.title} — ${row.calibrationNotes.join('; ')}`,
      );
    }
  }
  if (!includeMemberships && theme.memberships.length === 0) return;
  const rows = includeMemberships
    ? theme.memberships
    : theme.memberships.filter((row) => row.proposedClass !== 'KEEP_CORE' || row.calibrationNotes.length > 0);
  for (const member of rows) {
    lines.push(`  membership ${member.membershipId}`);
    lines.push(`    source: ${member.sourceSystem}:${member.sourceSlug} (${member.sourceName})`);
    lines.push(`    title: ${member.title}`);
    lines.push(`    current identityClass: ${member.currentIdentityClass}`);
    lines.push(`    proposed class: ${member.proposedClass}`);
    lines.push(`    reasons: ${member.reasons.join(', ') || 'none'}`);
    lines.push(`    first_assigned_at: ${member.firstAssignedAt}`);
    lines.push(`    contributed to reconstructed core: ${member.contributedToReconstructedCore}`);
    if (member.calibrationNotes.length > 0) {
      lines.push(`    calibration: ${member.calibrationNotes.join('; ')}`);
    }
  }
}

export function contextualDowngradeMetadata(
  existing: Record<string, unknown>,
  reasons: string[],
  now: string,
): Record<string, unknown> {
  return {
    ...existing,
    identityClass: 'contextual',
    identityReason: 'legacy_reclassified_contextual',
    previousIdentityClass: 'core',
    reclassifiedAt: now,
    reclassificationVersion: THEME_RECLASSIFY_VERSION,
    reclassificationReasons: [...reasons],
  };
}

export function buildThemeReclassifyApplyPlan(input: {
  report: ThemeReclassifyReport;
  memberships: ThemeMembershipRecord[];
  now: string;
}): ThemeReclassifyApplyPlanItem[] {
  const byId = new Map(input.memberships.map((row) => [row.id, row]));
  const labels = new Map(input.report.themes.map((row) => [row.themeId, row.canonicalLabel]));
  const plan: ThemeReclassifyApplyPlanItem[] = [];

  for (const theme of input.report.themes) {
    for (const decision of theme.memberships) {
      if (decision.proposedClass !== 'DOWNGRADE_CONTEXTUAL') continue;
      const existing = byId.get(decision.membershipId);
      if (!existing) {
        throw new Error(`${THEME_RECLASSIFY_MEMBERSHIP_MISSING} (${decision.membershipId})`);
      }
      if (currentIdentityClass(existing) !== 'core') {
        throw new Error(`${THEME_RECLASSIFY_NOT_CORE} (${decision.membershipId})`);
      }
      if (decision.isSeed) {
        throw new Error(`${THEME_RECLASSIFY_SEED_MUTATION_BLOCKED} (${decision.membershipId})`);
      }
      plan.push({
        membershipId: existing.id,
        themeId: existing.theme_id,
        themeLabel: labels.get(existing.theme_id) || theme.canonicalLabel,
        sourceSystem: existing.source_system,
        sourceSlug: existing.source_slug,
        sourceName: existing.source_name,
        title: existing.title,
        reasons: [...decision.reasons],
        isSeed: decision.isSeed,
        proposedClass: decision.proposedClass,
        existing,
        next: {
          ...existing,
          membership_reasons: [...existing.membership_reasons],
          metadata: contextualDowngradeMetadata(existing.metadata, decision.reasons, input.now),
          updated_at: input.now,
        },
      });
    }
  }

  return plan;
}

export function assertThemeReclassifyApplySafety(input: {
  rankingMode: string;
  expectedDowngrades: number;
  report: ThemeReclassifyReport;
  plan: ThemeReclassifyApplyPlanItem[];
}): void {
  if (input.rankingMode !== THEME_RECLASSIFY_REQUIRED_RANKING_MODE) {
    throw new Error(
      `${THEME_RECLASSIFY_SHADOW_REQUIRED} (ranking mode: ${input.rankingMode})`,
    );
  }
  if (input.report.downgradeContextualCount !== input.expectedDowngrades) {
    throw new Error(themeReclassifyExpectedMismatch(input.expectedDowngrades, input.report.downgradeContextualCount));
  }
  if (input.plan.length !== input.expectedDowngrades) {
    throw new Error(themeReclassifyExpectedMismatch(input.expectedDowngrades, input.plan.length));
  }
  if (input.plan.some((row) => row.proposedClass !== 'DOWNGRADE_CONTEXTUAL' || row.isSeed)) {
    throw new Error(THEME_RECLASSIFY_NON_DOWNGRADE_APPLY_BLOCKED);
  }
  const forbidden = new Set(
    input.report.themes.flatMap((theme) =>
      theme.memberships
        .filter((row) => row.proposedClass !== 'DOWNGRADE_CONTEXTUAL')
        .map((row) => row.membershipId),
    ),
  );
  if (input.plan.some((row) => forbidden.has(row.membershipId))) {
    throw new Error(THEME_RECLASSIFY_NON_DOWNGRADE_APPLY_BLOCKED);
  }
}

export function formatThemeReclassifyApplyPlan(input: {
  report: ThemeReclassifyReport;
  plan: ThemeReclassifyApplyPlanItem[];
  expectedDowngrades: number;
}): string {
  const lines = [
    'Theme Memory legacy core reclassification apply plan',
    '----------------------------------------------------',
    `Ranking mode (unchanged): ${input.report.rankingMode}`,
    `Reclassification version: ${THEME_RECLASSIFY_VERSION}`,
    `Expected downgrades: ${input.expectedDowngrades}`,
    `Planned DOWNGRADE_CONTEXTUAL writes: ${input.plan.length}`,
    `KEEP_CORE untouched: ${input.report.keepCoreCount}`,
    `REVIEW untouched: ${input.report.reviewCount}`,
    'REVIEW will not be applied.',
    'KEEP_CORE will not be mutated.',
    'Seeds will not be mutated.',
    '',
    'Planned membership changes',
    '--------------------------',
  ];
  if (input.plan.length === 0) {
    lines.push('  (none)');
  } else {
    for (const row of input.plan) {
      lines.push(`  membership ${row.membershipId}`);
      lines.push(`    theme: ${row.themeId} (${row.themeLabel})`);
      lines.push(`    source: ${row.sourceSystem}:${row.sourceSlug} (${row.sourceName})`);
      lines.push(`    title: ${row.title}`);
      lines.push('    core -> contextual');
      lines.push(`    reasons: ${row.reasons.join(', ') || 'none'}`);
    }
  }
  lines.push('');
  lines.push('Proceeding with writes...');
  return lines.join('\n');
}

export async function persistThemeReclassifyPlan(input: {
  plan: ThemeReclassifyApplyPlanItem[];
  persistMembership: (row: ThemeMembershipRecord) => Promise<unknown>;
}): Promise<ThemeReclassifyWriteOutcome[]> {
  const out: ThemeReclassifyWriteOutcome[] = [];
  for (const item of input.plan) {
    try {
      await input.persistMembership(item.next);
      out.push({
        membershipId: item.membershipId,
        themeId: item.themeId,
        themeLabel: item.themeLabel,
        sourceSystem: item.sourceSystem,
        sourceSlug: item.sourceSlug,
        sourceName: item.sourceName,
        title: item.title,
        reasons: item.reasons,
        status: 'success',
      });
    } catch (error) {
      out.push({
        membershipId: item.membershipId,
        themeId: item.themeId,
        themeLabel: item.themeLabel,
        sourceSystem: item.sourceSystem,
        sourceSlug: item.sourceSlug,
        sourceName: item.sourceName,
        title: item.title,
        reasons: item.reasons,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return out;
}

export function withThemeReclassifyApplyResult(
  report: ThemeReclassifyReport,
  writes: ThemeReclassifyWriteOutcome[],
): ThemeReclassifyReport {
  const successfulWrites = writes.filter((row) => row.status === 'success').length;
  const failedWrites = writes.filter((row) => row.status === 'failed').length;
  return {
    ...report,
    mode: 'apply',
    reclassificationVersion: THEME_RECLASSIFY_VERSION,
    plannedWrites: writes.length,
    successfulWrites,
    failedWrites,
    databaseWrites: successfulWrites,
    persisted: failedWrites === 0,
    reviewUntouchedCount: report.reviewCount,
    keepCoreUntouchedCount: report.keepCoreCount,
    writes,
  };
}
