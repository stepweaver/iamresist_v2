import type { TitleProfile } from '@/lib/headlineTimeline/types';

/**
 * Function words and headline boilerplate.
 * Proper names, places, numbers, and distinctive nouns stay.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those',
  'it', 'its', 'into', 'over', 'after', 'before', 'about', 'amid', 'than', 'then', 'also',
  'more', 'most', 'very', 'via', 'per', 'out', 'up', 'down', 'not', 'but', 'if', 'so',
  'we', 'you', 'they', 'their', 'our', 'his', 'her', 'has', 'have', 'had', 'do', 'does',
  'did', 'vs', 'versus', 'just', 'how', 'what', 'why', 'when', 'where', 'who', 'will',
  'would', 'can', 'could', 'may', 'might', 'your', 'our', 'their', 'been',
]);

const BOILERPLATE = new Set([
  'breaking', 'exclusive', 'watch', 'video', 'videos', 'podcast', 'episode', 'explained',
  'explainer', 'update', 'updates', 'live', 'latest', 'today', 'tonight', 'yesterday',
  'recap', 'opinion', 'editorial', 'analysis', 'report', 'reports', 'news', 'must',
  'need', 'means', 'meaning', 'heres', 'here', 'clip', 'stream', 'full', 'show',
  'promo', 'code', 'codes', 'coupon', 'coupons', 'discount', 'discounts', 'off',
  'shorts', 'ahead', 'everything', 'really', 'massive', 'biggest', 'ever',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
  'october', 'november', 'december',
]);

/**
 * Broad context that appears across many different stories.
 * These tokens still count toward overlap. They cannot be the only
 * reason two titles join a cluster; a match also needs a distinctive anchor
 * (a specific name, place, noun, number, or uncommon token).
 * president / administration / government are also generic headline words.
 */
export const BROAD_CONTEXT_TOKENS = new Set([
  'trump',
  'iran',
  'war',
  'election',
  'administration',
  'president',
  'america',
  'government',
]);

/**
 * Shared generic nouns and headline verbs.
 * One of these plus a single name is not a story match.
 * A number plus one other real token still counts.
 */
const GENERIC = new Set([
  'plan', 'plans', 'proposal', 'proposals', 'bill', 'bills', 'law', 'laws', 'vote', 'votes',
  'deal', 'deals', 'story', 'case', 'court', 'house', 'senate', 'white', 'president',
  'administration', 'government', 'official', 'officials', 'policy', 'announcement',
  'announces', 'announce', 'announced', 'says', 'said', 'say', 'holds', 'hold', 'speaks',
  'speak', 'speaking', 'calls',   'call', 'talks', 'rally', 'interview', 'press',
  'conference', 'statement', 'claims', 'claim', 'new', 'first', 'second', 'amid',
  'message', 'makes', 'make', 'mistake', 'disaster',
]);

const YEAR_MIN = 1900;
const YEAR_MAX = 2099;

export function decodeTitleEntities(value: string): string {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

/** Strip a leading wire label only. The rest of the title stays intact. */
export function cleanupDisplayTitle(title: string): string {
  return decodeTitleEntities(title)
    .replace(/^\s*(breaking|exclusive|just in|watch)\s*[:|\-—]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandAmounts(title: string): string {
  return title
    .replace(/[$€£]\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g, (_, n) => ` ${String(n).replace(/,/g, '')} `)
    .replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (_, n) => ` ${String(n).replace(/,/g, '')} `);
}

function isYear(token: string): boolean {
  if (!/^\d{4}$/.test(token)) return false;
  const year = Number(token);
  return year >= YEAR_MIN && year <= YEAR_MAX;
}

export function profileTitle(title: string): TitleProfile {
  const expanded = expandAmounts(decodeTitleEntities(title).toLowerCase());
  const raw = expanded.split(/[^a-z0-9]+/).filter(Boolean);
  const meaningful: string[] = [];
  const support: string[] = [];
  const numbers: string[] = [];
  const seen = new Set<string>();

  for (const token of raw) {
    if (seen.has(token)) continue;
    const numeric = /^\d+$/.test(token);
    if (numeric) {
      if (token.length < 3 || isYear(token)) continue;
      seen.add(token);
      meaningful.push(token);
      numbers.push(token);
      support.push(token);
      continue;
    }
    if (token.length < 3 || STOPWORDS.has(token) || BOILERPLATE.has(token)) continue;
    seen.add(token);
    meaningful.push(token);
    if (!GENERIC.has(token)) support.push(token);
  }

  return { meaningful, support, numbers };
}

export function tokenSet(tokens: string[]): Set<string> {
  return new Set(tokens);
}
