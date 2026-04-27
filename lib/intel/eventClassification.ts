import type { MissionTag, ProvenanceClass } from '@/lib/intel/types';
import type { EventType } from '@/lib/intel/eventTaxonomy';

export type EventSignal = {
  ruleId: string;
  message: string;
};

export type EventClassification = {
  eventType: EventType;
  signals: EventSignal[];
};

function haystack(title: string, summary: string | null | undefined): string {
  return `${title ?? ''}\n${summary ?? ''}`.toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]): RegExp | null {
  for (const re of patterns) {
    if (re.test(text)) return re;
  }
  return null;
}

const RE_INJUNCTION: RegExp[] = [
  /\bpreliminary\s+injunction\b/i,
  /\btemporary\s+restraining\s+order\b/i,
  /\btro\b/i,
  /\binjunction\b/i,
];

const RE_COURT_ORDER: RegExp[] = [
  /\b(order|ruling|opinion)\b/i,
  /\b(stay|vacate[sd]?|enjoin(?:ed|s)?)\b/i,
  /\b(appeals?\s+court|district\s+court|circuit\s+court|supreme\s+court)\b/i,
];

const RE_SUBPOENA: RegExp[] = [/\bsubpoena\b/i];
const RE_CONTEMPT: RegExp[] = [/\bcontempt\b/i];
const RE_HEARING: RegExp[] = [/\bhearing\b/i, /\bargument\b/i, /\boral\s+argument\b/i];
const RE_DEPOSITION: RegExp[] = [/\bdeposition\b/i];
const RE_RESIGNATION: RegExp[] = [/\bresign(?:s|ed|ation)?\b/i, /\bsteps?\s+down\b/i];
const RE_INVESTIGATION: RegExp[] = [
  /\binvestigation\b/i,
  /\bprobe\b/i,
  /\binquiry\b/i,
  /\binspector\s+general\b/i,
  /\bethics\b/i,
];
const RE_SANCTIONS: RegExp[] = [/\bsanctions?\b/i, /\bdesignat(?:e|ed|ion)\b/i, /\bofac\b/i];
const RE_MIL_ACTION: RegExp[] = [
  /\bstrike\b/i,
  /\bair\s+strike\b/i,
  /\bdrone\s+strike\b/i,
  /\boperation\b/i,
  /\bdeployment\b/i,
  /\brocket\b/i,
  /\bmissile\b/i,
];

const RE_VOTE_CALLED: RegExp[] = [/\bvote\b/i, /\bto\s+vote\b/i, /\bwill\s+vote\b/i, /\bvote\s+scheduled\b/i];
const RE_VOTE_FAILED: RegExp[] = [/\bvote\s+failed\b/i, /\bfailed\s+to\s+pass\b/i, /\bdefeated\b/i];
const RE_CONGRESS_URGENCY: RegExp[] = [
  /\bfisa\b/i,
  /\bsection\s*702\b/i,
  /\b702\b/i,
  /\bsurveillance\b/i,
  /\breauthoriz(?:ation|e|ed|ing)?\b/i,
  /\bextension\b/i,
  /\bfloor\s+vote\b/i,
  /\bemergency\s+vote\b/i,
  /\blate[-\s]?night\s+vote\b/i,
  /\brules\s+vote\b/i,
  /\bcloture\b/i,
  /\bprocedural\s+showdown\b/i,
  /\bhouse\s*\/\s*senate\s+showdown\b/i,
  /\bhouse\s+and\s+senate\s+showdown\b/i,
];

const RE_POLICY_CHANGE: RegExp[] = [
  /\bpolicy\b/i,
  /\bban\b/i,
  /\bpaused?\b/i,
  /\brescind(?:ed|s)?\b/i,
  /\breverse(?:d|s)?\b/i,
  /\bnew\s+rule\b/i,
  /\bfinal\s+rule\b/i,
];

const RE_CONTRADICTION: RegExp[] = [
  /\bcontradic(?:t|tion)\b/i,
  /\bwalks?\s+back\b/i,
  /\bbacktrack(?:s|ed)?\b/i,
  /\bden(?:y|ies|ied)\b/i,
  /\brefutes?\b/i,
];

function hasTag(tags: unknown, t: MissionTag): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.includes(t);
}

type ClassifiableItem = {
  title: string;
  summary: string | null;
  deskLane?: string;
  stateChangeType?: string;
  clusterKeys: Record<string, string>;
  missionTags: unknown;
  provenanceClass: ProvenanceClass;
  trustWarningMode?: string | null;
  institutionalArea?: string;
};

function isStatementLike(item: Pick<ClassifiableItem, 'deskLane' | 'trustWarningMode'>): boolean {
  return item.deskLane === 'statements' || item.trustWarningMode === 'source_controlled_official_claims';
}

function provenanceIsStrong(p: ProvenanceClass): boolean {
  return p === 'PRIMARY' || p === 'SPECIALIST';
}

function hasLegislativeContext(item: Pick<ClassifiableItem, 'missionTags' | 'institutionalArea'>, h: string): boolean {
  return (
    hasTag(item.missionTags, 'congress') ||
    item.institutionalArea === 'congress' ||
    /\b(congress|senate|house|cloture|rules committee)\b/i.test(h)
  );
}

/**
 * Deterministic, tunable classification for promotion purposes.
 * It is not a claim of truth — only a label for "what kind of change this looks like".
 */
export function classifyEvent(
  item: ClassifiableItem,
): EventClassification {
  const signals: EventSignal[] = [];
  const h = haystack(item.title, item.summary);
  const legislativeContext = hasLegislativeContext(item, h);

  if (item.stateChangeType === 'house_roll_call_vote') {
    signals.push({ ruleId: 'event:house_roll_call_vote', message: 'House roll-call vote primary record' });
    return { eventType: 'roll_call_vote_recorded', signals };
  }
  if (item.stateChangeType === 'committee_markup') {
    signals.push({ ruleId: 'event:committee_markup', message: 'Committee markup primary record' });
    return { eventType: 'committee_markup_scheduled', signals };
  }
  if (item.stateChangeType === 'committee_meeting') {
    signals.push({ ruleId: 'event:committee_meeting', message: 'Committee hearing/meeting primary record' });
    return { eventType: 'committee_hearing_scheduled', signals };
  }
  if (item.stateChangeType === 'witness_statement_posted') {
    signals.push({ ruleId: 'event:witness_statement', message: 'Witness statement posted' });
    return { eventType: 'witness_statement_posted', signals };
  }
  if (item.stateChangeType === 'witness_list_posted') {
    signals.push({ ruleId: 'event:witness_list', message: 'Witness list posted' });
    return { eventType: 'witness_list_posted', signals };
  }
  if (item.stateChangeType === 'bill_text_updated') {
    signals.push({ ruleId: 'event:bill_text_updated', message: 'Bill text update primary record' });
    return { eventType: 'bill_text_updated', signals };
  }
  if (item.stateChangeType === 'bill_summary') {
    signals.push({ ruleId: 'event:bill_summary', message: 'CRS bill summary published' });
    return { eventType: 'bill_summary_published', signals };
  }
  if (item.stateChangeType === 'crs_report') {
    signals.push({ ruleId: 'event:crs_report', message: 'CRS report published' });
    return { eventType: 'crs_report_published', signals };
  }

  if (/\bwar\s+powers?\b|\bauthorization\s+for\s+use\s+of\s+military\s+force\b|\baumf\b/i.test(h)) {
    signals.push({ ruleId: 'event:war_powers_signal', message: 'War powers / military authorization language' });
    return { eventType: 'war_powers_signal', signals };
  }
  if (/\b(civil|involuntary)\s+confinement\b|\bmental\s+health\s+detention\b/i.test(h)) {
    signals.push({ ruleId: 'event:civil_confinement_signal', message: 'Civil confinement / detention language' });
    return { eventType: 'civil_confinement_signal', signals };
  }
  if (/\bdetention\s+(?:center|facility|infrastructure|bed|beds)\b|\bcarceral\s+infrastructure\b/i.test(h)) {
    signals.push({ ruleId: 'event:detention_infrastructure_signal', message: 'Detention infrastructure language' });
    return { eventType: 'detention_infrastructure_signal', signals };
  }
  if (/\bfisa\b|\bsection\s*702\b|\bsurveillance\s+(?:authority|authorization|power)\b|\bdata\s+broker\b/i.test(h)) {
    signals.push({ ruleId: 'event:surveillance_authority_signal', message: 'Surveillance authority language' });
    return { eventType: 'surveillance_authority_signal', signals };
  }
  if (/\bdata\s+centers?\b.*\b(grid|water|electric|power|environment)\b|\b(grid|water)\b.*\bdata\s+centers?\b/i.test(h)) {
    signals.push({ ruleId: 'event:data_center_environment_signal', message: 'Data center grid/water impact language' });
    return { eventType: 'data_center_environment_signal', signals };
  }

  if (legislativeContext && hasAny(h, RE_CONGRESS_URGENCY)) {
    signals.push({
      ruleId: 'event:congress_urgency',
      message: 'Congressional procedural/surveillance urgency language detected',
    });
    return { eventType: 'congress_urgency', signals };
  }

  // Hard keys first (clusterKeys already deterministic).
  if (item.clusterKeys?.bill) {
    if (/\breferred\s+to\s+(?:the\s+)?(?:house|senate)?\s*committee\b|\breferred\s+to\s+committee\b/i.test(h)) {
      signals.push({ ruleId: 'event:bill_referred_to_committee', message: 'Bill key present + committee referral language' });
      return { eventType: 'bill_referred_to_committee', signals };
    }
    if (/\breported\s+(?:by|from)\s+(?:the\s+)?committee\b|\bcommittee\s+reported\b/i.test(h)) {
      signals.push({ ruleId: 'event:bill_reported_from_committee', message: 'Bill key present + committee report language' });
      return { eventType: 'bill_reported_from_committee', signals };
    }
    // Prefer filings vs other bill events when title suggests introduction/filing.
    if (/\bintroduced\b|\bfiled\b|\bintroduced\s+in\b/i.test(h)) {
      signals.push({ ruleId: 'event:bill_filed', message: 'Bill key present + filing language' });
      return { eventType: 'bill_filed', signals };
    }
    if (/\bcosponsor\b|\bco-sponsor\b/i.test(h)) {
      signals.push({ ruleId: 'event:bill_cosponsored', message: 'Bill key present + cosponsor language' });
      return { eventType: 'bill_cosponsored', signals };
    }
    signals.push({ ruleId: 'event:bill_filed_default', message: 'Bill key present (default bill event)' });
    return { eventType: 'bill_filed', signals };
  }

  if (item.clusterKeys?.executive_order || item.clusterKeys?.proclamation) {
    signals.push({ ruleId: 'event:executive_action_key', message: 'Executive instrument key present' });
    return { eventType: 'executive_action', signals };
  }

  if (item.clusterKeys?.fr_document_number) {
    // FR docs often imply policy change; keep conservative.
    signals.push({ ruleId: 'event:fr_document', message: 'Federal Register document key present' });
    return { eventType: 'policy_change', signals };
  }

  // Court/legal
  if (hasAny(h, RE_INJUNCTION) || hasTag(item.missionTags, 'courts')) {
    if (hasAny(h, RE_INJUNCTION)) {
      signals.push({ ruleId: 'event:injunction', message: 'Injunction/TRO language detected' });
      return { eventType: 'injunction', signals };
    }
    if (hasAny(h, RE_COURT_ORDER)) {
      signals.push({ ruleId: 'event:court_order', message: 'Court order/ruling language detected' });
      return { eventType: 'court_order', signals };
    }
  }

  // Subpoena / contempt / deposition
  if (hasAny(h, RE_SUBPOENA)) {
    if (/\bignored\b|\brefus(?:e|ed|al)\b|\bno[-\s]?show\b/i.test(h)) {
      signals.push({ ruleId: 'event:subpoena_ignored', message: 'Subpoena + ignore/refusal language' });
      return { eventType: 'subpoena_ignored', signals };
    }
    signals.push({ ruleId: 'event:subpoena_issued', message: 'Subpoena language' });
    return { eventType: 'subpoena_issued', signals };
  }
  if (hasAny(h, RE_CONTEMPT)) {
    signals.push({ ruleId: 'event:contempt_threat', message: 'Contempt language' });
    return { eventType: 'contempt_threat', signals };
  }
  if (hasAny(h, RE_DEPOSITION)) {
    if (/\bmiss(?:ed|es)\b|\bno[-\s]?show\b|\brefus(?:e|ed|al)\b/i.test(h)) {
      signals.push({ ruleId: 'event:deposition_missed', message: 'Deposition + missed/no-show language' });
      return { eventType: 'deposition_missed', signals };
    }
  }

  // Hearings
  if (hasAny(h, RE_HEARING)) {
    if (/\bmiss(?:ed|es)\b|\bskipp(?:ed|s)\b|\bno[-\s]?show\b/i.test(h)) {
      signals.push({ ruleId: 'event:hearing_missed', message: 'Hearing + missed/no-show language' });
      return { eventType: 'hearing_missed', signals };
    }
    signals.push({ ruleId: 'event:hearing_scheduled', message: 'Hearing language' });
    return { eventType: 'hearing_scheduled', signals };
  }

  // Resignation / investigation / ethics
  if (hasAny(h, RE_RESIGNATION)) {
    signals.push({ ruleId: 'event:resignation', message: 'Resignation/stepping down language' });
    return { eventType: 'resignation', signals };
  }
  if (/\bethics\b/i.test(h) && (/\bprobe\b|\binvestigation\b|\bcomplaint\b/i.test(h) || hasAny(h, RE_INVESTIGATION))) {
    signals.push({ ruleId: 'event:ethics_probe', message: 'Ethics + probe/investigation language' });
    return { eventType: 'ethics_probe', signals };
  }
  if (hasAny(h, RE_INVESTIGATION)) {
    signals.push({ ruleId: 'event:investigation_opened', message: 'Investigation/probe language' });
    return { eventType: 'investigation_opened', signals };
  }

  // Sanctions / military action
  if (hasAny(h, RE_SANCTIONS)) {
    signals.push({ ruleId: 'event:sanctions_action', message: 'Sanctions/designation language' });
    return { eventType: 'sanctions_action', signals };
  }
  if (hasAny(h, RE_MIL_ACTION) && (item.deskLane === 'defense_ops' || item.institutionalArea === 'specialist')) {
    signals.push({ ruleId: 'event:military_action', message: 'Operations tempo language (defense/specialist context)' });
    return { eventType: 'military_action', signals };
  }

  // Vote / policy
  if (hasAny(h, RE_VOTE_FAILED)) {
    signals.push({ ruleId: 'event:vote_failed', message: 'Vote-failed language' });
    return { eventType: 'vote_failed', signals };
  }
  if (hasAny(h, RE_VOTE_CALLED) && legislativeContext) {
    signals.push({ ruleId: 'event:vote_called', message: 'Vote language + congress tag' });
    return { eventType: 'vote_called', signals };
  }
  if (hasAny(h, RE_POLICY_CHANGE) && (provenanceIsStrong(item.provenanceClass) || item.institutionalArea === 'federal_register')) {
    signals.push({ ruleId: 'event:policy_change', message: 'Policy-change language (strong provenance/FR context)' });
    return { eventType: 'policy_change', signals };
  }

  // Contradiction/evasion (keep conservative; do not assert truthfulness)
  if (hasAny(h, RE_CONTRADICTION)) {
    signals.push({ ruleId: 'event:contradiction', message: 'Contradiction/walk-back language' });
    return { eventType: 'contradiction', signals };
  }

  // Statements lane / official claims vs official statement
  if (isStatementLike(item)) {
    if (/\b(statement|press\s+release|remarks|transcript)\b/i.test(h)) {
      signals.push({ ruleId: 'event:official_statement', message: 'Statement-like source + statement language' });
      return { eventType: 'official_statement', signals };
    }
    signals.push({ ruleId: 'event:statement_claim', message: 'Statement-like source (default claim surface)' });
    return { eventType: 'statement_claim', signals };
  }

  signals.push({ ruleId: 'event:generic_report', message: 'Fallback: generic report' });
  return { eventType: 'generic_report', signals };
}

