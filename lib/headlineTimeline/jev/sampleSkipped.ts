import { jevPairSourceBucket } from '@/lib/headlineTimeline/jev/sourcePriority';
import type { SkippedPairSample, SkippedSampleKind } from '@/lib/headlineTimeline/jev/types';
import type { HeadlineCandidate } from '@/lib/headlineTimeline/types';

/**
 * A source may show up this many times in one skipped sample, counting
 * either side of a pair once. Evaluation only. The prefilter is unchanged.
 */
export const SKIPPED_SAMPLE_SOURCE_CAP = 3;

export type SkippedPairDraft = {
  a: HeadlineCandidate;
  b: HeadlineCandidate;
  similarity: number;
  lexicalCluster: boolean;
  reason: string;
  /** Encounter order from the candidate sweep. Lower is earlier. */
  order: number;
};

type DiversityState = {
  counts: Map<string, number>;
  combos: Set<string>;
};

function pairKey(pair: Pick<SkippedPairDraft, 'a' | 'b'>): string {
  return pair.a.id < pair.b.id ? `${pair.a.id}\0${pair.b.id}` : `${pair.b.id}\0${pair.a.id}`;
}

function uniqueDrafts(drafts: SkippedPairDraft[]): SkippedPairDraft[] {
  const seen = new Set<string>();
  const unique: SkippedPairDraft[] = [];
  for (const draft of drafts) {
    const key = pairKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(draft);
  }
  return unique;
}

/**
 * Near-miss order: cross-source buckets first, then higher similarity,
 * then the original encounter order.
 */
function compareNearMiss(left: SkippedPairDraft, right: SkippedPairDraft): number {
  const bucket = jevPairSourceBucket(left.a, left.b) - jevPairSourceBucket(right.a, right.b);
  if (bucket !== 0) return bucket;
  if (left.similarity !== right.similarity) return right.similarity - left.similarity;
  return left.order - right.order;
}

function normalizedSourceName(name: string): string {
  return name.trim().toLowerCase();
}

/** Name when present, so one outlet on two channels counts once. */
function outletKey(item: Pick<HeadlineCandidate, 'sourceId' | 'sourceName'>): string {
  const name = normalizedSourceName(item.sourceName);
  return name ? `name:${name}` : `id:${item.sourceId}`;
}

function comboKey(pair: Pick<SkippedPairDraft, 'a' | 'b'>): string {
  const left = outletKey(pair.a);
  const right = outletKey(pair.b);
  return left < right ? `${left}\0${right}` : `${right}\0${left}`;
}

/** Every id and name that should count as "this source appeared". */
function appearanceKeys(pair: Pick<SkippedPairDraft, 'a' | 'b'>): string[] {
  const keys = new Set<string>();
  for (const item of [pair.a, pair.b]) {
    keys.add(`id:${item.sourceId}`);
    const name = normalizedSourceName(item.sourceName);
    if (name) keys.add(`name:${name}`);
  }
  return [...keys];
}

function underCap(pair: SkippedPairDraft, state: DiversityState): boolean {
  return appearanceKeys(pair).every((key) => (state.counts.get(key) ?? 0) < SKIPPED_SAMPLE_SOURCE_CAP);
}

function commit(pair: SkippedPairDraft, state: DiversityState) {
  for (const key of appearanceKeys(pair)) {
    state.counts.set(key, (state.counts.get(key) ?? 0) + 1);
  }
  state.combos.add(comboKey(pair));
}

function newDiversityState(): DiversityState {
  return { counts: new Map(), combos: new Set() };
}

function spreadPick<T>(items: T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return items.slice();
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(items[Math.floor((index * items.length) / count)]);
  }
  return picked;
}

function eligible(
  items: SkippedPairDraft[],
  taken: Set<string>,
  state: DiversityState,
  allowRepeatCombo: boolean,
): SkippedPairDraft[] {
  return items.filter((pair) => {
    if (taken.has(pairKey(pair))) return false;
    if (!allowRepeatCombo && state.combos.has(comboKey(pair))) return false;
    return underCap(pair, state);
  });
}

/**
 * Walk `ordered` once for new outlet pairs, then again for repeats that
 * are still under the source cap. Stops when the quota or the cap runs out.
 */
function takeInOrder(ordered: SkippedPairDraft[], count: number, state: DiversityState): SkippedPairDraft[] {
  if (count <= 0) return [];
  const picked: SkippedPairDraft[] = [];
  const taken = new Set<string>();
  for (const allowRepeatCombo of [false, true]) {
    if (picked.length >= count) break;
    for (const pair of ordered) {
      if (picked.length >= count) break;
      const key = pairKey(pair);
      if (taken.has(key)) continue;
      if (!allowRepeatCombo && state.combos.has(comboKey(pair))) continue;
      if (!underCap(pair, state)) continue;
      taken.add(key);
      commit(pair, state);
      picked.push(pair);
    }
  }
  return picked;
}

/**
 * Even spread of encounter order, skipping pairs that repeat an outlet
 * combination or would put a source over the cap. A later pass may repeat
 * an outlet pair when distinct pairs cannot fill the open slots.
 */
function spreadPickDiverse(items: SkippedPairDraft[], count: number, state: DiversityState): SkippedPairDraft[] {
  if (count <= 0) return [];
  const picked: SkippedPairDraft[] = [];
  const taken = new Set<string>();
  for (const allowRepeatCombo of [false, true]) {
    while (picked.length < count) {
      const available = eligible(items, taken, state, allowRepeatCombo);
      if (available.length === 0) break;
      const batch = spreadPick(available, count - picked.length);
      let accepted = 0;
      for (const pair of batch) {
        if (picked.length >= count) break;
        if (!allowRepeatCombo && state.combos.has(comboKey(pair))) continue;
        if (!underCap(pair, state)) continue;
        taken.add(pairKey(pair));
        commit(pair, state);
        picked.push(pair);
        accepted += 1;
      }
      if (accepted === 0) break;
    }
  }
  return picked;
}

/**
 * Walk source buckets in eval priority. Within a bucket, take an even
 * spread of encounter order. Later buckets fill only the slots still open.
 */
function spreadBySourcePriority(
  pairs: SkippedPairDraft[],
  count: number,
  state: DiversityState,
): SkippedPairDraft[] {
  if (count <= 0) return [];
  const picked: SkippedPairDraft[] = [];
  for (const bucket of [0, 1, 2, 3] as const) {
    if (picked.length >= count) break;
    const group = pairs
      .filter((pair) => jevPairSourceBucket(pair.a, pair.b) === bucket)
      .sort((left, right) => left.order - right.order);
    picked.push(...spreadPickDiverse(group, count - picked.length, state));
  }
  return picked;
}

function toSample(draft: SkippedPairDraft, sampleKind: SkippedSampleKind): SkippedPairSample {
  return {
    a: draft.a,
    b: draft.b,
    similarity: draft.similarity,
    lexicalCluster: draft.lexicalCluster,
    prefilter: { action: 'skip', reason: draft.reason },
    sampleKind,
  };
}

/**
 * Deterministic false-negative sample.
 *
 * The request is capped at the pool size, then split about in half
 * (13 near-miss and 12 baseline when 25 are requested and the pool can
 * fill both halves). Near-miss rows walk source-priority, then similarity.
 * Baseline rows are an even spread of what remains, again walking source
 * buckets before same-source pairs. The two lists never share a pair.
 *
 * Neither half may let one outlet dominate. A source is capped at
 * SKIPPED_SAMPLE_SOURCE_CAP appearances across the whole sample. Distinct
 * outlet pairs are taken before a second pair from outlets already used.
 * The sample can be shorter than requested when the cap runs out.
 */
export function selectSkippedSamples(drafts: SkippedPairDraft[], sampleSize: number): SkippedPairSample[] {
  if (sampleSize <= 0 || drafts.length === 0) return [];
  const pool = uniqueDrafts(drafts);
  const requested = Math.min(sampleSize, pool.length);
  const nearTarget = Math.ceil(requested / 2);
  const baselineTarget = requested - nearTarget;
  const state = newDiversityState();

  const ranked = pool.slice().sort(compareNearMiss);
  const nearDrafts = takeInOrder(ranked, nearTarget, state);
  const nearKeys = new Set(nearDrafts.map(pairKey));
  const rest = ranked.filter((pair) => !nearKeys.has(pairKey(pair)));
  const baselineDrafts = spreadBySourcePriority(rest, baselineTarget, state);

  return [
    ...nearDrafts.map((pair) => toSample(pair, 'near_miss')),
    ...baselineDrafts.map((pair) => toSample(pair, 'baseline')),
  ];
}
