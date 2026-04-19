const POSITIVE_PATTERNS = [
  /\btrump\b/i,
  /\bmusk\b/i,
  /\bvance\b/i,
  /\bhegseth\b/i,
  /\bwhite\s+house\b/i,
  /\bpresident(?:ial)?\b/i,
  /\bexecutive\s+order\b/i,
  /\bexecutive\s+action\b/i,
  /\bpresidential\s+action\b/i,
  /\bmemorandum\b/i,
  /\bproclamation\b/i,
  /\bcabinet\b/i,
  /\bcongress\b/i,
  /\bsenate\b/i,
  /\brepresentatives?\b/i,
  /\bsupreme\s+court\b/i,
  /\bcourt\b/i,
  /\bjudge\b/i,
  /\bdoj\b/i,
  /\bfbi\b/i,
  /\bice\b/i,
  /\bimmigration\b/i,
  /\bdemocracy\b/i,
  /\bauthoritarian\b/i,
  /\bfascis/i,
  /\belection/i,
  /\bvoting\b/i,
  /\bprotest\b/i,
  /\baccountability\b/i,
  /\bcorruption\b/i,
  /\bcorrupt(?:ion|ed)?\b/i,
  /\boversight\b/i,
  /\bwatchdog\b/i,
  /\binspector\s+general\b/i,
  /\bsurveillance\b/i,
  /\bcensorship\b/i,
  /\bcivil\s+rights?\b/i,
  /\bhuman\s+rights?\b/i,
  /\bpress\s+freedom\b/i,
  /\bstate\s+of\s+emergency\b/i,
  /\bdetention\b/i,
  /\bdeport(?:ation|ed|ing)?\b/i,
  /\brefugees?\b/i,
  /\bcoup\b/i,
  /\bparliament\b/i,
  /\bprime\s+minister\b/i,
  /\bforeign\s+minister\b/i,
  /\bdiplomat(?:ic|s)?\b/i,
  /\bukraine\b/i,
  /\bkyiv\b/i,
  /\brussia\b/i,
  /\bputin\b/i,
  /\bzelensky(?:y)?\b/i,
  /\biran\b/i,
  /\btehran\b/i,
  /\bgaza\b/i,
  /\bisrael\b/i,
  /\bhamas\b/i,
  /\bhezbollah\b/i,
  /\bsyria\b/i,
  /\btaiwan\b/i,
  /\bchina\b/i,
  /\bceasefire\b/i,
  /\bsanctions\b/i,
  /\bmissile\b/i,
  /\bdrone\b/i,
  /\bairstrike\b/i,
  /\bstrike(s|ing)?\b/i,
  /\bshelling\b/i,
  /\boffensive\b/i,
  /\btroops?\b/i,
  /\binvasion\b/i,
  /\boccupation\b/i,
  /\bsiege\b/i,
  /\bcivilian(?:s)?\b/i,
  /\bwar\b/i,
  /\bmilitary\b/i,
  /\bdefen[cs]e\b/i,
  /\bpentagon\b/i,
  /\bnato\b/i,
  /\bfederal\s+register\b/i,
];

const SPORTS_PATTERNS = [
  /\bnba\b/i,
  /\bnfl\b/i,
  /\bmlb\b/i,
  /\bnhl\b/i,
  /\bncaa\b/i,
  /\bplayoffs?\b/i,
  /\bfinal\s+four\b/i,
  /\bworld\s+series\b/i,
  /\bsuper\s+bowl\b/i,
  /\btransfer\s+portal\b/i,
  /\bmock\s+draft\b/i,
  /\bscore(s|d)?\b/i,
  /\bcoach\b/i,
  /\bquarterback\b/i,
  /\bpoint\s+spread\b/i,
  /\bfantasy\b/i,
];

const SOFT_OFFTOPIC_PATTERNS = [
  /\bcelebrity\b/i,
  /\bmovie\b/i,
  /\bbox\s+office\b/i,
  /\bstreaming\b/i,
  /\bred\s+carpet\b/i,
  /\bfashion\b/i,
  /\btravel\b/i,
  /\bfood\b/i,
  /\brecipe\b/i,
  /\bgossip\b/i,
  /\bmusic\b/i,
  /\balbum\b/i,
  /\bsong\b/i,
  /\bband\b/i,
  /\bconcert\b/i,
  /\btour\b/i,
  /\bfestival\b/i,
  /\bspotify\b/i,
  /\bgrammys?\b/i,
  /\btiny\s+desk\b/i,
  /\breality\s+tv\b/i,
  /\bwellness\b/i,
  /\bskin\s*care\b/i,
  /\bmakeup\b/i,
  /\bdating\b/i,
];

const AMBIGUOUS_CURRENT_EVENTS_PATTERNS = [
  /\bbreaking\b/i,
  /\bblast\b/i,
  /\bexplosion\b/i,
  /\bfire\b/i,
  /\bcrash\b/i,
  /\bshutdown\b/i,
  /\bdisruption\b/i,
  /\bdelays?\b/i,
  /\bemergency\b/i,
  /\bresponse\b/i,
  /\binvestigat(?:e|ion|ors?)\b/i,
  /\bauthorities\b/i,
  /\bofficials?\b/i,
  /\bdamage\b/i,
];

function collectMatches(text: string, patterns: RegExp[]) {
  const hits: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) hits.push(match[0].toLowerCase());
  }
  return [...new Set(hits)];
}

export type MissionScopeState = 'in_scope' | 'ambiguous' | 'off_topic';
export type MissionScopeAssessment = {
  scopeState: MissionScopeState;
  allowedOnHomepageCommentary: boolean;
  allowedOnIntelDesk: boolean;
  hardOffTopic: boolean;
  softOffTopic: boolean;
  positiveHits: string[];
  sportsHits: string[];
  softOffTopicHits: string[];
  scoreDelta: number;
  reason: string;
};

type OffTopicSubtype = 'sports' | 'entertainment_lifestyle' | null;

export function assessMissionScope({
  title = '',
  summary = '',
  categories = [],
}: {
  title?: string;
  summary?: string | null;
  categories?: string[];
}): MissionScopeAssessment {
  const text = [title, summary ?? '', ...(Array.isArray(categories) ? categories : [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const positiveHits = collectMatches(text, POSITIVE_PATTERNS);
  const sportsHits = collectMatches(text, SPORTS_PATTERNS);
  const softOffTopicHits = collectMatches(text, SOFT_OFFTOPIC_PATTERNS);
  const ambiguousCurrentEventsHits = collectMatches(text, AMBIGUOUS_CURRENT_EVENTS_PATTERNS);

  const hasPositive = positiveHits.length > 0;
  const hasAmbiguousCurrentEventsSignal = ambiguousCurrentEventsHits.length > 0;
  // Internal policy:
  // - `in_scope`: clear civic / democracy / war / accountability anchors.
  // - `off_topic`: sports-only or entertainment/lifestyle-only leakage with no stronger anchor.
  // - `ambiguous`: broad current-events reporting that is not obviously off-mission, but also
  //   does not yet carry a strong mission hook. Ambiguous items may stay eligible downstream,
  //   but only with stricter relevance and display handling.
  const offTopicSubtype: OffTopicSubtype = hasPositive
    ? null
    : sportsHits.length > 0
      ? 'sports'
      : softOffTopicHits.length > 0 && !hasAmbiguousCurrentEventsSignal
        ? 'entertainment_lifestyle'
        : null;
  const scopeState: MissionScopeState = hasPositive
    ? 'in_scope'
    : offTopicSubtype
      ? 'off_topic'
      : 'ambiguous';

  const hardOffTopic = scopeState === 'off_topic' && offTopicSubtype === 'sports';
  const softOffTopic = scopeState === 'off_topic' && offTopicSubtype === 'entertainment_lifestyle';
  const allowedOnHomepageCommentary = scopeState === 'in_scope';
  const allowedOnIntelDesk = scopeState !== 'off_topic';

  let scoreDelta = 0;
  scoreDelta += Math.min(positiveHits.length, 2) * 3;
  if (hardOffTopic) scoreDelta -= 16;
  else if (softOffTopic) scoreDelta -= 8;
  scoreDelta = Math.max(-16, Math.min(6, scoreDelta));

  const reason = scopeState === 'off_topic'
    ? hardOffTopic
      ? `Off-topic: sports-only item (${sportsHits.join(', ')})`
      : `Off-topic: entertainment / lifestyle item (${softOffTopicHits.join(', ')})`
    : scopeState === 'in_scope'
      ? `In-scope: ${positiveHits.join(', ')}`
      : 'Ambiguous: broad current-events item with no strong mission anchor';

  return {
    scopeState,
    allowedOnHomepageCommentary,
    allowedOnIntelDesk,
    hardOffTopic,
    softOffTopic,
    positiveHits,
    sportsHits,
    softOffTopicHits,
    scoreDelta,
    reason,
  };
}
