import type { ProvenanceClass } from '@/lib/intel/types';
import type { ThemeAttentionForItem, ThemeAttentionMomentum } from '@/lib/themeMemory/readModel';
import type { ThemeLifecycle } from '@/lib/themeMemory/themeTypes';

/**
 * Bounded Theme Memory ranking contribution.
 *
 * Theme Memory does not replace the existing I Am Resist ranking model.
 * It supplies longitudinal attention context to that model.
 *
 * Creator episodes are not ranked against each other. Relevant creator links
 * remain members of the theme for later presentation.
 *
 * A strong theme-attention contribution means:
 *   "This subject is receiving sustained attention within our editorial source ecosystem."
 * It does NOT mean:
 *   "The claims made about this subject are true."
 */
export const THEME_ATTENTION_RANKING = {
  /** Display-priority points. Must stay below provenance PRIMARY (+8) and recency max (+8). */
  MAX_CONTRIBUTION: 5,
  /**
   * Combined displayPriority boost from:
   * - Theme Memory (longitudinal creator attention)
   * - short-window trusted creator corroboration bridge (~36h)
   *
   * Short-window remaining responsible for same-day/~36h activity.
   * Theme Memory contributes only when multi-day persistence/resurgence exists.
   * This cap prevents stacking those two creator-derived boosts.
   */
  COMBINED_CREATOR_INFLUENCE_CAP: 7,
  COOLING_MAX_CONTRIBUTION: 2,

  MIN_CREATOR_BREADTH_7D: 2,
  MIN_ACTIVE_DAYS_7D: 2,
  MIN_CREATOR_ITEM_COUNT_7D: 2,
  RESURGING_MIN_ACTIVE_DAYS_7D: 1,
  RESURGING_MIN_CREATOR_BREADTH_7D: 2,

  MIN_RELEVANCE_SCORE: 48,
  MIN_BASE_DISPLAY_PRIORITY: 52,
  MAX_ITEM_AGE_HOURS: 96,

  CREATOR_BREADTH_POINTS_MAX: 3,
  PERSISTENCE_POINTS_MAX: 3,
  MOMENTUM_POINTS: {
    rising: 2,
    steady: 1,
    falling: 0,
  } as Record<ThemeAttentionMomentum, number>,

  LIFECYCLE_MULTIPLIER: {
    new: 0,
    developing: 0.75,
    persistent: 1,
    cooling: 0.35,
    resurging: 0.9,
    dormant: 0,
  } as Record<ThemeLifecycle, number>,

  /**
   * Reporting/primary/specialist counts on the THEME are maturity/context, not a second
   * provenance or source-diversity reward. Never scale with source count.
   */
  CONTEXT_MATURITY_POINTS: 1,
  CONTEXT_MATURITY_MAX: 1,

  REASON: {
    CREATOR_CONVERGENCE: 'theme:creator_convergence',
    MULTI_DAY_PERSISTENCE: 'theme:multi_day_persistence',
    RESURGING_ATTENTION: 'theme:resurging_attention',
    RISING_CREATOR_ATTENTION: 'theme:rising_creator_attention',
    REPORTING_CONTEXT: 'theme:reporting_context',
    PRIMARY_CONTEXT: 'theme:primary_context',
    LONGITUDINAL_ATTENTION: 'theme:longitudinal_attention',
  },

  INELIGIBLE: {
    NO_THEME: 'theme:ineligible:no_match',
    MODE_OFF: 'theme:ineligible:mode_off',
    DORMANT: 'theme:ineligible:dormant',
    SINGLE_CREATOR: 'theme:ineligible:single_creator_seed',
    NEW_PROVISIONAL: 'theme:ineligible:new_provisional',
    SUPPRESSED: 'theme:ineligible:suppressed',
    DUPLICATE: 'theme:ineligible:duplicate_loser',
    OFF_SCOPE: 'theme:ineligible:off_scope',
    WEAK_ITEM: 'theme:ineligible:weak_item',
    STALE_ITEM: 'theme:ineligible:stale_item',
    METADATA_ONLY: 'theme:ineligible:metadata_only',
    COOLING_FALLING: 'theme:ineligible:cooling_falling',
  },
} as const;

export type ThemeRankingMode = 'off' | 'shadow' | 'active';

export type ThemeAttentionItemGate = {
  surfaceState?: string | null;
  isDuplicateLoser?: boolean;
  relevanceScore?: number | null;
  provenanceClass?: ProvenanceClass | string | null;
  publishedAt?: string | null;
  contentUseMode?: string | null;
  missionScopeState?: 'in_scope' | 'off_topic' | 'ambiguous' | string | null;
  /** Pre-theme display priority. Used so theme cannot rescue a weak item. */
  baseDisplayPriority?: number | null;
  nowMs?: number;
};

export type ThemeAttentionRankingSignal = {
  eligible: boolean;
  contribution: number;
  appliedContribution: number;
  reasons: string[];
  ineligibleReasons: string[];
  matchedThemeId: string | null;
  mode: ThemeRankingMode;
  attentionIsNotCorroboration: true;
  debug: {
    lifecycle: ThemeLifecycle | null;
    momentum: ThemeAttentionMomentum | null;
    creatorCount7d: number;
    creatorItemCount7d: number;
    activeDays7d: number;
    creatorSeedStrength: 'single' | 'converged' | null;
    primarySourceCount: number;
    specialistSourceCount: number;
    reportingSourceCount: number;
    themeEvidenceDepth: number;
    contextMaturityApplied: number;
    shortWindowOverlapCapped: boolean;
  };
};

const EMPTY_DEBUG: ThemeAttentionRankingSignal['debug'] = {
  lifecycle: null,
  momentum: null,
  creatorCount7d: 0,
  creatorItemCount7d: 0,
  activeDays7d: 0,
  creatorSeedStrength: null,
  primarySourceCount: 0,
  specialistSourceCount: 0,
  reportingSourceCount: 0,
  themeEvidenceDepth: 0,
  contextMaturityApplied: 0,
  shortWindowOverlapCapped: false,
};

export function resolveThemeRankingMode(
  source: Record<string, string | undefined> | NodeJS.ProcessEnv = process.env,
): ThemeRankingMode {
  const mode = String(source.THEME_RANKING_MODE || '')
    .trim()
    .toLowerCase();
  if (mode === 'off' || mode === 'shadow' || mode === 'active') return mode;
  const enabled = String(source.THEME_RANKING_ENABLED || '')
    .trim()
    .toLowerCase();
  if (enabled === '1' || enabled === 'true' || enabled === 'yes') return 'active';
  return 'off';
}

function hoursSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / 3600000;
}

function pointsFromCount(count: number, max: number): number {
  if (count < 2) return 0;
  return Math.min(max, count - 1);
}

function clampContribution(n: number, max = THEME_ATTENTION_RANKING.MAX_CONTRIBUTION): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function debugFromContext(context: ThemeAttentionForItem | null | undefined): ThemeAttentionRankingSignal['debug'] {
  if (!context?.matchedThemeId) return { ...EMPTY_DEBUG };
  return {
    lifecycle: context.lifecycle,
    momentum: context.momentum,
    creatorCount7d: context.creatorCount7d,
    creatorItemCount7d: context.creatorItemCount7d,
    activeDays7d: context.activeDays7d,
    creatorSeedStrength: context.creatorSeedStrength,
    primarySourceCount: context.primarySourceCount,
    specialistSourceCount: context.specialistSourceCount,
    reportingSourceCount: context.reportingSourceCount,
    themeEvidenceDepth: context.themeEvidenceDepth,
    contextMaturityApplied: 0,
    shortWindowOverlapCapped: false,
  };
}

function ineligibleSignal(
  mode: ThemeRankingMode,
  reasons: string[],
  context: ThemeAttentionForItem | null | undefined,
): ThemeAttentionRankingSignal {
  return {
    eligible: false,
    contribution: 0,
    appliedContribution: 0,
    reasons: [],
    ineligibleReasons: reasons,
    matchedThemeId: context?.matchedThemeId ?? null,
    mode,
    attentionIsNotCorroboration: true,
    debug: debugFromContext(context),
  };
}

/**
 * Convert persisted Theme Memory context into a bounded ranking contribution.
 * Deterministic. No AI. Does not treat creator attention as corroboration.
 */
export function deriveThemeAttentionSignal(
  context: ThemeAttentionForItem | null | undefined,
  gates: ThemeAttentionItemGate = {},
  mode: ThemeRankingMode = 'active',
): ThemeAttentionRankingSignal {
  if (mode === 'off') {
    return ineligibleSignal('off', [THEME_ATTENTION_RANKING.INELIGIBLE.MODE_OFF], context);
  }

  if (!context?.matchedThemeId) {
    return ineligibleSignal(mode, [THEME_ATTENTION_RANKING.INELIGIBLE.NO_THEME], context);
  }

  const ineligible: string[] = [];
  if (context.lifecycle === 'dormant') ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.DORMANT);
  if (gates.surfaceState === 'suppressed') ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.SUPPRESSED);
  if (gates.isDuplicateLoser) ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.DUPLICATE);
  if (gates.missionScopeState === 'off_topic') ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.OFF_SCOPE);
  if (gates.contentUseMode === 'metadata_only') ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.METADATA_ONLY);

  const singleCreator =
    context.creatorSeedStrength === 'single' ||
    context.creatorCount7d < THEME_ATTENTION_RANKING.MIN_CREATOR_BREADTH_7D;
  if (singleCreator) ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.SINGLE_CREATOR);

  if (context.lifecycle === 'new' && singleCreator) {
    ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.NEW_PROVISIONAL);
  }

  const minActiveDays =
    context.lifecycle === 'resurging'
      ? THEME_ATTENTION_RANKING.RESURGING_MIN_ACTIVE_DAYS_7D
      : THEME_ATTENTION_RANKING.MIN_ACTIVE_DAYS_7D;
  const minBreadth =
    context.lifecycle === 'resurging'
      ? THEME_ATTENTION_RANKING.RESURGING_MIN_CREATOR_BREADTH_7D
      : THEME_ATTENTION_RANKING.MIN_CREATOR_BREADTH_7D;
  if (context.activeDays7d < minActiveDays || context.creatorCount7d < minBreadth) {
    if (!ineligible.includes(THEME_ATTENTION_RANKING.INELIGIBLE.SINGLE_CREATOR)) {
      ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.SINGLE_CREATOR);
    }
  }
  if (
    context.lifecycle !== 'resurging' &&
    context.creatorItemCount7d > 0 &&
    context.creatorItemCount7d < THEME_ATTENTION_RANKING.MIN_CREATOR_ITEM_COUNT_7D &&
    context.activeDays7d < THEME_ATTENTION_RANKING.MIN_ACTIVE_DAYS_7D
  ) {
    ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.NEW_PROVISIONAL);
  }

  if (context.lifecycle === 'cooling' && context.momentum === 'falling') {
    ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.COOLING_FALLING);
  }

  const relevance = gates.relevanceScore;
  const basePriority = gates.baseDisplayPriority;
  if (typeof relevance === 'number' && relevance < THEME_ATTENTION_RANKING.MIN_RELEVANCE_SCORE) {
    ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.WEAK_ITEM);
  }
  if (typeof basePriority === 'number' && basePriority < THEME_ATTENTION_RANKING.MIN_BASE_DISPLAY_PRIORITY) {
    ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.WEAK_ITEM);
  }

  const nowMs = gates.nowMs ?? Date.now();
  const ageHours = hoursSince(gates.publishedAt, nowMs);
  if (ageHours != null && ageHours > THEME_ATTENTION_RANKING.MAX_ITEM_AGE_HOURS) {
    ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.STALE_ITEM);
  }

  const lifecycleEligible = THEME_ATTENTION_RANKING.LIFECYCLE_MULTIPLIER[context.lifecycle] > 0;
  if (!lifecycleEligible && context.lifecycle !== 'cooling') {
    if (context.lifecycle === 'new') ineligible.push(THEME_ATTENTION_RANKING.INELIGIBLE.NEW_PROVISIONAL);
  }

  if (ineligible.length > 0) {
    return ineligibleSignal(mode, [...new Set(ineligible)], context);
  }

  const breadthPts = pointsFromCount(context.creatorCount7d, THEME_ATTENTION_RANKING.CREATOR_BREADTH_POINTS_MAX);
  const persistPts = pointsFromCount(context.activeDays7d, THEME_ATTENTION_RANKING.PERSISTENCE_POINTS_MAX);
  const momentumPts = THEME_ATTENTION_RANKING.MOMENTUM_POINTS[context.momentum] ?? 0;
  const multiplier = THEME_ATTENTION_RANKING.LIFECYCLE_MULTIPLIER[context.lifecycle] ?? 0;

  let raw = (breadthPts + persistPts + momentumPts) * multiplier;

  /**
   * Context maturity is a small eligibility-quality bump, not a second primary-source or
   * diversity reward. Item-level provenance already scored PRIMARY/WIRE/SPECIALIST.
   * Theme primary/reporting counts never scale this bump.
   */
  let contextMaturityApplied = 0;
  const hasThemeContext =
    context.primarySourceCount > 0 || context.specialistSourceCount > 0 || context.reportingSourceCount > 0;
  const itemAlreadyPrimary = String(gates.provenanceClass || '').toUpperCase() === 'PRIMARY';
  if (hasThemeContext && !itemAlreadyPrimary) {
    contextMaturityApplied = THEME_ATTENTION_RANKING.CONTEXT_MATURITY_POINTS;
    raw += contextMaturityApplied;
  }

  let contribution = clampContribution(raw);
  if (context.lifecycle === 'cooling') {
    contribution = Math.min(contribution, THEME_ATTENTION_RANKING.COOLING_MAX_CONTRIBUTION);
  }
  if (contribution <= 0) {
    return ineligibleSignal(mode, [THEME_ATTENTION_RANKING.INELIGIBLE.NEW_PROVISIONAL], context);
  }

  const reasons: string[] = [];
  if (context.creatorCount7d >= 2) reasons.push(THEME_ATTENTION_RANKING.REASON.CREATOR_CONVERGENCE);
  if (context.activeDays7d >= 2) reasons.push(THEME_ATTENTION_RANKING.REASON.MULTI_DAY_PERSISTENCE);
  if (context.lifecycle === 'resurging') reasons.push(THEME_ATTENTION_RANKING.REASON.RESURGING_ATTENTION);
  if (context.momentum === 'rising') reasons.push(THEME_ATTENTION_RANKING.REASON.RISING_CREATOR_ATTENTION);
  if (context.reportingSourceCount > 0) reasons.push(THEME_ATTENTION_RANKING.REASON.REPORTING_CONTEXT);
  if (context.primarySourceCount > 0) reasons.push(THEME_ATTENTION_RANKING.REASON.PRIMARY_CONTEXT);
  if (context.activeDays7d >= 3 || context.lifecycle === 'persistent') {
    reasons.push(THEME_ATTENTION_RANKING.REASON.LONGITUDINAL_ATTENTION);
  }

  const appliedContribution = mode === 'active' ? contribution : 0;

  return {
    eligible: true,
    contribution,
    appliedContribution,
    reasons: [...new Set(reasons)],
    ineligibleReasons: [],
    matchedThemeId: context.matchedThemeId,
    mode,
    attentionIsNotCorroboration: true,
    debug: {
      ...debugFromContext(context),
      contextMaturityApplied: itemAlreadyPrimary ? 0 : contextMaturityApplied,
    },
  };
}

/**
 * Cap the later short-window creator bridge so Theme Memory + ~36h convergence
 * cannot stack as independent creator rewards.
 */
export function capShortWindowCreatorBoost(input: {
  requestedBoost: number;
  themeAppliedContribution: number;
}): { boost: number; capped: boolean; remainingBudget: number } {
  const requested = Math.max(0, Number(input.requestedBoost) || 0);
  const themeApplied = Math.max(0, Number(input.themeAppliedContribution) || 0);
  const remaining = Math.max(0, THEME_ATTENTION_RANKING.COMBINED_CREATOR_INFLUENCE_CAP - themeApplied);
  const boost = Math.min(requested, remaining);
  return {
    boost,
    capped: boost < requested,
    remainingBudget: remaining,
  };
}

export function emptyThemeAttentionSignal(mode: ThemeRankingMode = 'off'): ThemeAttentionRankingSignal {
  return ineligibleSignal(mode, [THEME_ATTENTION_RANKING.INELIGIBLE.NO_THEME], null);
}
