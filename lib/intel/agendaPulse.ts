import { classifyEvent } from '@/lib/intel/eventClassification';
import { EVENT_SEVERITY } from '@/lib/intel/eventTaxonomy';
import type { PromotableItem } from '@/lib/intel/globalPromotion';

export type AgendaPulseExplanation = {
  ruleId: string;
  message: string;
  delta: number;
};

export type AgendaPulseScore = {
  score: number;
  explanations: AgendaPulseExplanation[];
  publicConsequenceTags: string[];
};

type AgendaItem = PromotableItem & {
  stateChangeType?: string;
  structured?: Record<string, unknown>;
};

type AgendaCluster = {
  items: AgendaItem[];
};

const PRIMARY_RECORD_STATES = new Set([
  'committee_meeting',
  'committee_markup',
  'witness_list_posted',
  'witness_statement_posted',
  'bill_action',
  'bill_summary',
  'bill_text_updated',
  'house_roll_call_vote',
  'crs_report',
]);

const UPCOMING_STATES = new Set(['committee_meeting', 'committee_markup', 'witness_list_posted', 'witness_statement_posted']);
const ACTION_STATES = new Set(['bill_action', 'bill_text_updated', 'house_roll_call_vote']);
const CONTEXT_STATES = new Set(['bill_summary', 'crs_report']);

const PUBLIC_CONSEQUENCE_TAGS = [
  'war_powers',
  'military_authorization',
  'civil_confinement',
  'mental_health_detention',
  'immigration_detention',
  'carceral_infrastructure',
  'surveillance_privacy',
  'data_centers_grid_water',
  'environmental_health',
  'sexual_violence_accountability',
  'executive_oversight',
  'civil_liberties',
  'election_power',
  'federal_agency_power',
] as const;

const CONSEQUENCE_PATTERNS: Array<[string, RegExp]> = [
  ['war_powers', /\bwar\s+powers?\b|\bauthorization\s+for\s+use\s+of\s+military\s+force\b|\baumf\b/i],
  ['military_authorization', /\bauthoriz(?:e|ation).{0,40}\b(military|armed forces|force)\b|\bndaa\b/i],
  ['civil_confinement', /\b(civil|involuntary)\s+confinement\b|\binvoluntary\s+commitment\b/i],
  ['mental_health_detention', /\bmental\s+health\b.{0,60}\b(detain|detention|commitment|confinement)\b/i],
  ['immigration_detention', /\bimmigration\b.{0,60}\b(detain|detention|custody|facility)\b|\bice\b.{0,60}\b(detain|detention|facility)\b/i],
  ['carceral_infrastructure', /\bdetention\s+(?:center|facility|bed|beds|infrastructure)\b|\bcarceral\s+infrastructure\b|\bprison\s+construction\b/i],
  ['surveillance_privacy', /\bfisa\b|\bsection\s*702\b|\bsurveillance\b|\bprivacy\b|\bdata\s+broker\b|\bwiretap\b/i],
  ['data_centers_grid_water', /\bdata\s+centers?\b.*\b(grid|water|electric|power|environment)\b|\b(grid|water)\b.*\bdata\s+centers?\b/i],
  ['environmental_health', /\benvironmental\s+health\b|\bclean\s+water\b|\bair\s+quality\b|\btoxic\b/i],
  ['sexual_violence_accountability', /\bsexual\s+violence\b|\bsexual\s+assault\b|\bharassment\b.*\baccountability\b/i],
  ['executive_oversight', /\boversight\b|\binspector\s+general\b|\bsubpoena\b|\baccountability\b/i],
  ['civil_liberties', /\bcivil\s+liberties\b|\bfirst\s+amendment\b|\bfourth\s+amendment\b|\bdue\s+process\b/i],
  ['election_power', /\belection\b|\bvoting\b|\ballot\b|\belectoral\b/i],
  ['federal_agency_power', /\bfederal\s+agency\b|\bagency\s+authority\b|\badministrative\s+power\b/i],
];

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function haystack(item: AgendaItem): string {
  return `${item.title ?? ''}\n${item.summary ?? ''}`.toLowerCase();
}

function hoursUntilOrSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - now.getTime()) / 3600000;
}

function itemsFrom(input: AgendaItem | AgendaCluster): AgendaItem[] {
  if ('items' in input && Array.isArray(input.items)) return input.items;
  return [input as AgendaItem];
}

function structuredTags(item: AgendaItem): string[] {
  const tags = item.structured?.public_consequence_tags;
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

export function publicConsequenceTagsForItem(item: AgendaItem): string[] {
  const tags = new Set<string>();
  for (const tag of item.missionTags ?? []) {
    if ((PUBLIC_CONSEQUENCE_TAGS as readonly string[]).includes(tag)) tags.add(tag);
  }
  for (const tag of structuredTags(item)) {
    if ((PUBLIC_CONSEQUENCE_TAGS as readonly string[]).includes(tag)) tags.add(tag);
  }
  const h = haystack(item);
  for (const [tag, pattern] of CONSEQUENCE_PATTERNS) {
    if (pattern.test(h)) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function computePrimaryRecordStrength(item: AgendaItem): number {
  let score = 0;
  if (item.provenanceClass === 'PRIMARY') score += 20;
  if (item.sourceFamily === 'congress_primary' || String(item.sourceSlug ?? '').startsWith('congress-')) score += 14;
  if (PRIMARY_RECORD_STATES.has(String(item.stateChangeType ?? ''))) score += 14;
  if (item.stateChangeType === 'house_roll_call_vote') score += 8;
  if (item.stateChangeType === 'witness_statement_posted') score += 7;
  if (item.stateChangeType === 'witness_list_posted') score += 5;
  if (item.stateChangeType === 'crs_report') score -= 3;
  if (item.provenanceClass === 'COMMENTARY' || item.deskLane === 'voices') score -= 16;
  return clamp(score, 0, 56);
}

export function computeInstitutionalProximity(item: AgendaItem, now = new Date()): number {
  const state = String(item.stateChangeType ?? '');
  let score = 0;
  if (UPCOMING_STATES.has(state)) score += 18;
  if (ACTION_STATES.has(state)) score += 16;
  if (CONTEXT_STATES.has(state)) score += 7;

  const hours = hoursUntilOrSince(item.publishedAt, now);
  if (hours != null) {
    if (hours >= 0 && hours <= 72) score += 16;
    else if (hours < 0 && Math.abs(hours) <= 12) score += 10;
    else if (hours < 0 && Math.abs(hours) <= 72) score += 5;
  }

  if (/markup/i.test(haystack(item))) score += 6;
  if (/witness/i.test(haystack(item))) score += 5;
  return clamp(score, 0, 42);
}

export function computePublicConsequence(item: AgendaItem): number {
  const tags = publicConsequenceTagsForItem(item);
  let score = Math.min(26, tags.length * 6);
  if (tags.includes('surveillance_privacy')) score += 4;
  if (tags.includes('civil_confinement') || tags.includes('carceral_infrastructure')) score += 4;
  if (tags.includes('war_powers')) score += 4;
  return clamp(score, 0, 34);
}

export function computeUndercoveredness(cluster: AgendaCluster): number {
  const items = itemsFrom(cluster);
  const hasHighPrimary = items.some((item) => computePrimaryRecordStrength(item) >= 30 && computePublicConsequence(item) >= 12);
  if (!hasHighPrimary) return 0;
  const mainstream = items.filter((item) => item.provenanceClass === 'WIRE' || item.deskLane === 'newswire').length;
  const nonCreator = items.filter((item) => item.provenanceClass !== 'COMMENTARY' && item.deskLane !== 'voices').length;
  if (mainstream === 0 && nonCreator <= 2) return 12;
  if (mainstream <= 1 && nonCreator <= 3) return 8;
  return 0;
}

export function computeSaturationPenalty(cluster: AgendaCluster): number {
  const items = itemsFrom(cluster);
  const mainstream = items.filter((item) => item.provenanceClass === 'WIRE' || item.deskLane === 'newswire').length;
  const primaryCongress = items.filter((item) => item.sourceFamily === 'congress_primary' || String(item.sourceSlug ?? '').startsWith('congress-')).length;
  if (mainstream >= 7 && primaryCongress === 0) return -16;
  if (mainstream >= 5 && primaryCongress === 0) return -10;
  if (mainstream >= 5 && primaryCongress > 0) return -4;
  return 0;
}

export function computeAgendaPulseScore(input: AgendaItem | AgendaCluster, opts: { now?: Date } = {}): AgendaPulseScore {
  const now = opts.now ?? new Date();
  const items = itemsFrom(input);
  const explanations: AgendaPulseExplanation[] = [];
  const tags = new Set<string>();
  let bestItemScore = 0;

  for (const item of items) {
    const primary = computePrimaryRecordStrength(item);
    const proximity = computeInstitutionalProximity(item, now);
    const consequence = computePublicConsequence(item);
    const event = classifyEvent(item);
    const severity = EVENT_SEVERITY[event.eventType as keyof typeof EVENT_SEVERITY] ?? 0.3;
    const eventDelta = Math.round((severity - 0.3) * 18);
    const itemScore = primary + proximity + consequence + eventDelta;
    bestItemScore = Math.max(bestItemScore, itemScore);
    for (const tag of publicConsequenceTagsForItem(item)) tags.add(tag);
  }

  let score = bestItemScore;
  const cluster = { items };
  const undercovered = computeUndercoveredness(cluster);
  const saturationPenalty = computeSaturationPenalty(cluster);
  score += undercovered + saturationPenalty;

  const hasCreator = items.some((item) => item.provenanceClass === 'COMMENTARY' || item.deskLane === 'voices');
  const hasPrimaryRecord = items.some((item) => computePrimaryRecordStrength(item) >= 30);
  if (hasCreator && hasPrimaryRecord) {
    score += 5;
    explanations.push({
      ruleId: 'agenda_pulse:creator_corroborated',
      message: 'Creator signal corroborated by primary record',
      delta: 5,
    });
  } else if (hasCreator && !hasPrimaryRecord) {
    score -= 18;
    explanations.push({
      ruleId: 'agenda_pulse:creator_only_penalty',
      message: 'Penalty: social/commentary-only claim without primary support',
      delta: -18,
    });
  }

  if (items.some((item) => item.stateChangeType === 'committee_meeting')) {
    explanations.push({ ruleId: 'agenda_pulse:hearing', message: 'Upcoming committee hearing', delta: 0 });
  }
  if (items.some((item) => item.stateChangeType === 'committee_markup')) {
    explanations.push({ ruleId: 'agenda_pulse:markup', message: 'Upcoming committee markup', delta: 0 });
  }
  if (items.some((item) => item.stateChangeType === 'witness_list_posted' || item.stateChangeType === 'witness_statement_posted')) {
    explanations.push({ ruleId: 'agenda_pulse:witness_docs', message: 'Witness documents posted', delta: 0 });
  }
  if (items.some((item) => item.stateChangeType === 'bill_text_updated')) {
    explanations.push({ ruleId: 'agenda_pulse:bill_text', message: 'Bill text updated', delta: 0 });
  }
  if (items.some((item) => item.stateChangeType === 'house_roll_call_vote')) {
    explanations.push({ ruleId: 'agenda_pulse:house_vote', message: 'House roll-call vote recorded', delta: 0 });
  }
  if (tags.size > 0) {
    explanations.push({
      ruleId: 'agenda_pulse:public_consequence',
      message: 'High public-consequence congressional item',
      delta: 0,
    });
  }
  if (undercovered) {
    explanations.push({
      ruleId: 'agenda_pulse:undercovered',
      message: 'Undercovered primary-source item',
      delta: undercovered,
    });
  }
  if (saturationPenalty) {
    explanations.push({
      ruleId: 'agenda_pulse:saturation_penalty',
      message: 'Penalty: duplicate saturation',
      delta: saturationPenalty,
    });
  }

  return {
    score: clamp(score),
    explanations: explanations.slice(0, 10),
    publicConsequenceTags: [...tags].sort((a, b) => a.localeCompare(b)),
  };
}
