/**
 * Named-entity grouping for Theme Memory identity comparison.
 *
 * Adjacent given-name + surname tokens are one person/entity, not two
 * independent event anchors. Person overlap can support a match; it does
 * not by itself establish the same event.
 */

import {
  featureStrength,
  isDistinctiveActionToken,
  isGenericInstitutionalEventType,
  isWeakEntityToken,
  isWeakPersonEntityToken,
  isWeakPhrase,
  phraseStrength,
  stemThemeToken,
} from '@/lib/themeMemory/featureStrength';

/**
 * Reusable given-name lexicon. This is not a special-case list of specific
 * people; any First+Last pair matching these tokens collapses to one entity.
 */
const GIVEN_NAME_SOURCE = [
  'aaron',
  'adam',
  'alexander',
  'alex',
  'amanda',
  'amy',
  'andrew',
  'andy',
  'angela',
  'anna',
  'anthony',
  'antonio',
  'ashley',
  'barack',
  'benjamin',
  'ben',
  'betty',
  'bill',
  'bobby',
  'bob',
  'brandon',
  'brian',
  'bryan',
  'bruce',
  'camila',
  'carl',
  'carlos',
  'carol',
  'caroline',
  'catherine',
  'charles',
  'charlie',
  'chris',
  'christian',
  'christina',
  'christine',
  'christopher',
  'chuck',
  'claire',
  'colin',
  'cory',
  'craig',
  'dan',
  'daniel',
  'danny',
  'dave',
  'david',
  'deborah',
  'dennis',
  'derek',
  'diana',
  'diane',
  'donald',
  'don',
  'donna',
  'douglas',
  'doug',
  'edward',
  'ed',
  'elaine',
  'elizabeth',
  'emily',
  'eric',
  'erik',
  'eugene',
  'frank',
  'gary',
  'gavin',
  'george',
  'gerald',
  'glenn',
  'grace',
  'greg',
  'gregory',
  'harold',
  'harry',
  'heather',
  'helen',
  'henry',
  'hillary',
  'howard',
  'ian',
  'isaac',
  'jack',
  'jacob',
  'jake',
  'james',
  'jamie',
  'jane',
  'janet',
  'jason',
  'jay',
  'jd',
  'jeff',
  'jeffrey',
  'jennifer',
  'jeremy',
  'jerry',
  'jessica',
  'jim',
  'jimmy',
  'joe',
  'joel',
  'john',
  'johnny',
  'jon',
  'jonathan',
  'jordan',
  'jose',
  'joseph',
  'josh',
  'joshua',
  'juan',
  'julia',
  'julian',
  'justin',
  'kamala',
  'karen',
  'kash',
  'kate',
  'katherine',
  'kathleen',
  'kathy',
  'katie',
  'keith',
  'kelly',
  'ken',
  'kenneth',
  'kevin',
  'kim',
  'kimberly',
  'kyle',
  'larry',
  'laura',
  'lauren',
  'lawrence',
  'linda',
  'lisa',
  'logan',
  'louis',
  'louise',
  'lucas',
  'luis',
  'luke',
  'marco',
  'marcus',
  'margaret',
  'maria',
  'marie',
  'mark',
  'martha',
  'martin',
  'mary',
  'matt',
  'matthew',
  'megan',
  'melania',
  'melissa',
  'michael',
  'michelle',
  'miguel',
  'mike',
  'mitchell',
  'mitch',
  'nancy',
  'natalie',
  'nathan',
  'neil',
  'nicholas',
  'nick',
  'nicole',
  'noah',
  'oliver',
  'olivia',
  'oscar',
  'pamela',
  'patricia',
  'patrick',
  'pat',
  'paul',
  'peter',
  'pete',
  'philip',
  'phillip',
  'rachel',
  'ralph',
  'randall',
  'randy',
  'raymond',
  'rebecca',
  'richard',
  'rick',
  'rob',
  'robert',
  'robin',
  'roger',
  'ron',
  'ronald',
  'russell',
  'ruth',
  'ryan',
  'samuel',
  'sam',
  'sandra',
  'sara',
  'sarah',
  'scott',
  'sean',
  'sharon',
  'shaun',
  'shawn',
  'shirley',
  'stanley',
  'stephanie',
  'stephen',
  'steve',
  'steven',
  'stuart',
  'susan',
  'ted',
  'teresa',
  'terry',
  'theodore',
  'thomas',
  'tim',
  'timothy',
  'tina',
  'todd',
  'tom',
  'tony',
  'tracy',
  'travis',
  'tyler',
  'victor',
  'victoria',
  'vincent',
  'virginia',
  'walter',
  'wayne',
  'wendy',
  'william',
  'zachary',
  'zach',
];

const GIVEN_NAME_TOKENS = new Set(
  GIVEN_NAME_SOURCE.flatMap((name) => {
    const raw = name.toLowerCase();
    return [raw, stemThemeToken(raw)];
  }),
);

function uniqueSpans(spans: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const span of spans) {
    const parts = [...new Set(span.map((part) => stemThemeToken(part)).filter(Boolean))].sort();
    if (parts.length < 2) continue;
    const key = parts.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parts);
  }
  return out;
}

export function isGivenNameToken(token: string): boolean {
  const raw = token.toLowerCase().trim();
  if (!raw) return false;
  return GIVEN_NAME_TOKENS.has(raw) || GIVEN_NAME_TOKENS.has(stemThemeToken(raw));
}

function isSurnameLikeToken(token: string): boolean {
  const raw = token.toLowerCase().trim();
  if (!raw) return false;
  if (isDistinctiveActionToken(raw)) return false;
  if (isWeakPersonEntityToken(raw)) return true;
  if (isGivenNameToken(raw)) return false;
  return featureStrength(raw) === 'strong';
}

export function isPersonNamePair(left: string, right: string): boolean {
  const a = stemThemeToken(left);
  const b = stemThemeToken(right);
  if (!a || !b || a === b) return false;
  if (isDistinctiveActionToken(a) || isDistinctiveActionToken(b)) return false;
  if (isGivenNameToken(a) && isSurnameLikeToken(b)) return true;
  if (isGivenNameToken(b) && isSurnameLikeToken(a)) return true;
  return false;
}

export function isPersonNamePhrase(phrase: string): boolean {
  const parts = phraseParts(phrase);
  if (parts.length < 2) return false;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (isPersonNamePair(parts[i], parts[i + 1])) return true;
  }
  return false;
}

function phraseParts(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * A strong multi-word phrase that is not a person name and not a known
 * weak/generic phrase. Two default-strong unigrams glued together are not
 * yet hard event evidence; see isHardEventPhrase().
 */
export function isStrongNonPersonPhrase(phrase: string): boolean {
  const parts = phraseParts(phrase);
  if (parts.length < 2) return false;
  if (isPersonNamePhrase(phrase)) return false;
  if (isWeakPhrase(phrase)) return false;
  return phraseStrength(phrase) === 'strong';
}

/**
 * A phrase that itself identifies an event/object: mixed strength
 * (strong + supporting/entity), a distinctive action, or 3+ tokens.
 * "flock camera" qualifies. "price problem" does not.
 */
export function isHardEventPhrase(phrase: string): boolean {
  if (isGenericInstitutionalEventType(phrase)) return false;
  if (!isStrongNonPersonPhrase(phrase)) return false;
  const parts = phraseParts(phrase);
  if (parts.some((part) => isDistinctiveActionToken(part))) return true;
  const strengths = parts.map((part) => featureStrength(part));
  const hasStrong = strengths.some((strength) => strength === 'strong');
  const hasSupporting = strengths.some((strength) => strength === 'supporting');
  const hasWeakEntity = parts.some((part) => isWeakEntityToken(part));
  if (hasStrong && hasSupporting) return true;
  if (hasStrong && hasWeakEntity) return true;
  return parts.length >= 3 && hasStrong;
}

/**
 * Two or more strong non-person phrases that share a token, e.g.
 * "interest rate" + "rais interest". A single generic bigram is not enough.
 */
export function hasConnectedEventCollocation(phrases: string[]): boolean {
  const strong = [...new Set(phrases.filter(isStrongNonPersonPhrase))];
  if (strong.length < 2) return false;
  const tokenSets = strong.map((phrase) => new Set(phraseParts(phrase).map((part) => stemThemeToken(part))));
  for (let i = 0; i < tokenSets.length; i += 1) {
    for (let j = i + 1; j < tokenSets.length; j += 1) {
      for (const token of tokenSets[i]) {
        if (token && tokenSets[j].has(token)) return true;
      }
    }
  }
  return false;
}

export function extractPersonEntitySpans(tokens: string[]): string[][] {
  const stemmed = tokens.map((token) => stemThemeToken(token)).filter(Boolean);
  const pairs: string[][] = [];
  for (let i = 0; i < stemmed.length - 1; i += 1) {
    const left = stemmed[i];
    const right = stemmed[i + 1];
    if (left && right && isPersonNamePair(left, right)) {
      pairs.push([left, right]);
    }
  }
  return uniqueSpans(pairs);
}

function personSpansFromPhrases(phrases: string[]): string[][] {
  const spans: string[][] = [];
  for (const phrase of phrases) {
    const parts = phrase.split(' ').filter(Boolean);
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (isPersonNamePair(parts[i], parts[i + 1])) {
        spans.push([stemThemeToken(parts[i]), stemThemeToken(parts[i + 1])]);
      }
    }
  }
  return uniqueSpans(spans);
}

/**
 * Collapse shared distinctive tokens that belong to the same named entity
 * into a single group. Leftover tokens remain their own group.
 */
export function groupNamedEntityAnchors(tokens: string[], spans: string[][]): string[][] {
  const tokenList = [...new Set(tokens.map((token) => stemThemeToken(token)).filter(Boolean))];
  const parent = new Map<string, string>();

  function find(token: string): string {
    if (!parent.has(token)) parent.set(token, token);
    const current = parent.get(token) || token;
    if (current !== token) {
      const root = find(current);
      parent.set(token, root);
      return root;
    }
    return token;
  }

  function union(left: string, right: string) {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  }

  for (const token of tokenList) find(token);

  const tokenSet = new Set(tokenList);
  for (const span of spans) {
    const overlap = span.map((part) => stemThemeToken(part)).filter((part) => tokenSet.has(part));
    for (let i = 1; i < overlap.length; i += 1) {
      union(overlap[0], overlap[i]);
    }
  }

  const grouped = new Map<string, string[]>();
  for (const token of tokenList) {
    const root = find(token);
    const list = grouped.get(root) || [];
    list.push(token);
    grouped.set(root, list);
  }
  return [...grouped.values()].map((parts) => [...new Set(parts)].sort());
}

function entityAnchorId(parts: string[]): string {
  const sorted = [...parts].sort();
  return sorted.length > 1 ? `entity:${sorted.join('|')}` : `token:${sorted[0]}`;
}

function phraseAddsIndependentObject(phrase: string, countedTokens: Set<string>): boolean {
  if (isPersonNamePhrase(phrase)) return false;
  if (isGenericInstitutionalEventType(phrase)) return false;
  const parts = phrase
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => stemThemeToken(part));
  return parts.some((part) => {
    if (!part || countedTokens.has(part)) return false;
    const strength = featureStrength(part);
    return strength === 'strong' || strength === 'supporting';
  });
}

/**
 * Independent event-level anchors after collapsing same-entity tokens.
 * A lone person/entity — including First+Last — is one anchor, not two.
 */
export function independentEventAnchors(input: {
  sharedTokens: string[];
  sharedPhrases: string[];
  entitySpans?: string[][];
  extraPhrases?: string[];
}): string[] {
  const spans = uniqueSpans([
    ...(input.entitySpans || []),
    ...personSpansFromPhrases([...(input.sharedPhrases || []), ...(input.extraPhrases || [])]),
  ]);
  const groups = groupNamedEntityAnchors(input.sharedTokens, spans);
  const anchors = groups.map((parts) => entityAnchorId(parts));
  const countedTokens = new Set(groups.flat());
  for (const phrase of input.sharedPhrases || []) {
    if (!phraseAddsIndependentObject(phrase, countedTokens)) continue;
    anchors.push(`phrase:${phrase}`);
  }
  return [...new Set(anchors)];
}
