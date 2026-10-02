import {
  HEADLINE_CLUSTER_LEXICAL_SIMILARITY,
  HEADLINE_CLUSTER_MIN_SIMILARITY,
  HEADLINE_SINGLE_TOKEN_SCORE_CAP,
  HEADLINE_TIMELINE_WINDOW_HOURS,
} from '@/lib/headlineTimeline/constants';
import { BROAD_CONTEXT_TOKENS, profileTitle, tokenSet } from '@/lib/headlineTimeline/normalize';

export type TitleSimilarity = {
  score: number;
  shared: string[];
  sharedSupport: string[];
  sharedNumbers: string[];
  /** Shared support tokens that are not broad context. A cluster needs at least one. */
  sharedAnchors: string[];
  cluster: boolean;
};

function intersect(a: string[], b: string[]): string[] {
  const right = tokenSet(b);
  return a.filter((token) => right.has(token));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function timeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function withinHeadlineWindow(
  a: string | null | undefined,
  b: string | null | undefined,
  windowHours = HEADLINE_TIMELINE_WINDOW_HOURS,
): boolean {
  const left = timeMs(a);
  const right = timeMs(b);
  if (left == null || right == null) return false;
  return Math.abs(left - right) <= windowHours * 3600000;
}

/**
 * Deterministic overlap. A single shared word, including a name, stays under the cap.
 * A shared number plus another support token adds a fixed bonus.
 * Broad context tokens can raise the score, but they cannot create a cluster alone.
 */
export function compareTitles(
  a: string,
  b: string,
  times?: { a?: string | null; b?: string | null; windowHours?: number },
): TitleSimilarity {
  const left = profileTitle(a);
  const right = profileTitle(b);
  const shared = intersect(left.meaningful, right.meaningful);
  const sharedSupport = intersect(left.support, right.support);
  const sharedNumbers = intersect(left.numbers, right.numbers);
  const sharedAnchors = sharedSupport.filter((token) => !BROAD_CONTEXT_TOKENS.has(token));

  const empty: TitleSimilarity = {
    score: 0,
    shared,
    sharedSupport,
    sharedNumbers,
    sharedAnchors,
    cluster: false,
  };
  if (!shared.length) return empty;

  const union = left.meaningful.length + right.meaningful.length - shared.length;
  const jaccard = union === 0 ? 0 : shared.length / union;
  let score = jaccard * 0.7 + Math.min(sharedSupport.length, 4) * 0.1;
  if (sharedNumbers.length > 0 && sharedSupport.length >= 2) score += 0.28;
  if (shared.length === 1) score = Math.min(score, HEADLINE_SINGLE_TOKEN_SCORE_CAP);
  score = round3(Math.min(1, score));

  const timed =
    times == null
      ? true
      : withinHeadlineWindow(times.a, times.b, times.windowHours ?? HEADLINE_TIMELINE_WINDOW_HOURS);

  const cluster =
    timed &&
    sharedAnchors.length >= 1 &&
    sharedSupport.length >= 2 &&
    score >= HEADLINE_CLUSTER_MIN_SIMILARITY &&
    (sharedNumbers.length >= 1 || sharedSupport.length >= 3 || score >= HEADLINE_CLUSTER_LEXICAL_SIMILARITY);

  return { score, shared, sharedSupport, sharedNumbers, sharedAnchors, cluster };
}

export function titleSimilarity(a: string, b: string): number {
  return compareTitles(a, b).score;
}

export function titlesShouldCluster(
  a: string,
  b: string,
  times?: { a?: string | null; b?: string | null; windowHours?: number },
): boolean {
  return compareTitles(a, b, times).cluster;
}
