/**
 * Read-only Theme Memory coverage of the live ranking pool.
 *
 * Explains why shadow ranking may show zero theme contribution:
 * membership missing, contextual/unclassified, quarantined cores,
 * identity-key mismatch, or a current core match that was never persisted.
 *
 * Preview matching reuses current deterministic candidate narrowing.
 * It never writes memberships, analyses, signals, or themes.
 */

import { isDeterministicThemeMatch } from '@/lib/themeMemory/candidates';
import { fingerprintFromCandidate } from '@/lib/themeMemory/features';
import {
  excludedByIntelCandidateCap,
  isInsideProcessWindow,
  type ThemeIntelCandidateSaturation,
} from '@/lib/themeMemory/intelSaturation';
import {
  hardEventEvidence,
  identityClassForAttachment,
  matchItemToPlausibleThemeCores,
} from '@/lib/themeMemory/identity';
import { evaluateThemeLegacyReviewQuarantines } from '@/lib/themeMemory/legacyReview';
import { canonicalizeThemeUrl, normalizeIntelThemeCandidate, themeIdentityFromCanonical } from '@/lib/themeMemory/normalize';
import { themeItemKey, type ThemeStore } from '@/lib/themeMemory/store';
import type {
  ThemeCandidateMatch,
  ThemeItemAnalysisRecord,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';
import type { ThemeCandidateItem } from '@/lib/themeMemory/types';

export const THEME_COVERAGE_STATES = [
  'CORE_ELIGIBLE',
  'CORE_QUARANTINED',
  'CONTEXTUAL',
  'UNCLASSIFIED',
  'NO_MEMBERSHIP',
] as const;
export type ThemeCoverageState = (typeof THEME_COVERAGE_STATES)[number];

export const THEME_COVERAGE_PREVIEW_OUTCOMES = [
  'NO_PLAUSIBLE_THEME',
  'PLAUSIBLE_CONTEXTUAL',
  'WOULD_BE_CORE',
  'IDENTITY_LOOKUP_MISMATCH',
] as const;
export type ThemeCoveragePreviewOutcome = (typeof THEME_COVERAGE_PREVIEW_OUTCOMES)[number];

export type ThemeCoverageDeskItem = {
  id: string;
  title?: string | null;
  summary?: string | null;
  canonicalUrl?: string | null;
  url?: string | null;
  sourceSlug?: string | null;
  sourceName?: string | null;
  externalId?: string | null;
  publishedAt?: string | null;
  provenanceClass?: string | null;
  deskLane?: string | null;
  sourceFamily?: string | null;
  clusterKeys?: Record<string, string> | null;
};

export type ThemeCoverageRow = {
  deskItemId: string;
  title: string;
  sourceSlug: string;
  canonicalUrl: string;
  externalId: string | null;
  derivedIdentityKey: string | null;
  persistedMembershipIdentityKey: string | null;
  exactLookupMatched: boolean;
  coverageState: ThemeCoverageState;
  previewOutcome: ThemeCoveragePreviewOutcome | null;
  themeId: string | null;
  themeLabel: string | null;
  themeQuarantined: boolean;
  identityClass: string | null;
  matchReasons: string[];
  hardEventEvidence: string[];
  priorNoMatchAnalysis: boolean | null;
  insideProcessWindow: boolean | null;
  presentInSelectedIntelCandidateSet: boolean | null;
  excludedByCandidateCap: boolean | null;
  alreadyHasAnalysis: boolean | null;
  analysisClassificationVersion: string | null;
};

export type ThemeCoverageWouldBeCore = {
  deskItemId: string;
  title: string;
  candidateThemeId: string;
  candidateThemeLabel: string;
  matchReasons: string[];
  hardEventEvidence: string[];
  priorNoMatchAnalysis: boolean;
};

export type ThemeCoverageCleanCoreOutsidePool = {
  membershipId: string;
  title: string;
  sourceSlug: string;
  identityKey: string;
  canonicalUrl: string;
  themeId: string;
  themeLabel: string;
};

export type ThemeRankingCoverageTotals = {
  deskCandidates: number;
  CORE_ELIGIBLE: number;
  CORE_QUARANTINED: number;
  CONTEXTUAL: number;
  UNCLASSIFIED: number;
  NO_MEMBERSHIP: number;
  WOULD_BE_CORE: number;
  PLAUSIBLE_CONTEXTUAL: number;
  NO_PLAUSIBLE_THEME: number;
  IDENTITY_LOOKUP_MISMATCH: number;
};

export type ThemeRankingCoverageReport = {
  generatedAt: string;
  deskLane: string;
  note: string;
  readOnly: true;
  totals: ThemeRankingCoverageTotals;
  intelSaturation: ThemeIntelCandidateSaturation | null;
  rows: ThemeCoverageRow[];
  wouldBeCore: ThemeCoverageWouldBeCore[];
  cleanIntelCoresNotInPool: ThemeCoverageCleanCoreOutsidePool[];
};

const COVERAGE_NOTE =
  'Read-only Theme Memory coverage of the live ranking pool. No writes. No AI. No ranking-mode change.';

function emptyTotals(): ThemeRankingCoverageTotals {
  return {
    deskCandidates: 0,
    CORE_ELIGIBLE: 0,
    CORE_QUARANTINED: 0,
    CONTEXTUAL: 0,
    UNCLASSIFIED: 0,
    NO_MEMBERSHIP: 0,
    WOULD_BE_CORE: 0,
    PLAUSIBLE_CONTEXTUAL: 0,
    NO_PLAUSIBLE_THEME: 0,
    IDENTITY_LOOKUP_MISMATCH: 0,
  };
}

function deskUrl(item: ThemeCoverageDeskItem): string {
  return String(item.canonicalUrl || item.url || '').trim();
}

function rankingIdentityFromDeskItem(item: ThemeCoverageDeskItem) {
  const canonicalUrl = deskUrl(item);
  const sourceSlug = String(item.sourceSlug || '').trim();
  if (!canonicalUrl || !sourceSlug) return null;
  return themeIdentityFromCanonical({
    sourceSystem: 'intel',
    sourceSlug,
    canonicalUrl,
    externalId: item.externalId ?? null,
  });
}

function membershipIdentityClass(row: ThemeMembershipRecord): string | null {
  const value = row.metadata?.identityClass;
  return typeof value === 'string' ? value : null;
}

function coverageFromExactMembership(input: {
  membership: ThemeMembershipRecord;
  quarantined: boolean;
}): ThemeCoverageState {
  const identityClass = membershipIdentityClass(input.membership);
  if (identityClass === 'core') {
    return input.quarantined ? 'CORE_QUARANTINED' : 'CORE_ELIGIBLE';
  }
  if (identityClass === 'contextual') return 'CONTEXTUAL';
  return 'UNCLASSIFIED';
}

function canonicalUrlKey(url: string | null | undefined): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return (canonicalizeThemeUrl(raw) || raw).toLowerCase();
}

function relatedMembership(input: {
  item: ThemeCoverageDeskItem;
  identity: ReturnType<typeof rankingIdentityFromDeskItem>;
  memberships: ThemeMembershipRecord[];
}): ThemeMembershipRecord | null {
  const identity = input.identity;
  const itemUrl = canonicalUrlKey(deskUrl(input.item));
  for (const row of input.memberships) {
    if (
      identity &&
      row.source_system === identity.sourceSystem &&
      row.source_slug === identity.sourceSlug &&
      row.identity_key === identity.identityKey
    ) {
      continue;
    }
    const rowUrl = canonicalUrlKey(row.canonical_url);
    if (itemUrl && rowUrl && itemUrl === rowUrl) return row;
    if (identity && row.source_system === identity.sourceSystem && row.identity_key === identity.identityKey) {
      return row;
    }
  }
  return null;
}

function deskItemToCandidate(item: ThemeCoverageDeskItem): ThemeCandidateItem | null {
  const canonicalUrl = deskUrl(item);
  if (!canonicalUrl || !item.id) return null;
  return normalizeIntelThemeCandidate({
    id: item.id,
    external_id: item.externalId ?? null,
    canonical_url: canonicalUrl,
    title: String(item.title || '').trim() || 'Untitled',
    summary: item.summary ?? null,
    published_at: item.publishedAt ?? null,
    cluster_keys: item.clusterKeys && typeof item.clusterKeys === 'object' ? item.clusterKeys : {},
    desk_lane: item.deskLane || 'osint',
    sources: {
      slug: item.sourceSlug || 'unknown',
      name: item.sourceName || item.sourceSlug || 'unknown',
      provenance_class: item.provenanceClass ?? null,
      desk_lane: item.deskLane || 'osint',
      source_family: item.sourceFamily ?? null,
    },
  });
}

function previewOutcomeFromMatch(input: {
  item: ThemeCandidateItem;
  match: ThemeCandidateMatch | null;
}): Exclude<ThemeCoveragePreviewOutcome, 'IDENTITY_LOOKUP_MISMATCH'> {
  if (!input.match) return 'NO_PLAUSIBLE_THEME';
  const identityClass = identityClassForAttachment({
    item: { role: input.item.role },
    match: input.match,
    seeded: false,
  });
  if (isDeterministicThemeMatch(input.match) && identityClass === 'core') return 'WOULD_BE_CORE';
  return 'PLAUSIBLE_CONTEXTUAL';
}

function analysisKey(row: Pick<ThemeItemAnalysisRecord, 'source_system' | 'source_slug' | 'identity_key'>): string {
  return themeItemKey(row);
}

function analysisForIdentity(
  identity: { sourceSystem: string; sourceSlug: string; identityKey: string } | null,
  analysesByItem: Map<string, ThemeItemAnalysisRecord>,
): ThemeItemAnalysisRecord | null {
  if (!identity) return null;
  return (
    analysesByItem.get(
      themeItemKey({
        source_system: identity.sourceSystem,
        source_slug: identity.sourceSlug,
        identity_key: identity.identityKey,
      }),
    ) || null
  );
}

function hasPriorNoMatch(
  identity: { sourceSystem: string; sourceSlug: string; identityKey: string } | null,
  analysesByItem: Map<string, ThemeItemAnalysisRecord>,
): boolean {
  return analysisForIdentity(identity, analysesByItem)?.decision === 'no_match';
}

function processGapFields(input: {
  item: ThemeCoverageDeskItem;
  identity: ReturnType<typeof rankingIdentityFromDeskItem>;
  analysesByItem: Map<string, ThemeItemAnalysisRecord>;
  intelSaturation: ThemeIntelCandidateSaturation | null;
}): Pick<
  ThemeCoverageRow,
  | 'insideProcessWindow'
  | 'presentInSelectedIntelCandidateSet'
  | 'excludedByCandidateCap'
  | 'alreadyHasAnalysis'
  | 'analysisClassificationVersion'
> {
  const analysis = analysisForIdentity(input.identity, input.analysesByItem);
  const saturation = input.intelSaturation;
  if (!saturation) {
    return {
      insideProcessWindow: null,
      presentInSelectedIntelCandidateSet: null,
      excludedByCandidateCap: null,
      alreadyHasAnalysis: analysis ? true : input.identity ? false : null,
      analysisClassificationVersion: analysis?.classification_version ?? null,
    };
  }
  const itemTimestamp = input.item.publishedAt || null;
  const insideProcessWindow = isInsideProcessWindow(
    itemTimestamp,
    saturation.windowStart,
    saturation.windowEnd,
  );
  const selectedSet = new Set(saturation.selectedIdentityKeys);
  const presentInSelectedIntelCandidateSet = Boolean(
    input.identity &&
      selectedSet.has(
        themeItemKey({
          source_system: input.identity.sourceSystem,
          source_slug: input.identity.sourceSlug,
          identity_key: input.identity.identityKey,
        }),
      ),
  );
  return {
    insideProcessWindow,
    presentInSelectedIntelCandidateSet,
    excludedByCandidateCap: excludedByIntelCandidateCap({
      insideProcessWindow,
      presentInSelectedSet: presentInSelectedIntelCandidateSet,
      candidateLimitHit: saturation.candidateLimitHit,
      itemTimestamp,
      oldestSelectedAt: saturation.oldestSelectedAt,
    }),
    alreadyHasAnalysis: Boolean(analysis),
    analysisClassificationVersion: analysis?.classification_version ?? null,
  };
}

function countState(rows: ThemeCoverageRow[], state: ThemeCoverageState): number {
  return rows.filter((row) => row.coverageState === state).length;
}

function countPreview(rows: ThemeCoverageRow[], outcome: ThemeCoveragePreviewOutcome): number {
  return rows.filter((row) => row.previewOutcome === outcome).length;
}

/**
 * Pure in-memory coverage audit. Callers must not pass a writing store into this
 * function; it only inspects already-loaded rows.
 */
export function auditThemeRankingCoverage(input: {
  deskItems: ThemeCoverageDeskItem[];
  themes: ThemeRecord[];
  memberships: ThemeMembershipRecord[];
  analyses?: ThemeItemAnalysisRecord[];
  deskLane?: string;
  now?: Date | string;
  intelSaturation?: ThemeIntelCandidateSaturation | null;
}): ThemeRankingCoverageReport {
  const generatedAt = input.now ? new Date(input.now).toISOString() : new Date().toISOString();
  const intelSaturation = input.intelSaturation || null;
  const themesById = new Map(input.themes.map((theme) => [theme.id, theme]));
  const membershipsByTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of input.memberships) {
    const list = membershipsByTheme.get(row.theme_id) || [];
    list.push(row);
    membershipsByTheme.set(row.theme_id, list);
  }
  const exactByItem = new Map<string, ThemeMembershipRecord>();
  for (const row of input.memberships) {
    exactByItem.set(themeItemKey(row), row);
  }
  const quarantines = evaluateThemeLegacyReviewQuarantines(input.themes, input.memberships);
  const cleanThemes = input.themes.filter((theme) => !quarantines.get(theme.id)?.quarantined);
  const analysesByItem = new Map(
    (input.analyses || []).map((row) => [analysisKey(row), row] as const),
  );

  const poolKeys = new Set<string>();
  const rows: ThemeCoverageRow[] = input.deskItems.map((item) => {
    const identity = rankingIdentityFromDeskItem(item);
    if (identity) {
      poolKeys.add(
        themeItemKey({
          source_system: identity.sourceSystem,
          source_slug: identity.sourceSlug,
          identity_key: identity.identityKey,
        }),
      );
    }
    const exact = identity
      ? exactByItem.get(
          themeItemKey({
            source_system: identity.sourceSystem,
            source_slug: identity.sourceSlug,
            identity_key: identity.identityKey,
          }),
        ) || null
      : null;

    if (exact) {
      const theme = themesById.get(exact.theme_id);
      const quarantined = Boolean(quarantines.get(exact.theme_id)?.quarantined);
      const coverageState = coverageFromExactMembership({ membership: exact, quarantined });
      return {
        deskItemId: item.id,
        title: String(item.title || exact.title || '').trim() || 'Untitled',
        sourceSlug: String(item.sourceSlug || identity?.sourceSlug || exact.source_slug),
        canonicalUrl: deskUrl(item) || exact.canonical_url,
        externalId: item.externalId ?? null,
        derivedIdentityKey: identity?.identityKey ?? null,
        persistedMembershipIdentityKey: exact.identity_key,
        exactLookupMatched: true,
        coverageState,
        previewOutcome: null,
        themeId: exact.theme_id,
        themeLabel: theme?.canonical_label ?? null,
        themeQuarantined: quarantined,
        identityClass: membershipIdentityClass(exact),
        matchReasons: [],
        hardEventEvidence: [],
        priorNoMatchAnalysis: null,
        ...processGapFields({ item, identity, analysesByItem, intelSaturation }),
      };
    }

    const related = relatedMembership({ item, identity, memberships: input.memberships });
    if (related) {
      const theme = themesById.get(related.theme_id);
      return {
        deskItemId: item.id,
        title: String(item.title || related.title || '').trim() || 'Untitled',
        sourceSlug: String(item.sourceSlug || identity?.sourceSlug || related.source_slug),
        canonicalUrl: deskUrl(item) || related.canonical_url,
        externalId: item.externalId ?? null,
        derivedIdentityKey: identity?.identityKey ?? null,
        persistedMembershipIdentityKey: related.identity_key,
        exactLookupMatched: false,
        coverageState: 'NO_MEMBERSHIP',
        previewOutcome: 'IDENTITY_LOOKUP_MISMATCH',
        themeId: related.theme_id,
        themeLabel: theme?.canonical_label ?? null,
        themeQuarantined: Boolean(quarantines.get(related.theme_id)?.quarantined),
        identityClass: membershipIdentityClass(related),
        matchReasons: [],
        hardEventEvidence: [],
        priorNoMatchAnalysis: hasPriorNoMatch(identity, analysesByItem),
        ...processGapFields({ item, identity, analysesByItem, intelSaturation }),
      };
    }

    const candidate = deskItemToCandidate(item);
    const matches = candidate
      ? matchItemToPlausibleThemeCores({
          itemFingerprint: fingerprintFromCandidate(candidate),
          themes: cleanThemes,
          membershipsByTheme,
          itemObservedAt: candidate.publishedAt || generatedAt,
        })
      : [];
    const top = matches[0] || null;
    const previewOutcome = candidate
      ? previewOutcomeFromMatch({ item: candidate, match: top })
      : 'NO_PLAUSIBLE_THEME';
    const evidence = top ? hardEventEvidence(top) : [];

    return {
      deskItemId: item.id,
      title: String(item.title || '').trim() || 'Untitled',
      sourceSlug: String(item.sourceSlug || identity?.sourceSlug || 'unknown'),
      canonicalUrl: deskUrl(item),
      externalId: item.externalId ?? null,
      derivedIdentityKey: identity?.identityKey ?? null,
      persistedMembershipIdentityKey: null,
      exactLookupMatched: false,
      coverageState: 'NO_MEMBERSHIP',
      previewOutcome,
      themeId: top?.theme.id ?? null,
      themeLabel: top?.theme.canonical_label ?? null,
      themeQuarantined: false,
      identityClass: null,
      matchReasons: top?.reasons || [],
      hardEventEvidence: evidence,
      priorNoMatchAnalysis: hasPriorNoMatch(identity, analysesByItem),
      ...processGapFields({ item, identity, analysesByItem, intelSaturation }),
    };
  });

  const wouldBeCore: ThemeCoverageWouldBeCore[] = rows
    .filter((row) => row.previewOutcome === 'WOULD_BE_CORE')
    .map((row) => ({
      deskItemId: row.deskItemId,
      title: row.title,
      candidateThemeId: row.themeId || '',
      candidateThemeLabel: row.themeLabel || '',
      matchReasons: row.matchReasons,
      hardEventEvidence: row.hardEventEvidence,
      priorNoMatchAnalysis: Boolean(row.priorNoMatchAnalysis),
    }));

  const cleanIntelCoresNotInPool: ThemeCoverageCleanCoreOutsidePool[] = input.memberships
    .filter((row) => {
      if (row.source_system !== 'intel') return false;
      if (membershipIdentityClass(row) !== 'core') return false;
      if (quarantines.get(row.theme_id)?.quarantined) return false;
      return !poolKeys.has(themeItemKey(row));
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .map((row) => ({
      membershipId: row.id,
      title: row.title,
      sourceSlug: row.source_slug,
      identityKey: row.identity_key,
      canonicalUrl: row.canonical_url,
      themeId: row.theme_id,
      themeLabel: themesById.get(row.theme_id)?.canonical_label || row.theme_id,
    }));

  const totals: ThemeRankingCoverageTotals = {
    deskCandidates: rows.length,
    CORE_ELIGIBLE: countState(rows, 'CORE_ELIGIBLE'),
    CORE_QUARANTINED: countState(rows, 'CORE_QUARANTINED'),
    CONTEXTUAL: countState(rows, 'CONTEXTUAL'),
    UNCLASSIFIED: countState(rows, 'UNCLASSIFIED'),
    NO_MEMBERSHIP: countState(rows, 'NO_MEMBERSHIP'),
    WOULD_BE_CORE: countPreview(rows, 'WOULD_BE_CORE'),
    PLAUSIBLE_CONTEXTUAL: countPreview(rows, 'PLAUSIBLE_CONTEXTUAL'),
    NO_PLAUSIBLE_THEME: countPreview(rows, 'NO_PLAUSIBLE_THEME'),
    IDENTITY_LOOKUP_MISMATCH: countPreview(rows, 'IDENTITY_LOOKUP_MISMATCH'),
  };

  return {
    generatedAt,
    deskLane: input.deskLane || 'osint',
    note: COVERAGE_NOTE,
    readOnly: true,
    totals: rows.length === 0 ? { ...emptyTotals() } : totals,
    intelSaturation,
    rows,
    wouldBeCore,
    cleanIntelCoresNotInPool,
  };
}

export async function loadThemeRankingCoverageAudit(
  store: ThemeStore,
  deskItems: ThemeCoverageDeskItem[],
  opts: {
    deskLane?: string;
    now?: Date | string;
    intelSaturation?: ThemeIntelCandidateSaturation | null;
  } = {},
): Promise<ThemeRankingCoverageReport> {
  const [themes, memberships] = await Promise.all([store.listThemes(), store.listMemberships()]);
  const draft = auditThemeRankingCoverage({
    deskItems,
    themes,
    memberships,
    deskLane: opts.deskLane,
    now: opts.now,
    intelSaturation: opts.intelSaturation,
  });
  const lookupRows = draft.rows.filter(
    (row) => row.coverageState === 'NO_MEMBERSHIP' && row.derivedIdentityKey,
  );
  if (lookupRows.length === 0) return draft;

  const analyses: ThemeItemAnalysisRecord[] = [];
  for (const row of lookupRows) {
    const analysis = await store.getAnalysis({
      source_system: 'intel',
      source_slug: String(row.sourceSlug || 'unknown').toLowerCase(),
      identity_key: row.derivedIdentityKey as string,
    });
    if (analysis) analyses.push(analysis);
  }
  if (analyses.length === 0) return draft;
  return auditThemeRankingCoverage({
    deskItems,
    themes,
    memberships,
    analyses,
    deskLane: opts.deskLane,
    now: opts.now,
    intelSaturation: opts.intelSaturation,
  });
}

function formatFlag(value: boolean | null | undefined): string {
  if (value == null) return 'unknown';
  return value ? 'yes' : 'no';
}

export function formatThemeRankingCoverageReport(report: ThemeRankingCoverageReport): string {
  const t = report.totals;
  const sat = report.intelSaturation;
  const lines = [
    'Theme Memory live desk ranking coverage',
    '=======================================',
    `Lane: ${report.deskLane}`,
    `Generated: ${report.generatedAt}`,
    report.note,
    '',
    'Totals',
    '------',
    `total desk candidates: ${t.deskCandidates}`,
    `CORE_ELIGIBLE: ${t.CORE_ELIGIBLE}`,
    `CORE_QUARANTINED: ${t.CORE_QUARANTINED}`,
    `CONTEXTUAL: ${t.CONTEXTUAL}`,
    `UNCLASSIFIED: ${t.UNCLASSIFIED}`,
    `NO_MEMBERSHIP: ${t.NO_MEMBERSHIP}`,
    `WOULD_BE_CORE preview: ${t.WOULD_BE_CORE}`,
    `PLAUSIBLE_CONTEXTUAL preview: ${t.PLAUSIBLE_CONTEXTUAL}`,
    `NO_PLAUSIBLE_THEME preview: ${t.NO_PLAUSIBLE_THEME}`,
    `IDENTITY_LOOKUP_MISMATCH: ${t.IDENTITY_LOOKUP_MISMATCH}`,
    '',
    'Intel process-window coverage',
    '-----------------------------',
  ];
  if (!sat) {
    lines.push('(not loaded)');
  } else {
    lines.push(
      `available in process window: ${sat.availableInWindow}`,
      `selected for processing: ${sat.selectedForProcessing}`,
      `configured candidate limit: ${sat.candidateLimit}`,
      `candidate limit hit: ${sat.candidateLimitHit ? 'yes' : 'no'}`,
      `newest selected timestamp: ${sat.newestSelectedAt || '(none)'}`,
      `oldest selected timestamp: ${sat.oldestSelectedAt || '(none)'}`,
    );
  }

  lines.push('', 'Identity audit', '--------------');

  for (const row of report.rows) {
    lines.push(
      `- ${row.title}`,
      `    desk item id: ${row.deskItemId}`,
      `    source slug: ${row.sourceSlug}`,
      `    canonical URL: ${row.canonicalUrl || '(none)'}`,
      `    external id: ${row.externalId || '(none)'}`,
      `    derived identity key: ${row.derivedIdentityKey || '(none)'}`,
      `    persisted membership identity key: ${row.persistedMembershipIdentityKey || '(none)'}`,
      `    exact lookup matched: ${row.exactLookupMatched ? 'yes' : 'no'}`,
      `    coverage: ${row.coverageState}${row.previewOutcome ? ` / ${row.previewOutcome}` : ''}`,
    );
    if (row.coverageState === 'NO_MEMBERSHIP') {
      lines.push(
        `    inside process window: ${formatFlag(row.insideProcessWindow)}`,
        `    present in selected Intel candidate set: ${formatFlag(row.presentInSelectedIntelCandidateSet)}`,
        `    excluded by candidate cap: ${formatFlag(row.excludedByCandidateCap)}`,
        `    already has analysis: ${formatFlag(row.alreadyHasAnalysis)}`,
        `    analysis classification version: ${row.analysisClassificationVersion || '(none)'}`,
      );
    }
  }

  lines.push('', 'Clean Intel cores not in ranking pool', '-------------------------------------');
  if (report.cleanIntelCoresNotInPool.length === 0) {
    lines.push('(none)');
  } else {
    for (const row of report.cleanIntelCoresNotInPool) {
      lines.push(`- ${row.title}`);
      lines.push(`    source: ${row.sourceSlug}`);
      lines.push(`    identity: ${row.identityKey}`);
      lines.push(`    theme: ${row.themeLabel}`);
    }
  }

  lines.push('', 'WOULD_BE_CORE preview', '---------------------');
  if (report.wouldBeCore.length === 0) {
    lines.push('(none)');
  } else {
    for (const row of report.wouldBeCore) {
      lines.push(`- ${row.title}`);
      lines.push(`    candidate theme: ${row.candidateThemeLabel}`);
      lines.push(`    deterministic match reasons: ${row.matchReasons.join(', ') || '(none)'}`);
      lines.push(`    hard-event evidence: ${row.hardEventEvidence.join(', ') || '(none)'}`);
      lines.push(`    prior no_match analysis: ${row.priorNoMatchAnalysis ? 'yes' : 'no'}`);
    }
  }

  return lines.join('\n');
}
