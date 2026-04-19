import type { HeroEligibilityMode, TrustWarningLevel, TrustWarningMode } from '@/lib/intel/types';

export type TrustBadgeTone = 'neutral' | 'info' | 'caution' | 'high';

export type TrustBadge = {
  label: 'SOURCE-CONTROLLED' | 'OFFICIAL CLAIM' | 'VERIFY INDEPENDENTLY' | 'CONTESTED CLAIM';
  tone: TrustBadgeTone;
  tooltip: string;
};

export type TrustRuleExplanation = {
  ruleId: string;
  message: string;
};

export type TrustWarningSource = {
  trustWarningMode: TrustWarningMode;
  trustWarningLevel: TrustWarningLevel;
  requiresIndependentVerification: boolean;
  heroEligibilityMode: HeroEligibilityMode;
  trustWarningText: string | null;
};

export type TrustWarningItem = {
  title: string;
  summary: string | null;
  sourceSlug: string;
  institutionalArea: string;
  missionTags: string[];
  clusterKeys: Record<string, string>;
};

export type TrustWarningsResult = {
  official_claim: boolean;
  politically_interested_source: boolean;
  requires_independent_verification: boolean;
  ceremonial_or_low_substance: boolean;
  contested_claim: boolean;
  trustBadges: TrustBadge[];
  trustExplain: string | null;
  trustRuleExplanations: TrustRuleExplanation[];
};

export const BASELINE_INLINE_TRUST_EXPLAIN =
  'Primary source channel is real, but the claims or framing may be strategic or self-protective. Preserve provenance; verify key assertions independently.';

const BASELINE_LANE_TRUST_DISCLOSURE_LANES = new Set(['osint', 'defense_ops']);
const BASELINE_INLINE_TRUST_BADGE_LABELS = new Set([
  'SOURCE-CONTROLLED',
  'OFFICIAL CLAIM',
  'VERIFY INDEPENDENTLY',
]);

function clampTooltip(s: string, max = 220): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function haystack(title: string, summary: string | null): string {
  return `${title}\n${summary ?? ''}`.toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]): RegExp | null {
  for (const re of patterns) {
    if (re.test(text)) return re;
  }
  return null;
}

// Keep in sync with displayPriority.ts intent, but scoped to trust warnings.
const CEREMONIAL_EXECUTIVE_PATTERNS: RegExp[] = [
  /\bnational\s+\w+(?:\s+\w+){0,4}\s+(?:day|week|month)\b/i,
  /\bproclamation\b/i,
  /\bcommemorat/i,
  /\bcelebrat/i,
  /\bhonor(?:ing|s|ed)?\b/i,
  /\bgreeting\b/i,
  /\banniversary\b/i,
  /\bmemorial\b/i,
  /\bholiday\b/i,
];

const ROUTINE_EXECUTIVE_OUTPUT_PATTERNS: RegExp[] = [
  /\b(photo\s+op|photo-op|photo opportunity)\b/i,
  /\bremarks\b/i,
  /\bpool\s+report\b/i,
  /\btranscript\b/i,
];

// Conservative and explicit: contested only when it looks like a dispute/verification story.
const CONTESTED_CLAIM_PATTERNS: RegExp[] = [
  /\bfact[-\s]?check\b/i,
  /\bdebunk/i,
  /\bfalse\s+claim\b/i,
  /\bmisleading\b/i,
  /\bdenies?\b/i,
  /\brebuk/i,
  /\bchalleng(?:e|ed|es)\b/i,
  /\blawsuit\b/i,
  /\bjudge\b/i,
  /\bcourt\s+challenge\b/i,
];

function toneFromLevel(level: TrustWarningLevel): TrustBadgeTone {
  if (level === 'high') return 'high';
  if (level === 'caution') return 'caution';
  return 'info';
}

export function computeTrustWarnings(input: {
  source: TrustWarningSource;
  item: TrustWarningItem;
}): TrustWarningsResult {
  const { source, item } = input;
  const explanations: TrustRuleExplanation[] = [];

  const h = haystack(item.title, item.summary);

  const politically_interested_source = source.trustWarningMode !== 'none';
  const official_claim =
    source.trustWarningMode === 'source_controlled_official_claims' ||
    (item.institutionalArea === 'white_house' && item.sourceSlug.startsWith('wh-'));

  const requires_independent_verification = Boolean(source.requiresIndependentVerification);

  const ceremonialHit =
    hasAny(h, CEREMONIAL_EXECUTIVE_PATTERNS) || hasAny(h, ROUTINE_EXECUTIVE_OUTPUT_PATTERNS);
  const ceremonial_or_low_substance = Boolean(ceremonialHit);

  if (ceremonial_or_low_substance) {
    explanations.push({
      ruleId: 'trust:low_substance_text',
      message: 'Detected ceremonial/routine executive messaging patterns in title/summary.',
    });
  }

  const tags = new Set(Array.isArray(item.missionTags) ? item.missionTags : []);
  const contestedTextHit = hasAny(h, CONTESTED_CLAIM_PATTERNS);
  const contestedTagScope = tags.has('elections') || tags.has('voting_rights') || tags.has('civil_liberties');
  const contested_claim =
    source.trustWarningMode === 'source_controlled_official_claims' &&
    Boolean(contestedTextHit) &&
    contestedTagScope;

  if (contested_claim) {
    explanations.push({
      ruleId: 'trust:contested_claim',
      message: 'Contested-claim label triggered by explicit dispute/verification language (scoped by mission tags).',
    });
  }

  const badges: TrustBadge[] = [];

  if (politically_interested_source) {
    badges.push({
      label: 'SOURCE-CONTROLLED',
      tone: toneFromLevel(source.trustWarningLevel),
      tooltip: clampTooltip(
        source.trustWarningText ||
          'Source-controlled official channel: authentic provenance, but framing/claims may be politically interested.',
      ),
    });
  }

  if (official_claim) {
    badges.push({
      label: 'OFFICIAL CLAIM',
      tone: 'neutral',
      tooltip: 'Official-source messaging surface; treat as a primary claim, not independent verification.',
    });
  }

  if (requires_independent_verification) {
    badges.push({
      label: 'VERIFY INDEPENDENTLY',
      tone: 'caution',
      tooltip: 'Claims or framing should be corroborated with independent sources before treating as settled fact.',
    });
  }

  if (contested_claim) {
    badges.push({
      label: 'CONTESTED CLAIM',
      tone: 'high',
      tooltip:
        'Explicit dispute/verification language detected; treat the claim as contested unless independently corroborated.',
    });
  }

  let trustExplain: string | null = null;
  if (politically_interested_source || requires_independent_verification) {
    trustExplain = BASELINE_INLINE_TRUST_EXPLAIN;
  }

  // If the source sets strict hero behavior, explainability should exist somewhere even when the UI is not showing it.
  if (source.heroEligibilityMode === 'never_hero_without_corroboration') {
    explanations.push({
      ruleId: 'trust:hero_policy',
      message: 'Hero policy: never_hero_without_corroboration (source-level).',
    });
  } else if (source.heroEligibilityMode === 'demote_low_substance') {
    explanations.push({
      ruleId: 'trust:hero_policy',
      message: 'Hero policy: demote_low_substance (source-level).',
    });
  }

  return {
    official_claim,
    politically_interested_source,
    requires_independent_verification,
    ceremonial_or_low_substance,
    contested_claim,
    trustBadges: badges,
    trustExplain,
    trustRuleExplanations: explanations,
  };
}

export function laneHasBaselineTrustDisclosure(deskLane: string | null | undefined): boolean {
  return Boolean(deskLane && BASELINE_LANE_TRUST_DISCLOSURE_LANES.has(deskLane));
}

export function isBaselineLaneTrustExplain(row: {
  trustExplain?: string | null;
  trustBadges?: TrustBadge[] | null;
}): boolean {
  if (!row?.trustExplain || row.trustExplain !== BASELINE_INLINE_TRUST_EXPLAIN) {
    return false;
  }

  const badges = Array.isArray(row.trustBadges) ? row.trustBadges : [];
  if (badges.length === 0) return false;

  return badges.every(
    (badge) =>
      badge &&
      badge.tone !== 'high' &&
      BASELINE_INLINE_TRUST_BADGE_LABELS.has(badge.label),
  );
}

export function shouldShowInlineTrustExplain(
  row: {
    trustExplain?: string | null;
    trustBadges?: TrustBadge[] | null;
  },
  options: {
    laneHasBaselineDisclosure?: boolean;
  } = {},
): boolean {
  if (!row?.trustExplain) return false;

  const badges = Array.isArray(row.trustBadges) ? row.trustBadges : [];
  const hasActionableBadge = badges.some((badge) => badge?.tone === 'caution' || badge?.tone === 'high');
  if (!hasActionableBadge) return false;

  if (options.laneHasBaselineDisclosure && isBaselineLaneTrustExplain(row)) {
    return false;
  }

  return true;
}

