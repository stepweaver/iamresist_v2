import type { ProvenanceClass } from '@/lib/intel/types';

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
};

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (60 * 60 * 1000);
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
  /\bfinal\s+rule\b/i,
  /\binterim\s+final\b/i,
  /\bexecutive\s+order\b/i,
];

function scoreMissionBoost(tags: string[], explanations: DisplayExplanation[]): number {
  const t = new Set(tags);
  let boost = 0;

  if (t.has('voting_rights')) {
    boost += 14;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: voting_rights' });
  }
  if (t.has('elections')) {
    boost += 10;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: elections' });
  }
  if (t.has('courts')) {
    boost += 12;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: courts' });
  }
  if (t.has('civil_liberties')) {
    boost += 12;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: civil_liberties' });
  }
  if (t.has('executive_power')) {
    boost += 8;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: executive_power' });
  }
  if (t.has('regulation')) {
    boost += 6;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: regulation' });
  }
  if (t.has('congress')) {
    boost += 6;
    explanations.push({ ruleId: 'display:tag', message: 'Boost: congress' });
  }

  return Math.min(boost, 28);
}

function scoreImpactText(h: string, explanations: DisplayExplanation[]): number {
  const m = hasAny(h, HIGH_IMPACT_PATTERNS);
  if (!m) return 0;
  explanations.push({ ruleId: 'display:impact_text', message: 'Boost: looks like an actual development' });
  return 10;
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

  const churn = hasAny(h, PROCEDURAL_CHURN_PATTERNS);
  if (churn) {
    penalty -= 14;
    explanations.push({ ruleId: 'display:procedural_churn', message: 'Penalty: procedural churn' });
  }

  return penalty;
}

function scoreRecency(publishedAt: string | null, explanations: DisplayExplanation[]): number {
  const hrs = hoursSince(publishedAt);
  if (hrs == null) return 0;
  if (hrs <= 2) {
    explanations.push({ ruleId: 'display:recency', message: 'Small boost: very fresh' });
    return 4;
  }
  if (hrs <= 6) return 2;
  if (hrs <= 18) return 1;
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

function bucketFromScore(score: number): DisplayBucket {
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
  score += scoreBoundedRelevance(input.relevanceScore, explanations);
  score += scoreRecency(input.publishedAt, explanations);
  score += scoreNoisePenalties(input, h, explanations);

  const displayPriority = clamp(score);
  const displayBucket = bucketFromScore(displayPriority);

  explanations.unshift({
    ruleId: 'display:score',
    message: `Display priority ${displayPriority} (bucket: ${displayBucket})`,
  });

  return { displayPriority, displayBucket, displayExplanations: explanations.slice(0, 6) };
}

