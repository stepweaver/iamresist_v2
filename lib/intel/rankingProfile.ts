/**
 * User-tuned editorial ranking profile for intel desk surfaces.
 * Applied as a bounded score delta inside `computeDisplayPriority` (see `displayPriority.ts`).
 */

export type ProfileExplanation = { ruleId: string; message: string };

const COURT_AND_LITIGATION: RegExp[] = [
  /\binjunction\b/i,
  /\bstay\b/i,
  /\btro\b/i,
  /\btemporary\s+restraining\s+order\b/i,
  /\bpreliminary\s+injunction\b/i,
  /\bruling\b/i,
  /\bappeals?\s+court\b/i,
  /\bcircuit\s+court\b/i,
  /\bdistrict\s+court\b/i,
  /\bsupreme\s+court\b/i,
  /\bcertiorari\b/i,
  /\border\b/i,
];

const EXEC_AND_AGENCY: RegExp[] = [
  /\bexecutive\s+order\b/i,
  /\bwhite\s+house\b/i,
  /\bcabinet\b/i,
  /\bsecretary\b/i,
  /\bNSC\b/i,
  /\bNational\s+Security\s+Council\b/i,
  /\bD\.?O\.?J\.?\b|\bdepartment\s+of\s+justice\b/i,
  /\bD\.?H\.?S\.?\b|\bdepartment\s+of\s+homeland\s+security\b/i,
  /\bICE\b/i,
  /\bPentagon\b/i,
  /\bdepartment\s+of\s+defense\b/i,
];

const CONGRESS_AND_OVERSIGHT: RegExp[] = [
  /\bcongress\b/i,
  /\bsenate\b/i,
  /\bhouse\b/i,
  /\bcommittee\b/i,
  /\bsubpoena\b/i,
  /\boversight\b/i,
  /\bappropriations?\b/i,
  /\bshutdown\b/i,
  /\bcensure\b/i,
  /\bimpeach(?:ment|ed|es)?\b/i,
  /\bwar\s+powers\b/i,
];

const DEFENSE_TEMPO: RegExp[] = [
  /\bdeployment\b/i,
  /\bstrike\b/i,
  /\bsanctions\b/i,
  /\bmilitary\s+operation\b/i,
  /\bCENTCOM\b/i,
  /\bEUCOM\b/i,
  /\bAFRICOM\b/i,
  /\bINDOPACOM\b/i,
  /\bSOUTHCOM\b/i,
  /\bNORTHCOM\b/i,
  /\bNATO\b/i,
];

const REGION_PRIORITY: RegExp[] = [
  /\bIran\b/i,
  /\bUkraine\b/i,
  /\bRussia\b/i,
  /\bChina\b/i,
  /\bTaiwan\b/i,
  /\bMiddle\s+East\b/i,
  /\bGaza\b/i,
  /\bIsrael\b/i,
  /\bLatin\s+America\b/i,
  /\bSouth\s+America\b/i,
  /\bVenezuela\b/i,
  /\bCuba\b/i,
];

const GENERIC_COMMENTARY_NOISE: RegExp[] = [
  /\bhot\s+take\b/i,
  /\bjust\s+asking\b/i,
  /\bTHREAD\b/i,
];

const LIVE_MISSION_SIGNAL: RegExp[] = [
  /\bsubpoena\b/i,
  /\bhearing\b/i,
  /\bvote\b/i,
  /\bwhistleblower\b/i,
  /\binspector\s+general\b/i,
  /\bsurveillance\b/i,
  /\bdeport(?:ation|ed|ing)?\b/i,
  /\bdetain(?:ed|ing)?\b/i,
  /\bcrackdown\b/i,
  /\bprotest\b/i,
];

function firstMatch(text: string, patterns: RegExp[]): RegExp | null {
  for (const re of patterns) {
    if (re.test(text)) return re;
  }
  return null;
}

const PIZZA_SLUG = 'indicator-pentagon-pizza';

export function applyEditorialRankingProfile(input: {
  haystack: string;
  deskLane: string;
  provenanceClass: string;
  stateChangeType: string;
  sourceFamily?: string | null;
  contentUseMode?: string | null;
  sourceSlug?: string;
}): { delta: number; explanations: ProfileExplanation[] } {
  const explanations: ProfileExplanation[] = [];
  let delta = 0;
  const h = input.haystack;
  const lane = input.deskLane;

  if (input.contentUseMode === 'metadata_only' && lane !== 'indicators') {
    delta -= 40;
    explanations.push({
      ruleId: 'profile:metadata_only',
      message: 'Penalty: metadata-only pointers are not primary desk evidence',
    });
  }

  if (input.sourceSlug === PIZZA_SLUG) {
    delta -= 35;
    explanations.push({
      ruleId: 'profile:pentagon_pizza',
      message: 'Penalty: anecdotal indicator - not a hard signal',
    });
  }

  if (lane === 'statements') {
    delta -= 14;
    explanations.push({
      ruleId: 'profile:statements_lane',
      message: 'Penalty: claims lane - ranked below hard action by default',
    });
  }

  const courtSignal = Boolean(firstMatch(h, COURT_AND_LITIGATION));
  const execSignal = Boolean(firstMatch(h, EXEC_AND_AGENCY));
  const congressSignal = Boolean(firstMatch(h, CONGRESS_AND_OVERSIGHT));
  const defenseSignal = Boolean(firstMatch(h, DEFENSE_TEMPO));
  const liveMissionSignal = Boolean(firstMatch(h, LIVE_MISSION_SIGNAL));
  const institutionalHook = courtSignal || execSignal || congressSignal || defenseSignal;

  if (courtSignal) {
    delta += 8;
    explanations.push({ ruleId: 'profile:court', message: 'Boost: court / litigation signal' });
  }

  if (execSignal) {
    delta += 6;
    explanations.push({
      ruleId: 'profile:exec_agency',
      message: 'Boost: executive / agency / cabinet signal',
    });
  }

  if (congressSignal) {
    delta += 7;
    explanations.push({
      ruleId: 'profile:congress',
      message: 'Boost: congressional / oversight signal',
    });
  }

  if (defenseSignal) {
    delta += 4;
    explanations.push({ ruleId: 'profile:defense', message: 'Boost: defense / operations tempo' });
  } else if (lane === 'defense_ops') {
    delta += 1;
    explanations.push({
      ruleId: 'profile:defense_lane',
      message: 'Small boost: defense operations lane context',
    });
  }

  if (input.sourceFamily === 'watchdog_global' && firstMatch(h, REGION_PRIORITY)) {
    delta += 4;
    explanations.push({
      ruleId: 'profile:watchdog_region',
      message: 'Boost: independent watchdog on priority region / conflict',
    });
  }

  const isWire = input.provenanceClass === 'WIRE';
  const isCommentary = input.provenanceClass === 'COMMENTARY' || input.stateChangeType === 'commentary_item';
  if (isCommentary && !institutionalHook && !liveMissionSignal) {
    delta -= 5;
    explanations.push({
      ruleId: 'profile:commentary_default',
      message: 'Penalty: routine commentary - below hard action by default',
    });
  }

  if (isWire && !institutionalHook) {
    delta -= 2;
    explanations.push({
      ruleId: 'profile:wire_without_hard_signal',
      message: 'Penalty: wire alert without strong institutional signal',
    });
  }

  if (firstMatch(h, GENERIC_COMMENTARY_NOISE)) {
    delta -= 6;
    explanations.push({ ruleId: 'profile:noise', message: 'Penalty: low-signal chatter pattern' });
  }

  return { delta: Math.max(-40, Math.min(40, delta)), explanations };
}
