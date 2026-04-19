import type { ProvenanceClass } from '@/lib/intel/types';
import { applyEditorialRankingProfile } from '@/lib/intel/rankingProfile';

export type DisplayBucket = 'lead' | 'secondary' | 'routine';

export type DisplayExplanation = {
  ruleId: string;
  message: string;
};

export type DisplayPriorityResult = {
  displayPriority: number; // 0..100 (clamped)
  displayBucket: DisplayBucket;
  displayExplanations: DisplayExplanation[];
};

export type RecentWindowTieBreakCandidate = {
  publishedAt: string | null;
  provenanceClass: ProvenanceClass;
  score: number;
};

export type RecentWindowTieBreakDecision = {
  winner: 'a' | 'b' | null;
  reason: string | null;
  freshnessGapMinutes: number | null;
  provenanceGap: number | null;
  scoreGap: number | null;
};

type ScoringInput = {
  title: string;
  summary: string | null;
  provenanceClass: ProvenanceClass;
  sourceSlug: string;
  stateChangeType: string;
  missionTags: string[];
  branchOfGovernment: string;
  institutionalArea: string;
  relevanceScore: number;
  clusterKeys: Record<string, string>;
  publishedAt: string | null;
  trustWarningMode?: string | null;
  /** Precomputed for consistency with trustWarnings.ts; may be derived from text patterns. */
  ceremonialOrLowSubstance?: boolean;
  deskLane?: string;
  contentUseMode?: string | null;
  sourceFamily?: string | null;
};

const PROVENANCE_TIEBREAK_ORDER: Record<ProvenanceClass, number> = {
  PRIMARY: 0,
  WIRE: 1,
  SPECIALIST: 2,
  INDIE: 3,
  COMMENTARY: 4,
  SCHEDULE: 5,
};

const BREAKING_WINDOW_HOURS = 2;
const RECENT_WINDOW_HOURS = 6;
const RECENT_WINDOW_MIN_FRESHNESS_GAP_MINUTES = 45;
const RECENT_WINDOW_MAX_PROVENANCE_GAP = 1;
const RECENT_WINDOW_MAX_SCORE_GAP = 4;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function provenanceTieBreakRank(provenanceClass: ProvenanceClass): number {
  return PROVENANCE_TIEBREAK_ORDER[provenanceClass] ?? 99;
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (60 * 60 * 1000);
}

function minutesSince(iso: string | null): number | null {
  const hrs = hoursSince(iso);
  if (hrs == null) return null;
  return hrs * 60;
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

export function evaluateRecentWindowTieBreak(
  a: RecentWindowTieBreakCandidate,
  b: RecentWindowTieBreakCandidate,
): RecentWindowTieBreakDecision {
  const aMinutes = minutesSince(a.publishedAt);
  const bMinutes = minutesSince(b.publishedAt);
  if (aMinutes == null || bMinutes == null) {
    return { winner: null, reason: null, freshnessGapMinutes: null, provenanceGap: null, scoreGap: null };
  }

  const aIsFresher = aMinutes < bMinutes;
  const fresher = aIsFresher ? a : b;
  const older = aIsFresher ? b : a;
  const fresherLabel = aIsFresher ? 'a' : 'b';

  const freshnessGapMinutes = Math.round(Math.abs(aMinutes - bMinutes));
  if (freshnessGapMinutes < RECENT_WINDOW_MIN_FRESHNESS_GAP_MINUTES) {
    return { winner: null, reason: null, freshnessGapMinutes, provenanceGap: null, scoreGap: null };
  }

  if (aMinutes > RECENT_WINDOW_HOURS * 60 || bMinutes > RECENT_WINDOW_HOURS * 60) {
    return { winner: null, reason: null, freshnessGapMinutes, provenanceGap: null, scoreGap: null };
  }

  const fresherRank = provenanceTieBreakRank(fresher.provenanceClass);
  const olderRank = provenanceTieBreakRank(older.provenanceClass);
  const provenanceGap = fresherRank - olderRank;
  // Recent-window rule: provenance still wins by default. Freshness only breaks ties inside a
  // bounded <=6h window, with a meaningful freshness gap, a one-step provenance gap, and a small
  // score gap. Commentary/schedule never leapfrog harder reporting via this override.
  if (provenanceGap <= 0 || provenanceGap > RECENT_WINDOW_MAX_PROVENANCE_GAP) {
    return { winner: null, reason: null, freshnessGapMinutes, provenanceGap, scoreGap: null };
  }

  if (fresher.provenanceClass === 'COMMENTARY' || fresher.provenanceClass === 'SCHEDULE') {
    return { winner: null, reason: null, freshnessGapMinutes, provenanceGap, scoreGap: null };
  }

  const scoreGap = Math.abs(a.score - b.score);
  if (scoreGap > RECENT_WINDOW_MAX_SCORE_GAP) {
    return { winner: null, reason: null, freshnessGapMinutes, provenanceGap, scoreGap };
  }

  return {
    winner: fresherLabel,
    reason: `Recent-window freshness wins: both <=${RECENT_WINDOW_HOURS}h old, freshness gap >=${RECENT_WINDOW_MIN_FRESHNESS_GAP_MINUTES}m, provenance gap <=${RECENT_WINDOW_MAX_PROVENANCE_GAP}, score gap <=${RECENT_WINDOW_MAX_SCORE_GAP}.`,
    freshnessGapMinutes,
    provenanceGap,
    scoreGap,
  };
}

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

const PROCEDURAL_CHURN_PATTERNS: RegExp[] = [
  /\bsunshine\s+act\b/i,
  /\bfederal\s+advisory\s+committee\b/i,
  /\bpaperwork\s+reduction\s+act\b/i,
  /\bnotice\s+of\s+meeting\b/i,
  /\bmeeting\s+notice\b/i,
  /\bcharter\s+(?:filed|renewal|renewed)\b/i,
  /\bsubmission\s+for\s+omb\s+review\b/i,
];

const HIGH_IMPACT_PATTERNS: RegExp[] = [
  /\btemporary\s+restraining\s+order\b/i,
  /\btro\b/i,
  /\bpreliminary\s+injunction\b/i,
  /\binjunction\b/i,
  /\bstay\b/i,
  /\bopinion\b/i,
  /\border\b/i,
  /\bcertiorari\b/i,
  /\bgrant(?:ed)?\b/i,
  /\bsubpoena\b/i,
  /\bfinal\s+rule\b/i,
  /\binterim\s+final\b/i,
  /\bexecutive\s+order\b/i,
];

function scoreMissionBoost(tags: string[], explanations: DisplayExplanation[]): number {
  const t = new Set(tags);
  let boost = 0;

  if (t.has('voting_rights')) {
    boost += 8;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: voting_rights' });
  }
  if (t.has('elections')) {
    boost += 6;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: elections' });
  }
  if (t.has('courts')) {
    boost += 7;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: courts' });
  }
  if (t.has('civil_liberties')) {
    boost += 6;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: civil_liberties' });
  }
  if (t.has('executive_power')) {
    boost += 5;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: executive_power' });
  }
  if (t.has('regulation')) {
    boost += 3;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: regulation' });
  }
  if (t.has('congress')) {
    boost += 7;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: congress' });
  }

  return Math.min(boost, 16);
}

function scoreImpactText(h: string, explanations: DisplayExplanation[]): number {
  const m = hasAny(h, HIGH_IMPACT_PATTERNS);
  if (!m) return 0;
  explanations.push({ ruleId: 'display:impact_text', message: 'Boost: looks like an actual development' });
  return 10;
}

function scoreProvenance(provenanceClass: ProvenanceClass, explanations: DisplayExplanation[]): number {
  if (provenanceClass === 'PRIMARY') {
    explanations.push({ ruleId: 'display:provenance', message: 'Boost: primary-source provenance' });
    return 8;
  }
  if (provenanceClass === 'SPECIALIST') {
    explanations.push({ ruleId: 'display:provenance', message: 'Boost: specialist/reporting provenance' });
    return 6;
  }
  if (provenanceClass === 'WIRE') {
    explanations.push({ ruleId: 'display:provenance', message: 'Small boost: wire/reporting provenance' });
    return 3;
  }
  if (provenanceClass === 'INDIE') {
    explanations.push({ ruleId: 'display:provenance', message: 'Small boost: independent reporting provenance' });
    return 1;
  }
  if (provenanceClass === 'COMMENTARY') {
    explanations.push({ ruleId: 'display:provenance', message: 'Penalty: commentary provenance requires stronger hard-signal support' });
    return -5;
  }
  if (provenanceClass === 'SCHEDULE') {
    explanations.push({ ruleId: 'display:provenance', message: 'Penalty: schedule/procedural provenance' });
    return -8;
  }
  return 0;
}

function scoreNoisePenalties(input: ScoringInput, h: string, explanations: DisplayExplanation[]): number {
  let penalty = 0;

  const isWhiteHouse = input.institutionalArea === 'white_house' || input.sourceSlug.startsWith('wh-');
  const isExecInstrument = Boolean(input.clusterKeys.executive_order || input.clusterKeys.proclamation);

  if (isWhiteHouse && isExecInstrument) {
    const ceremonial = hasAny(h, CEREMONIAL_EXECUTIVE_PATTERNS);
    if (ceremonial) {
      penalty -= 22;
      explanations.push({
        ruleId: 'display:ceremonial_exec',
        message: 'Penalty: ceremonial / low-consequence executive output',
      });
    }
  }

  if (isWhiteHouse) {
    const routine = hasAny(h, ROUTINE_EXECUTIVE_OUTPUT_PATTERNS);
    if (routine) {
      penalty -= 10;
      explanations.push({ ruleId: 'display:routine_exec', message: 'Penalty: routine White House output' });
    }
  }

  // Explicit demotion for source-controlled official-claim surfaces when they look ceremonial/low-substance.
  // Kept modest to avoid oversteering the desk; the main effect is on lead selection via hero_eligibility_mode.
  if (input.trustWarningMode === 'source_controlled_official_claims') {
    const lowSubstance = Boolean(input.ceremonialOrLowSubstance) || Boolean(hasAny(h, CEREMONIAL_EXECUTIVE_PATTERNS));
    if (lowSubstance) {
      penalty -= 8;
      explanations.push({
        ruleId: 'display:trust_low_substance',
        message: 'Penalty: source-controlled official messaging that appears low-substance/ceremonial',
      });
    }
  }

  const churn = hasAny(h, PROCEDURAL_CHURN_PATTERNS);
  if (churn) {
    penalty -= 14;
    explanations.push({ ruleId: 'display:procedural_churn', message: 'Penalty: procedural churn' });
  }

  return penalty;
}

function scoreRecency(input: ScoringInput, h: string, explanations: DisplayExplanation[]): number {
  const publishedAt = input.publishedAt;
  const hrs = hoursSince(publishedAt);
  if (hrs == null) return 0;
  const highImpact = Boolean(hasAny(h, HIGH_IMPACT_PATTERNS));
  const highTrust =
    input.provenanceClass === 'PRIMARY' ||
    input.provenanceClass === 'SPECIALIST' ||
    input.provenanceClass === 'WIRE';
  const liveMissionRelevant =
    highImpact ||
    input.missionTags.includes('courts') ||
    input.missionTags.includes('congress') ||
    input.missionTags.includes('executive_power') ||
    input.missionTags.includes('civil_liberties') ||
    input.missionTags.includes('voting_rights') ||
    input.missionTags.includes('elections');

  if (hrs <= BREAKING_WINDOW_HOURS) {
    const delta = highTrust && liveMissionRelevant ? 8 : highTrust ? 6 : 3;
    explanations.push({
      ruleId: 'display:recency',
      message: delta >= 6 ? 'Boost: breaking-window hard-signal item' : 'Small boost: breaking-window freshness',
    });
    return delta;
  }
  if (hrs <= RECENT_WINDOW_HOURS) {
    const delta = highTrust && liveMissionRelevant ? 4 : highTrust ? 2 : 0;
    if (delta > 0) {
      explanations.push({
        ruleId: 'display:recency',
        message: delta >= 3 ? 'Boost: recent-window reporting still moving' : 'Small boost: recent-window freshness',
      });
    }
    return delta;
  }
  if (hrs <= 18 && highTrust && liveMissionRelevant) {
    explanations.push({ ruleId: 'display:recency', message: 'Small boost: still-fresh mission reporting' });
    return 2;
  }
  return 0;
}

function scoreBoundedRelevance(relevanceScore: number, explanations: DisplayExplanation[]): number {
  if (!Number.isFinite(relevanceScore)) return 0;
  const centered = relevanceScore - 50; // -50..+50
  const bounded = Math.max(-8, Math.min(12, Math.round(centered / 4)));
  if (bounded !== 0) {
    explanations.push({ ruleId: 'display:relevance', message: 'Minor influence: ingest relevance (bounded)' });
  }
  return bounded;
}

function bucketFromScore(score: number, deskLane?: string): DisplayBucket {
  if (deskLane === 'statements') {
    if (score >= 84) return 'lead';
    if (score >= 70) return 'secondary';
    return 'routine';
  }
  if (score >= 78) return 'lead';
  if (score >= 64) return 'secondary';
  return 'routine';
}

export function computeDisplayPriority(input: ScoringInput): DisplayPriorityResult {
  const explanations: DisplayExplanation[] = [];
  const h = haystack(input.title, input.summary);

  let score = 50;

  score += scoreMissionBoost(input.missionTags, explanations);
  score += scoreImpactText(h, explanations);
  score += scoreProvenance(input.provenanceClass, explanations);
  score += scoreBoundedRelevance(input.relevanceScore, explanations);
  score += scoreRecency(input, h, explanations);
  score += scoreNoisePenalties(input, h, explanations);

  const prof = applyEditorialRankingProfile({
    haystack: h,
    deskLane: input.deskLane ?? 'osint',
    provenanceClass: input.provenanceClass,
    stateChangeType: input.stateChangeType,
    sourceFamily: input.sourceFamily,
    contentUseMode: input.contentUseMode,
    sourceSlug: input.sourceSlug,
  });
  score += prof.delta;
  for (const e of prof.explanations) {
    explanations.push({ ruleId: e.ruleId, message: e.message });
  }

  let displayPriority = clamp(score);
  if (input.sourceSlug === 'indicator-pentagon-pizza') {
    displayPriority = Math.min(displayPriority, 28);
  }
  let displayBucket = bucketFromScore(displayPriority, input.deskLane);
  if (input.sourceSlug === 'indicator-pentagon-pizza') {
    displayBucket = 'routine';
  }

  explanations.unshift({
    ruleId: 'display:score',
    message: `Display priority ${displayPriority} (bucket: ${displayBucket})`,
  });

  return { displayPriority, displayBucket, displayExplanations: explanations.slice(0, 8) };
}

