const POSITIVE_PATTERNS = [
  /\btrump\b/i,
  /\bmusk\b/i,
  /\bvance\b/i,
  /\bhegseth\b/i,
  /\bwhite\s+house\b/i,
  /\bcabinet\b/i,
  /\bcongress\b/i,
  /\bsenate\b/i,
  /\bhouse\b/i,
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
  /\bukraine\b/i,
  /\bkyiv\b/i,
  /\brussia\b/i,
  /\bputin\b/i,
  /\biran\b/i,
  /\btehran\b/i,
  /\bgaza\b/i,
  /\bisrael\b/i,
  /\bceasefire\b/i,
  /\bsanctions\b/i,
  /\bmissile\b/i,
  /\bdrone\b/i,
  /\bairstrike\b/i,
  /\binvasion\b/i,
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
];

function collectMatches(text: string, patterns: RegExp[]) {
  const hits: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) hits.push(match[0].toLowerCase());
  }
  return [...new Set(hits)];
}

export function assessMissionScope({
  title = '',
  summary = '',
  categories = [],
}: {
  title?: string;
  summary?: string | null;
  categories?: string[];
}) {
  const text = [title, summary ?? '', ...(Array.isArray(categories) ? categories : [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const positiveHits = collectMatches(text, POSITIVE_PATTERNS);
  const sportsHits = collectMatches(text, SPORTS_PATTERNS);
  const softOffTopicHits = collectMatches(text, SOFT_OFFTOPIC_PATTERNS);

  const hasPositive = positiveHits.length > 0;
  const hardOffTopic = sportsHits.length > 0 && !hasPositive;
  const softOffTopic = !hardOffTopic && softOffTopicHits.length > 0 && !hasPositive;

  const allowedOnHomepageCommentary = hasPositive && !hardOffTopic && !softOffTopic;
  const allowedOnIntelDesk = hasPositive && !hardOffTopic && !softOffTopic;

  let scoreDelta = positiveHits.length * 8;
  scoreDelta -= sportsHits.length * 18;
  scoreDelta -= softOffTopicHits.length * 10;
  scoreDelta = Math.max(-30, Math.min(24, scoreDelta));

  const reason = hardOffTopic
    ? `Off-topic: sports-only item (${sportsHits.join(', ')})`
    : softOffTopic
      ? `Off-topic: entertainment / lifestyle item (${softOffTopicHits.join(', ')})`
      : hasPositive
        ? `In-scope: ${positiveHits.join(', ')}`
        : 'No strong mission anchor found';

  return {
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