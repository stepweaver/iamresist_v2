import { describe, expect, it, vi } from 'vitest';

import { buildJevRelationRequest, classifyHeadlinePair, parseJevSystemOneResponse } from '@/lib/headlineTimeline/jev/classifyPair';
import {
  HEADLINE_JEV_RELATION_SCHEMA_VERSION,
  JEV_RELATION_CRITERIA,
  JEV_RELATION_INSTRUCTIONS,
  JEV_SAME_EVENT_JOIN_THRESHOLD,
} from '@/lib/headlineTimeline/jev/constants';
import {
  buildHeadlineJevCandidateSnapshot,
  headlineJevCandidateSnapshotPath,
  parseHeadlineJevCandidateSnapshot,
} from '@/lib/headlineTimeline/jev/candidateSnapshot';
import { headlineJevEvalUsage, parseHeadlineJevEvalArgs } from '@/lib/headlineTimeline/jev/evalArgs';
import { evaluateHeadlinePairs } from '@/lib/headlineTimeline/jev/evaluate';
import { decideJevPairPolicy } from '@/lib/headlineTimeline/jev/policy';
import { prefilterHeadlinePair } from '@/lib/headlineTimeline/jev/prefilter';
import { formatJevEvaluationReport, formatJevPair, jevEvaluationArtifact } from '@/lib/headlineTimeline/jev/report';
import { selectSkippedSamples, SKIPPED_SAMPLE_SOURCE_CAP, type SkippedPairDraft } from '@/lib/headlineTimeline/jev/sampleSkipped';
import { jevPairSourceBucket } from '@/lib/headlineTimeline/jev/sourcePriority';
import {
  HEADLINE_RELATIONS,
  RETIRED_HEADLINE_RELATION,
  type HeadlineRelation,
  type JevClassificationSuccess,
  type JevPairPolicyDecision,
} from '@/lib/headlineTimeline/jev/types';
import type { HeadlineCandidate } from '@/lib/headlineTimeline/types';

const NOW = '2026-10-02T18:00:00.000Z';
const EARLIER = '2026-10-02T12:00:00.000Z';
const OUTSIDE = '2026-08-01T12:00:00.000Z';

function candidate(overrides: Partial<HeadlineCandidate> & Pick<HeadlineCandidate, 'id' | 'title'>): HeadlineCandidate {
  return {
    sourceId: `src:${overrides.id}`,
    sourceName: 'Source',
    sourceKind: 'news',
    channel: 'intel',
    url: `https://example.com/${overrides.id}`,
    publishedAt: NOW,
    summary: 'A short description.',
    ...overrides,
  };
}

function distribution(choice: HeadlineRelation, probability: number): Record<HeadlineRelation, number> {
  const rest = Number(((1 - probability) / (HEADLINE_RELATIONS.length - 1)).toFixed(4));
  const probabilities = {} as Record<HeadlineRelation, number>;
  for (const relation of HEADLINE_RELATIONS) probabilities[relation] = rest;
  probabilities[choice] = probability;
  return probabilities;
}

function success(
  relation: HeadlineRelation,
  probability: number,
  confidence: number,
): JevClassificationSuccess {
  return {
    ok: true,
    relation,
    probabilities: distribution(relation, probability),
    confidence,
    model: 'jev-1.13.0',
    usage: { inputTokens: 300, outputTokens: 20 },
    elapsedMs: 40,
  };
}

function systemOneBody(result: JevClassificationSuccess) {
  return {
    model: result.model,
    answers: {
      relation: {
        type: 'choice',
        choice: result.relation,
        probabilities: result.probabilities,
        confidence: result.confidence,
      },
    },
    usage: { input_tokens: result.usage?.inputTokens, output_tokens: result.usage?.outputTokens },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('headline pair prefilter', () => {
  it('skips the same item id', () => {
    const item = candidate({ id: 'same', title: 'Trump Announces $5,000 Plan' });
    expect(prefilterHeadlinePair(item, { ...item }).action).toBe('skip');
    expect(prefilterHeadlinePair(item, { ...item }).reason).toBe('same item id');
  });

  it('skips pairs outside the headline window even when the titles match', () => {
    const decision = prefilterHeadlinePair(
      candidate({ id: 'a', title: 'Trump Announces $5,000 Plan', publishedAt: NOW }),
      candidate({ id: 'b', title: "Trump's $5,000 Proposal Explained", publishedAt: OUTSIDE }),
    );
    expect(decision).toEqual({ action: 'skip', reason: 'outside headline timeline window' });
  });

  it('keeps an obvious duplicate url without asking Jev', () => {
    const decision = prefilterHeadlinePair(
      candidate({ id: 'a', title: 'One headline', url: 'https://Example.com/story/' }),
      candidate({ id: 'b', title: 'A different headline', url: 'https://example.com/story' }),
    );
    expect(decision).toEqual({ action: 'deterministic_match', reason: 'same published url' });
  });

  it('keeps an identical normalized title as a deterministic match', () => {
    const decision = prefilterHeadlinePair(
      candidate({ id: 'a', title: 'Breaking: City council delays the vote' }),
      candidate({ id: 'b', title: 'City council delays the vote' }),
    );
    expect(decision).toEqual({ action: 'deterministic_match', reason: 'identical normalized title' });
  });

  it('preserves a lexical cluster the timeline already accepts', () => {
    const decision = prefilterHeadlinePair(
      candidate({ id: 'a', title: 'Trump Announces $5,000 Plan' }),
      candidate({ id: 'b', title: "Trump's $5,000 Proposal Explained", publishedAt: EARLIER }),
    );
    expect(decision.action).toBe('deterministic_match');
    expect(decision.reason).toContain('lexical title match');
  });

  it('skips pairs with no distinctive overlap', () => {
    const broad = prefilterHeadlinePair(
      candidate({ id: 'a', title: 'Trump Announces $5,000 Plan' }),
      candidate({ id: 'b', title: 'Trump Holds Rally in Michigan' }),
    );
    const unrelated = prefilterHeadlinePair(
      candidate({ id: 'c', title: 'School board adopts a budget' }),
      candidate({ id: 'd', title: 'Satellite launch delayed again' }),
    );
    expect(broad).toEqual({ action: 'skip', reason: 'title overlap has no distinctive anchor' });
    expect(unrelated).toEqual({ action: 'skip', reason: 'no shared title tokens' });
  });

  it('sends the fuzzy middle to Jev', () => {
    const decision = prefilterHeadlinePair(
      candidate({ id: 'a', title: 'Bondi letter to Congress', sourceKind: 'creator', sourceName: 'MeidasTouch' }),
      candidate({ id: 'b', title: 'Bondi speaks at a weekend rally', sourceName: 'Reuters' }),
    );
    expect(decision.action).toBe('ask_jev');
    expect(decision.reason).toContain('bondi');
  });
});

describe('Jev response parsing', () => {
  it('reads the choice, distribution, confidence, model, and usage', () => {
    const parsed = parseJevSystemOneResponse(systemOneBody(success('same_event', 0.91, 0.88)), 120);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.relation).toBe('same_event');
    expect(parsed.probabilities.same_event).toBe(0.91);
    expect(parsed.confidence).toBe(0.88);
    expect(parsed.model).toBe('jev-1.13.0');
    expect(parsed.usage).toEqual({ inputTokens: 300, outputTokens: 20 });
    expect(parsed.elapsedMs).toBe(120);
  });

  it('keeps a valid choice when usage is absent', () => {
    const body = systemOneBody(success('different', 0.8, 0.8));
    delete (body as { usage?: unknown }).usage;
    const parsed = parseJevSystemOneResponse(body, 10);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.usage).toBeNull();
  });

  it('rejects a malformed choice', () => {
    const parsed = parseJevSystemOneResponse({ model: 'jev-1.13.0', answers: {} }, 5);
    expect(parsed).toMatchObject({
      ok: false,
      error: 'jev response did not include a relation choice',
    });
    expect(decideJevPairPolicy(parsed).action).toBe('review');
  });

  it('does not remap a schema-1 same_broader_topic choice', () => {
    const parsed = parseJevSystemOneResponse({
      model: 'jev-1.13.0',
      answers: {
        relation: {
          type: 'choice',
          choice: RETIRED_HEADLINE_RELATION,
          probabilities: {
            same_broader_topic: 0.9,
            same_event: 0.04,
            different: 0.03,
            unclear: 0.03,
          },
          confidence: 0.9,
        },
      },
    }, 10);
    expect(parsed).toMatchObject({
      ok: false,
      error: 'retired relation same_broader_topic is not remapped',
    });
    expect(decideJevPairPolicy(parsed).action).toBe('review');
  });
});

describe('Jev confidence policy', () => {
  it('reports same_story as a story-link and does not join the event cluster', () => {
    const decision = decideJevPairPolicy(success('same_story', 0.99, 0.99), 0);
    expect(decision.action).toBe('story_link');
    expect(decision.reason).toContain('does not join');
  });

  it('does not join related_context and does not make it a story-link', () => {
    const decision = decideJevPairPolicy(success('related_context', 0.99, 0.99), 0);
    expect(decision.action).toBe('do_not_join');
    expect(decision.reason).toContain('not a story-link');
  });

  it('does not join different items', () => {
    expect(decideJevPairPolicy(success('different', 0.97, 0.9)).action).toBe('do_not_join');
  });

  it('does not automatically join a low-confidence same_event', () => {
    const decision = decideJevPairPolicy(success('same_event', 0.91, 0.55));
    expect(decision.action).toBe('review');
    expect(JEV_SAME_EVENT_JOIN_THRESHOLD).toBe(0.8);
  });

  it('proposes a join for a high-confidence same_event', () => {
    const decision = decideJevPairPolicy(success('same_event', 0.91, 0.88));
    expect(decision.action).toBe('join');
  });

  it('requires both probability and confidence to clear the threshold', () => {
    expect(decideJevPairPolicy(success('same_event', 0.8, 0.8)).action).toBe('join');
    expect(decideJevPairPolicy(success('same_event', 0.8, 0.79)).action).toBe('review');
    expect(decideJevPairPolicy(success('same_event', 0.79, 0.95)).action).toBe('review');
  });

  it('routes unclear and failed calls to review', () => {
    expect(decideJevPairPolicy(success('unclear', 0.7, 0.4)).action).toBe('review');
    expect(decideJevPairPolicy({
      ok: false,
      error: 'jev request timed out',
      elapsedMs: 20000,
    })).toEqual({
      action: 'review',
      reason: 'jev unavailable: jev request timed out',
    });
  });
});

describe('Jev pair classification calls', () => {
  const left = candidate({
    id: 'secret-id-a',
    title: 'Bondi letter to Congress',
    summary: 'The letter asks for the calendar.',
    url: 'https://secret.example/a',
    sourceKind: 'creator',
    publishedAt: NOW,
  });
  const right = candidate({
    id: 'secret-id-b',
    title: 'Bondi speaks at a weekend rally',
    summary: 'The rally was in Ohio.',
    url: 'https://secret.example/b',
    sourceKind: 'news',
    publishedAt: EARLIER,
  });

  it('sends only the classification state and one choice question', async () => {
    const request = buildJevRelationRequest(left, right, 'jev-latest');
    expect(request.model).toBe('jev-latest');
    expect(request.questions.relation.instructions).toBe(JEV_RELATION_INSTRUCTIONS);
    expect(request.questions.relation.type).toBe('choice');
    expect(Object.keys(request.state.a)).toEqual(['title', 'description', 'publishedAt', 'sourceType']);
    expect(request.state.a).toEqual({
      title: left.title,
      description: left.summary,
      publishedAt: left.publishedAt,
      sourceType: 'creator',
    });
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain('secret-id-a');
    expect(serialized).not.toContain('secret.example');
    expect(serialized).not.toContain('score');
  });

  it('does not call the API when the key is missing', async () => {
    const fetchImpl = vi.fn();
    const result = await classifyHeadlinePair(left, right, { apiKey: null, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(decideJevPairPolicy(result).action).toBe('review');
  });

  it('turns timeouts, rate limits, network errors, and bad JSON into review', async () => {
    const hanging = vi.fn((_input: unknown, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      const fail = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (init?.signal?.aborted) {
        fail();
        return;
      }
      init?.signal?.addEventListener('abort', fail);
    }));
    const timedOut = await classifyHeadlinePair(left, right, {
      apiKey: 'test-key',
      timeoutMs: 20,
      fetchImpl: hanging,
    });
    expect(timedOut).toMatchObject({ ok: false, error: 'jev request timed out' });
    expect(decideJevPairPolicy(timedOut).action).toBe('review');

    const limited = await classifyHeadlinePair(left, right, {
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => new Response('slow down', { status: 429 })),
    });
    expect(limited).toMatchObject({ ok: false, error: 'jev rate limited (429)' });
    expect(decideJevPairPolicy(limited).action).toBe('review');

    const offline = await classifyHeadlinePair(left, right, {
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    });
    expect(offline).toMatchObject({ ok: false, error: 'jev network error' });
    expect(decideJevPairPolicy(offline).action).toBe('review');

    const malformed = await classifyHeadlinePair(left, right, {
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => new Response('not-json', { status: 200 })),
    });
    expect(malformed.ok).toBe(false);
    expect(decideJevPairPolicy(malformed).action).toBe('review');
  });

  it('does not call the API for deterministic matches or skips', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneBody(success('same_event', 0.91, 0.88))));
    const evaluation = await evaluateHeadlinePairs([
      candidate({ id: 'plan', title: 'Trump Announces $5,000 Plan' }),
      candidate({ id: 'proposal', title: "Trump's $5,000 Proposal Explained", publishedAt: EARLIER }),
      candidate({ id: 'rally', title: 'Trump Holds Rally in Michigan' }),
      candidate({ id: 'school', title: 'School board adopts a budget' }),
      candidate({ id: 'launch', title: 'Satellite launch delayed again' }),
      candidate({ id: 'old-plan', title: 'Trump Announces $5,000 Plan', publishedAt: OUTSIDE }),
    ], { apiKey: 'test-key', fetchImpl, limit: 25 });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(evaluation.deterministicMatches).toBeGreaterThan(0);
    expect(evaluation.skippedPairs).toBeGreaterThan(0);
    expect(evaluation.jevEvaluated).toBe(0);
    expect(evaluation.joins).toBe(0);
  });

  it('calls the API only for ask_jev pairs and stops at the limit', async () => {
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { state: { a: { title: string } } };
      const relation: HeadlineRelation = body.state.a.title.includes('Bondi') ? 'same_event' : 'same_story';
      return jsonResponse(systemOneBody(success(relation, relation === 'same_event' ? 0.91 : 0.84, 0.9)));
    });
    const items = [
      left,
      right,
      candidate({ id: 'schiff-a', title: 'Pakman interviews Schiff', publishedAt: NOW }),
      candidate({ id: 'schiff-b', title: 'Schiff releases a tax note', publishedAt: EARLIER }),
      candidate({ id: 'plan', title: 'Trump Announces $5,000 Plan' }),
      candidate({ id: 'proposal', title: "Trump's $5,000 Proposal Explained" }),
    ];
    const evaluation = await evaluateHeadlinePairs(items, {
      apiKey: 'test-key',
      fetchImpl,
      limit: 1,
      model: 'jev-latest',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-key');
    expect(evaluation.askJevPairs).toBeGreaterThan(1);
    expect(evaluation.jevEvaluated).toBe(1);
    expect(evaluation.jevNotSent).toBe(evaluation.askJevPairs - 1);
    expect(
      evaluation.sameEvent
      + evaluation.sameStory
      + evaluation.relatedContext
      + evaluation.different
      + evaluation.unclearOrReview,
    ).toBe(evaluation.jevEvaluated);

    const full = await evaluateHeadlinePairs([left, right], {
      apiKey: 'test-key',
      fetchImpl,
      limit: 5,
      model: 'jev-latest',
    });
    expect(full.joins).toBe(1);
    expect(full.inputTokens).toBe(300);
    expect(formatJevPair(full.pairs[0], 1)).toContain('POLICY\nJOIN');
    expect(formatJevPair(full.pairs[0], 1)).toContain('same_event');
  });
});

const PRIORITY_TIMES = {
  net: '2026-10-02T18:00:00.000Z',
  zel: '2026-10-02T17:00:00.000Z',
  schiff: '2026-10-02T16:00:00.000Z',
  pakman: '2026-10-02T15:00:00.000Z',
  bondi: '2026-10-02T14:00:00.000Z',
};

function priorityCandidates(): HeadlineCandidate[] {
  return [
    candidate({
      id: 'net-a',
      title: 'Netanyahu coalition speech',
      publishedAt: PRIORITY_TIMES.net,
      sourceId: 'newswire:haaretz',
      sourceName: 'Haaretz',
      sourceKind: 'news',
    }),
    candidate({
      id: 'net-b',
      title: 'Netanyahu cabinet shuffle',
      publishedAt: PRIORITY_TIMES.net,
      sourceId: 'newswire:haaretz',
      sourceName: 'Haaretz',
      sourceKind: 'news',
    }),
    candidate({
      id: 'zel-a',
      title: 'Zelensky airport closure',
      publishedAt: PRIORITY_TIMES.zel,
      sourceId: 'newswire:nyt',
      sourceName: 'NYT',
      sourceKind: 'news',
    }),
    candidate({
      id: 'zel-b',
      title: 'Zelensky border crossing',
      publishedAt: PRIORITY_TIMES.zel,
      sourceId: 'newswire:reuters',
      sourceName: 'Reuters',
      sourceKind: 'news',
    }),
    candidate({
      id: 'schiff-a',
      title: 'Schiff filing released',
      publishedAt: PRIORITY_TIMES.schiff,
      sourceId: 'voices:meidas',
      sourceName: 'MeidasTouch',
      sourceKind: 'creator',
    }),
    candidate({
      id: 'schiff-b',
      title: 'Schiff hearing notes',
      publishedAt: PRIORITY_TIMES.schiff,
      sourceId: 'newswire:ap',
      sourceName: 'AP',
      sourceKind: 'news',
    }),
    candidate({
      id: 'pakman-a',
      title: 'Pakman segment schedule',
      publishedAt: PRIORITY_TIMES.pakman,
      sourceId: 'voices:pakman',
      sourceName: 'Pakman',
      sourceKind: 'creator',
    }),
    candidate({
      id: 'pakman-b',
      title: 'Pakman weekly roundup',
      publishedAt: PRIORITY_TIMES.pakman,
      sourceId: 'voices:second',
      sourceName: 'Second Creator',
      sourceKind: 'creator',
    }),
    candidate({
      id: 'bondi-a',
      title: 'Bondi letter calendar',
      publishedAt: PRIORITY_TIMES.bondi,
      sourceId: 'voices:bondi-show',
      sourceName: 'Bondi Show',
      sourceKind: 'creator',
    }),
    candidate({
      id: 'bondi-b',
      title: 'Bondi weekend remarks',
      publishedAt: PRIORITY_TIMES.bondi,
      sourceId: 'voices:legal',
      sourceName: 'Legal Brief',
      sourceKind: 'creator',
    }),
  ];
}

function storyKey(titlePair: string): string {
  const names = ['Pakman', 'Bondi', 'Schiff', 'Zelensky', 'Netanyahu'];
  const found = names.filter((name) => titlePair.includes(name));
  if (found.length !== 1) return titlePair;
  return found[0].toLowerCase();
}

async function evaluatedCallOrder(limit: number) {
  const titles: string[] = [];
  const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { state: { a: { title: string }; b: { title: string } } };
    titles.push(`${body.state.a.title} || ${body.state.b.title}`);
    return jsonResponse(systemOneBody(success('different', 0.8, 0.8)));
  });
  const evaluation = await evaluateHeadlinePairs(priorityCandidates(), {
    apiKey: 'test-key',
    fetchImpl,
    limit,
  });
  return { titles, keys: titles.map(storyKey), evaluation, fetchImpl };
}

describe('ask_jev source priority', () => {
  it('orders cross-source pairs ahead of same-source pairs', async () => {
    const { keys, evaluation } = await evaluatedCallOrder(10);
    expect(keys).toEqual(['pakman', 'bondi', 'schiff', 'zelensky', 'netanyahu']);
    expect(keys.indexOf('netanyahu')).toBe(keys.length - 1);
    expect(evaluation.crossSourceJevCandidates).toBe(4);
    expect(evaluation.sameSourceJevCandidates).toBe(1);
    expect(evaluation.askJevPairs).toBe(5);
  });

  it('ranks creator-creator ahead of creator-news', async () => {
    const { keys } = await evaluatedCallOrder(10);
    expect(keys.indexOf('pakman')).toBeLessThan(keys.indexOf('schiff'));
    expect(keys.indexOf('bondi')).toBeLessThan(keys.indexOf('schiff'));
  });

  it('ranks creator-news ahead of news-news', async () => {
    const { keys } = await evaluatedCallOrder(10);
    expect(keys.indexOf('schiff')).toBeLessThan(keys.indexOf('zelensky'));
  });

  it('ranks different-source news ahead of same-source news', async () => {
    const { keys } = await evaluatedCallOrder(10);
    expect(keys.indexOf('zelensky')).toBeLessThan(keys.indexOf('netanyahu'));
  });

  it('keeps encounter order inside a source bucket', async () => {
    const { keys } = await evaluatedCallOrder(10);
    expect(keys.indexOf('pakman')).toBeLessThan(keys.indexOf('bondi'));
  });

  it('replays the same ask_jev prefix when the snapshot and --limit are unchanged', async () => {
    const shuffled = priorityCandidates().slice().reverse();
    const full = await evaluatedCallOrder(20);
    const prefix = await evaluatedCallOrder(2);
    const replay = await evaluateHeadlinePairs(shuffled, {
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => jsonResponse(systemOneBody(success('different', 0.8, 0.8)))),
      limit: 20,
    });
    expect(full.titles).toHaveLength(5);
    expect(prefix.titles).toEqual(full.titles.slice(0, 2));
    expect(replay.pairs.map((pair) => `${pair.a.title} || ${pair.b.title}`)).toEqual(full.titles);
  });

  it('classifies same outlet name as same-source even when source ids differ', () => {
    expect(jevPairSourceBucket(
      { sourceId: 'voices:a', sourceName: 'MeidasTouch', sourceKind: 'creator' },
      { sourceId: 'voices:b', sourceName: 'Pakman', sourceKind: 'creator' },
    )).toBe(0);
    expect(jevPairSourceBucket(
      { sourceId: 'voices:a', sourceName: 'MeidasTouch', sourceKind: 'creator' },
      { sourceId: 'newswire:reuters', sourceName: 'Reuters', sourceKind: 'news' },
    )).toBe(1);
    expect(jevPairSourceBucket(
      { sourceId: 'newswire:nyt', sourceName: 'NYT', sourceKind: 'news' },
      { sourceId: 'newswire:reuters', sourceName: 'Reuters', sourceKind: 'news' },
    )).toBe(2);
    expect(jevPairSourceBucket(
      { sourceId: 'newswire:haaretz', sourceName: 'Haaretz', sourceKind: 'news' },
      { sourceId: 'intel:1', sourceName: 'Haaretz', sourceKind: 'news' },
    )).toBe(3);
  });
});

function newsSkip(index: number, similarity: number, order = index): SkippedPairDraft {
  return {
    a: candidate({
      id: `left-${index}`,
      title: `Left desk item ${index}`,
      sourceId: `newswire:left-${index}`,
      sourceName: `Left ${index}`,
      sourceKind: 'news',
    }),
    b: candidate({
      id: `right-${index}`,
      title: `Right desk item ${index}`,
      sourceId: `newswire:right-${index}`,
      sourceName: `Right ${index}`,
      sourceKind: 'news',
    }),
    similarity,
    lexicalCluster: false,
    reason: 'title overlap has no distinctive anchor',
    order,
  };
}

function pairIdentity(sample: { a: { id: string }; b: { id: string } }): string {
  return [sample.a.id, sample.b.id].sort().join('|');
}

function sourceAppearances(samples: Array<{ a: { sourceName: string }; b: { sourceName: string } }>, sourceName: string): number {
  const needle = sourceName.trim().toLowerCase();
  return samples.filter((sample) => (
    sample.a.sourceName.trim().toLowerCase() === needle
    || sample.b.sourceName.trim().toLowerCase() === needle
  )).length;
}

describe('skipped pair sampling', () => {
  const rankedSkips = Array.from({ length: 30 }, (_, index) => newsSkip(index, (30 - index) / 100));

  it('is deterministic and splits a request of 25 into 13 near-miss and 12 baseline rows', () => {
    const forward = selectSkippedSamples(rankedSkips, 25);
    const reversed = selectSkippedSamples(rankedSkips.slice().reverse(), 25);
    expect(reversed).toEqual(forward);
    expect(forward.filter((sample) => sample.sampleKind === 'near_miss')).toHaveLength(13);
    expect(forward.filter((sample) => sample.sampleKind === 'baseline')).toHaveLength(12);
  });

  it('favors higher-similarity skips for near-miss rows', () => {
    const sample = selectSkippedSamples(rankedSkips, 25);
    const near = sample.filter((row) => row.sampleKind === 'near_miss').map((row) => row.similarity);
    const baseline = sample.filter((row) => row.sampleKind === 'baseline').map((row) => row.similarity);
    expect(Math.min(...near)).toBeGreaterThan(Math.max(...baseline));
  });

  it('does not repeat a near-miss pair in the baseline sample', () => {
    const sample = selectSkippedSamples(rankedSkips, 25);
    const near = new Set(
      sample.filter((row) => row.sampleKind === 'near_miss').map(pairIdentity),
    );
    const baseline = sample.filter((row) => row.sampleKind === 'baseline').map(pairIdentity);
    expect(new Set(baseline).size).toBe(baseline.length);
    for (const key of baseline) expect(near.has(key)).toBe(false);
  });

  it('fills later source buckets only after higher-priority skips are used', () => {
    const cross = newsSkip(0, 0.1, 0);
    const sameSource = [0.9, 0.5, 0.4, 0.2].map((similarity, index) => ({
      a: candidate({
        id: `haaretz-a-${index}`,
        title: `Haaretz desk item ${index}`,
        sourceId: 'newswire:haaretz',
        sourceName: 'Haaretz',
        sourceKind: 'news' as const,
      }),
      b: candidate({
        id: `haaretz-b-${index}`,
        title: `Haaretz copy item ${index}`,
        sourceId: 'newswire:haaretz',
        sourceName: 'Haaretz',
        sourceKind: 'news' as const,
      }),
      similarity,
      lexicalCluster: false,
      reason: 'title overlap has no distinctive anchor',
      order: index + 1,
    }));
    const sample = selectSkippedSamples([sameSource[0], cross, ...sameSource.slice(1)], 4);
    const near = sample.filter((row) => row.sampleKind === 'near_miss');
    expect(near).toHaveLength(2);
    expect(pairIdentity(near[0])).toBe(pairIdentity(cross));
    expect(near[1].similarity).toBe(0.9);
    expect(sample.filter((row) => row.sampleKind === 'baseline').every((row) => row.a.sourceName === 'Haaretz')).toBe(true);
  });

  it('caps one source at 3 appearances and still fills both buckets when other pairs exist', () => {
    const dominant = Array.from({ length: 12 }, (_, index) => ({
      a: candidate({
        id: `brennan-${index % 2}`,
        title: `Brennan desk item ${index % 2}`,
        sourceId: 'voices:brennan',
        sourceName: 'Brennan Center',
        sourceKind: 'creator' as const,
      }),
      b: candidate({
        id: `partner-${index}`,
        title: `Partner desk item ${index}`,
        sourceId: `newswire:partner-${index}`,
        sourceName: `Partner ${index}`,
        sourceKind: 'news' as const,
      }),
      similarity: 0.4,
      lexicalCluster: false,
      reason: 'no shared title tokens',
      order: index,
    }));
    const background = Array.from({ length: 30 }, (_, index) => newsSkip(index, 0.05, index + 100));
    const sample = selectSkippedSamples([...dominant, ...background], 25);
    expect(sample.filter((row) => row.sampleKind === 'near_miss')).toHaveLength(13);
    expect(sample.filter((row) => row.sampleKind === 'baseline')).toHaveLength(12);
    expect(sourceAppearances(sample, 'Brennan Center')).toBe(SKIPPED_SAMPLE_SOURCE_CAP);
    const partners = new Set(
      sample
        .filter((row) => sourceAppearances([row], 'Brennan Center') === 1)
        .map((row) => row.b.sourceName),
    );
    expect(partners.size).toBe(SKIPPED_SAMPLE_SOURCE_CAP);
  });

  it('takes a new outlet pair before a second pair of the same outlets', () => {
    const reutersAp = [0.9, 0.8].map((similarity, index) => ({
      a: candidate({
        id: `reuters-${index}`,
        title: `Reuters desk item ${index}`,
        sourceId: 'newswire:reuters',
        sourceName: 'Reuters',
        sourceKind: 'news' as const,
      }),
      b: candidate({
        id: `ap-${index}`,
        title: `AP desk item ${index}`,
        sourceId: 'newswire:ap',
        sourceName: 'AP',
        sourceKind: 'news' as const,
      }),
      similarity,
      lexicalCluster: false,
      reason: 'title overlap has no distinctive anchor',
      order: index,
    }));
    const reutersBbc = {
      a: candidate({
        id: 'reuters-bbc',
        title: 'Reuters other desk item',
        sourceId: 'newswire:reuters',
        sourceName: 'Reuters',
        sourceKind: 'news' as const,
      }),
      b: candidate({
        id: 'bbc-1',
        title: 'BBC desk item',
        sourceId: 'newswire:bbc',
        sourceName: 'BBC',
        sourceKind: 'news' as const,
      }),
      similarity: 0.4,
      lexicalCluster: false,
      reason: 'title overlap has no distinctive anchor',
      order: 2,
    };
    const sample = selectSkippedSamples([reutersAp[1], reutersBbc, reutersAp[0]], 2);
    const near = sample.filter((row) => row.sampleKind === 'near_miss');
    expect(near).toHaveLength(1);
    expect(pairIdentity(near[0])).toBe(pairIdentity(reutersAp[0]));
    expect(pairIdentity(sample[1])).toBe(pairIdentity(reutersBbc));
    expect(sourceAppearances(sample, 'Reuters')).toBe(2);
  });

  it('counts the same outlet name on two channels as one source', () => {
    const drafts = [0, 1, 2, 3].map((index) => ({
      a: candidate({
        id: `haaretz-${index}`,
        title: `Haaretz desk item ${index}`,
        sourceId: index % 2 === 0 ? 'newswire:haaretz' : `intel:haaretz-${index}`,
        sourceName: 'Haaretz',
        sourceKind: 'news' as const,
      }),
      b: candidate({
        id: `other-${index}`,
        title: `Other desk item ${index}`,
        sourceId: `newswire:other-${index}`,
        sourceName: `Other ${index}`,
        sourceKind: 'news' as const,
      }),
      similarity: 0.3,
      lexicalCluster: false,
      reason: 'no shared title tokens',
      order: index,
    }));
    const sample = selectSkippedSamples(drafts, 4);
    expect(sourceAppearances(sample, 'Haaretz')).toBe(SKIPPED_SAMPLE_SOURCE_CAP);
    expect(sample).toHaveLength(SKIPPED_SAMPLE_SOURCE_CAP);
  });

  it('performs zero API calls for --limit 0 --sample-skipped 25', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneBody(success('same_event', 0.91, 0.88))));
    const items = [
      candidate({
        id: 'bondi-live-a',
        title: 'Bondi letter to Congress',
        sourceKind: 'creator',
        sourceId: 'voices:meidas',
        sourceName: 'MeidasTouch',
        summary: 'The letter asks for the calendar.',
      }),
      candidate({
        id: 'bondi-live-b',
        title: 'Bondi speaks at a weekend rally',
        sourceKind: 'news',
        sourceId: 'newswire:reuters',
        sourceName: 'Reuters',
        summary: 'The rally was in Ohio.',
      }),
      candidate({
        id: 'school-live',
        title: 'School board adopts a budget',
        sourceId: 'newswire:ap',
        sourceName: 'AP',
        summary: null,
      }),
      candidate({
        id: 'launch-live',
        title: 'Satellite launch delayed again',
        sourceId: 'newswire:bbc',
        sourceName: 'BBC',
      }),
      candidate({
        id: 'broad-live-a',
        title: 'Trump war election administration',
        sourceId: 'newswire:nyt',
        sourceName: 'NYT',
        summary: 'A broad desk note.',
      }),
      candidate({
        id: 'broad-live-b',
        title: 'Trump war election administration oversight',
        sourceId: 'newswire:wapo',
        sourceName: 'Washington Post',
        summary: 'Another broad desk note.',
      }),
    ];
    const evaluation = await evaluateHeadlinePairs(items, {
      apiKey: 'test-key',
      fetchImpl,
      limit: 0,
      sampleSkipped: 25,
    });
    const again = await evaluateHeadlinePairs(items, {
      apiKey: 'test-key',
      fetchImpl: vi.fn(),
      limit: 0,
      sampleSkipped: 25,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(evaluation.jevEvaluated).toBe(0);
    expect(evaluation.askJevPairs).toBeGreaterThan(0);
    expect(evaluation.skippedPairs).toBeGreaterThan(evaluation.skippedSamples.length);
    expect(evaluation.skippedSamples.length).toBeLessThanOrEqual(Math.min(25, evaluation.skippedPairs));
    expect(evaluation.nearMissSamples + evaluation.baselineSamples).toBe(evaluation.skippedSamples.length);
    expect(evaluation.nearMissSamples).toBeGreaterThan(0);
    expect(evaluation.baselineSamples).toBeGreaterThan(0);
    for (const name of ['MeidasTouch', 'Reuters', 'AP', 'BBC', 'NYT', 'Washington Post']) {
      expect(sourceAppearances(evaluation.skippedSamples, name)).toBeLessThanOrEqual(SKIPPED_SAMPLE_SOURCE_CAP);
    }
    expect(again.skippedSamples).toEqual(evaluation.skippedSamples);

    const text = formatJevEvaluationReport(evaluation, { limit: 0 });
    expect(text).toContain('SKIPPED SAMPLE 1 — near-miss');
    expect(text).toContain('DETERMINISTIC');
    expect(text).toContain('PREFILTER');
    expect(text).toContain('\nSKIP\n');
    expect(text).toContain('reason:');
    expect(text).toContain('skipped pool:');
    expect(text).toContain('near-miss samples:');
    expect(text).toContain('baseline samples:');
    expect(text).toContain('cross-source jev candidates:');
    expect(text).toContain('same-source jev candidates:');
    expect(text).toContain('The letter asks for the calendar.');

    const artifact = jevEvaluationArtifact(evaluation, { limit: 0, sampleSkipped: 25 });
    expect(artifact.sampleSkipped).toBe(25);
    expect(artifact.skippedSamples).toHaveLength(evaluation.skippedSamples.length);
    expect(artifact.totals.skippedPool).toBe(evaluation.skippedPairs);
    expect(artifact.totals.nearMissSamples).toBe(evaluation.nearMissSamples);
    expect(artifact.totals.baselineSamples).toBe(evaluation.baselineSamples);
    expect(artifact.totals.crossSourceJevCandidates).toBe(evaluation.crossSourceJevCandidates);
    expect(artifact.totals.sameSourceJevCandidates).toBe(evaluation.sameSourceJevCandidates);
    const row = artifact.skippedSamples[0];
    expect(Object.keys(row).sort()).toEqual(['a', 'b', 'deterministic', 'prefilter', 'sampleKind']);
    expect(Object.keys(row.a).sort()).toEqual([
      'id', 'publishedAt', 'sourceId', 'sourceKind', 'sourceName', 'summary', 'title',
    ]);
    expect(Object.keys(row.b).sort()).toEqual([
      'id', 'publishedAt', 'sourceId', 'sourceKind', 'sourceName', 'summary', 'title',
    ]);
    expect(row.deterministic).toEqual({
      similarity: expect.any(Number),
      cluster: expect.any(Boolean),
    });
    expect(row.prefilter).toEqual({
      action: 'skip',
      reason: expect.any(String),
    });
    expect(['near_miss', 'baseline']).toContain(row.sampleKind);
    expect(row.a.id).toEqual(expect.any(String));
    expect(row.a.sourceId).toEqual(expect.any(String));
    expect(row.a.title).toEqual(expect.any(String));
  });

  it('can run a Jev eval and a skipped sample in one pass', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneBody(success('different', 0.84, 0.9))));
    const evaluation = await evaluateHeadlinePairs([
      candidate({
        id: 'bondi-both-a',
        title: 'Bondi letter to Congress',
        sourceKind: 'creator',
        sourceId: 'voices:meidas',
        sourceName: 'MeidasTouch',
      }),
      candidate({
        id: 'bondi-both-b',
        title: 'Bondi speaks at a weekend rally',
        sourceKind: 'news',
        sourceId: 'newswire:reuters',
        sourceName: 'Reuters',
      }),
      candidate({
        id: 'school-both',
        title: 'School board adopts a budget',
        sourceId: 'newswire:ap',
        sourceName: 'AP',
      }),
      candidate({
        id: 'launch-both',
        title: 'Satellite launch delayed again',
        sourceId: 'newswire:bbc',
        sourceName: 'BBC',
      }),
    ], {
      apiKey: 'test-key',
      fetchImpl,
      limit: 10,
      sampleSkipped: 25,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(evaluation.askJevPairs);
    expect(evaluation.jevEvaluated).toBeGreaterThan(0);
    expect(evaluation.skippedSamples.length).toBeGreaterThan(0);
    expect(evaluation.skippedSamples.length).toBe(Math.min(25, evaluation.skippedPairs));
  });
});

describe('headline jev eval args', () => {
  it('defaults sample-skipped to 0 and stays in live mode', () => {
    expect(parseHeadlineJevEvalArgs([]).sampleSkipped).toBe(0);
    expect(parseHeadlineJevEvalArgs(['--limit', '0', '--sample-skipped', '25'])).toMatchObject({
      limit: 0,
      sampleSkipped: 25,
      jsonPath: null,
      inputPath: null,
      saveCandidatesPath: null,
    });
    expect(parseHeadlineJevEvalArgs(['--sample-skipped=25']).sampleSkipped).toBe(25);
  });

  it('rejects malformed --sample-skipped values', () => {
    const message = '--sample-skipped must be a non-negative integer';
    expect(() => parseHeadlineJevEvalArgs(['--sample-skipped'])).toThrow(message);
    expect(() => parseHeadlineJevEvalArgs(['--sample-skipped', '-1'])).toThrow(message);
    expect(() => parseHeadlineJevEvalArgs(['--sample-skipped', '1.5'])).toThrow(message);
    expect(() => parseHeadlineJevEvalArgs(['--sample-skipped', 'foo'])).toThrow(message);
    expect(() => parseHeadlineJevEvalArgs(['--sample-skipped='])).toThrow(message);
  });

  it('saves a dated candidate snapshot and can point a later run at that file', () => {
    const now = new Date(2026, 9, 2, 21, 50);
    expect(headlineJevCandidateSnapshotPath(now)).toBe('tmp/headline-jev-eval/candidates-20261002.json');
    expect(parseHeadlineJevEvalArgs(['--limit', '0', '--save-candidates'], now)).toMatchObject({
      limit: 0,
      inputPath: null,
      saveCandidatesPath: 'tmp/headline-jev-eval/candidates-20261002.json',
    });
    expect(parseHeadlineJevEvalArgs(['--save-candidates', '--limit', '0'], now).saveCandidatesPath)
      .toBe('tmp/headline-jev-eval/candidates-20261002.json');
    expect(parseHeadlineJevEvalArgs(['--save-candidates=tmp/custom.json']).saveCandidatesPath).toBe('tmp/custom.json');
    expect(parseHeadlineJevEvalArgs([
      '--input',
      'tmp/headline-jev-eval/candidates-20261002.json',
      '--sample-skipped',
      '25',
    ])).toMatchObject({
      inputPath: 'tmp/headline-jev-eval/candidates-20261002.json',
      saveCandidatesPath: null,
      sampleSkipped: 25,
    });
  });

  it('treats --limit on a snapshot as the pair prefix and does not add --pair-limit', () => {
    expect(parseHeadlineJevEvalArgs([
      '--limit',
      '20',
      '--input',
      'tmp/headline-jev-eval/candidates-20261002.json',
    ])).toMatchObject({
      limit: 20,
      inputPath: 'tmp/headline-jev-eval/candidates-20261002.json',
    });
    expect(headlineJevEvalUsage()).toContain('No separate --pair-limit');
    expect(headlineJevEvalUsage()).toContain('candidates-20261002.json');
    expect(() => parseHeadlineJevEvalArgs(['--pair-limit', '20'])).toThrow('Unknown argument');
  });

  it('rejects combining --input with --save-candidates and rejects a missing snapshot path', () => {
    expect(() => parseHeadlineJevEvalArgs(['--input', 'snap.json', '--save-candidates']))
      .toThrow('--save-candidates reads live feeds');
    expect(() => parseHeadlineJevEvalArgs(['--input'])).toThrow('--input requires a snapshot path');
    expect(() => parseHeadlineJevEvalArgs(['--input='])).toThrow('--input requires a snapshot path');
    expect(() => parseHeadlineJevEvalArgs(['--save-candidates='])).toThrow('--save-candidates requires a path');
  });
});

describe('headline jev candidate snapshots', () => {
  it('round-trips a load and replays the same skipped sample', async () => {
    const loaded = {
      candidates: [
        candidate({ id: 'snap-a', title: 'Bondi letter to Congress', sourceName: 'MeidasTouch', sourceKind: 'creator' }),
        candidate({ id: 'snap-b', title: 'School board adopts a budget', sourceName: 'AP' }),
        candidate({ id: 'snap-c', title: 'Satellite launch delayed again', sourceName: 'BBC' }),
      ],
      warnings: ['Newswire: timeout'],
      windowHours: 72,
      generatedAt: '2026-10-02T21:50:00.000Z',
      counts: { intel: 1, voices: 1, newswire: 1 },
    };
    const snapshot = buildHeadlineJevCandidateSnapshot(loaded);
    const again = parseHeadlineJevCandidateSnapshot(JSON.stringify(snapshot));
    expect(again).toEqual(snapshot);
    expect(again.candidates[0]).not.toBe(loaded.candidates[0]);

    const first = await evaluateHeadlinePairs(snapshot.candidates, {
      limit: 0,
      sampleSkipped: 25,
      windowHours: snapshot.windowHours,
    });
    const replay = await evaluateHeadlinePairs(again.candidates, {
      limit: 0,
      sampleSkipped: 25,
      windowHours: again.windowHours,
    });
    expect(replay.skippedSamples).toEqual(first.skippedSamples);
    expect(replay.candidateCount).toBe(3);
  });

  it('rejects eval-result JSON and malformed files', () => {
    expect(() => parseHeadlineJevCandidateSnapshot('{"milestone":1,"pairs":[]}')).toThrow(
      'kind must be headline-jev-candidates',
    );
    expect(() => parseHeadlineJevCandidateSnapshot('{')).toThrow('malformed JSON');
    expect(() => parseHeadlineJevCandidateSnapshot('{"kind":"headline-jev-candidates"}')).toThrow(
      'candidates must be an array',
    );
  });
});

describe('headline relation taxonomy', () => {
  const flydubaiAttack = candidate({
    id: 'flydubai-attack',
    title: 'Flydubai aircraft hit in attack',
    summary: 'A Flydubai aircraft was struck during the attack. The report covers that strike, the crew, and the passengers aboard.',
    sourceName: 'Reuters',
  });
  const gazaHostages = candidate({
    id: 'gaza-hostages',
    title: 'Gaza hostage negotiations resume',
    summary: 'Mediators are again discussing the Gaza hostage negotiations and a possible exchange.',
    sourceName: 'AP',
  });

  function described(id: string, title: string, summary: string, sourceName: string): HeadlineCandidate {
    return candidate({ id, title, summary, sourceName });
  }

  async function mockedClassification(
    a: HeadlineCandidate,
    b: HeadlineCandidate,
    relation: HeadlineRelation,
    probability: number,
    confidence: number,
  ) {
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        questions: { relation: { criteria: Record<string, string>; instructions: string } };
      };
      expect(Object.keys(body.questions.relation.criteria)).toEqual([...HEADLINE_RELATIONS]);
      expect(body.questions.relation.criteria).not.toHaveProperty(RETIRED_HEADLINE_RELATION);
      expect(body.questions.relation.instructions).toBe(JEV_RELATION_INSTRUCTIONS);
      expect(body.questions.relation.criteria.same_event).toContain('same occurrence');
      expect(body.questions.relation.criteria.same_story).toContain('story dossier');
      expect(body.questions.relation.criteria.related_context).toContain('must not be linked into the same story timeline');
      expect(body.questions.relation.instructions).toContain('Do not treat all Israel/Gaza items as one story');
      expect(body.questions.relation.instructions).toContain('Do not treat all Trump items as one story');
      return jsonResponse(systemOneBody(success(relation, probability, confidence)));
    });
    const result = await classifyHeadlinePair(a, b, { apiKey: 'test-key', fetchImpl });
    return { result, policy: decideJevPairPolicy(result) };
  }

  const cases: Array<{
    name: string;
    a: HeadlineCandidate;
    b: HeadlineCandidate;
    relation: HeadlineRelation;
    probability: number;
    confidence: number;
    action: JevPairPolicyDecision['action'];
  }> = [
    {
      name: 'same exact event: Drop Site and Democracy Now on the Minab school bombing',
      a: described(
        'dropsite-minab',
        'Israeli strike bombs a school in Minab',
        'Drop Site reports the bombing of a school in Minab and the casualties from that strike.',
        'Drop Site News',
      ),
      b: described(
        'democracynow-minab',
        'School bombing in Minab',
        'Democracy Now reports the same school bombing in Minab.',
        'Democracy Now',
      ),
      relation: 'same_event',
      probability: 0.93,
      confidence: 0.91,
      action: 'join',
    },
    {
      name: 'same story: Flydubai attack and the airline suspending flights',
      a: flydubaiAttack,
      b: described(
        'flydubai-suspend',
        'Airline suspends flights after the Flydubai attack',
        'The carrier suspended flights because of the Flydubai attack.',
        'BBC',
      ),
      relation: 'same_story',
      probability: 0.88,
      confidence: 0.86,
      action: 'story_link',
    },
    {
      name: 'same story: Flydubai attack and plans to question the co-pilot',
      a: flydubaiAttack,
      b: described(
        'flydubai-copilot',
        'Israel plans to question the Flydubai co-pilot',
        'Investigators plan to question the co-pilot about the Flydubai attack.',
        'Haaretz',
      ),
      relation: 'same_story',
      probability: 0.84,
      confidence: 0.83,
      action: 'story_link',
    },
    {
      name: 'same story: Flydubai attack and analysis of the Netanyahu response',
      a: flydubaiAttack,
      b: described(
        'flydubai-analysis',
        "Analysis of Netanyahu's response to the Flydubai attack",
        'Political analysis of how Netanyahu responded to the Flydubai attack.',
        'MeidasTouch',
      ),
      relation: 'same_story',
      probability: 0.81,
      confidence: 0.8,
      action: 'story_link',
    },
    {
      name: 'related context: Gaza hostage negotiations and West Bank settler sanctions',
      a: gazaHostages,
      b: described(
        'settler-sanctions',
        'US announces West Bank settler sanctions',
        'The sanctions target West Bank settlers and are not part of the hostage talks.',
        'Reuters',
      ),
      relation: 'related_context',
      probability: 0.9,
      confidence: 0.88,
      action: 'do_not_join',
    },
    {
      name: 'related context: Gaza hostage negotiations and students unable to leave',
      a: gazaHostages,
      b: described(
        'gaza-students',
        'Gaza students unable to leave for university',
        'Students in Gaza cannot travel to universities abroad. The piece does not cover the hostage negotiations.',
        'Al Jazeera',
      ),
      relation: 'related_context',
      probability: 0.87,
      confidence: 0.85,
      action: 'do_not_join',
    },
    {
      name: 'different: Flydubai attack and Israeli election integrity',
      a: flydubaiAttack,
      b: described(
        'election-integrity',
        'Israeli election integrity dispute',
        'A dispute over election procedures and ballot integrity inside Israel.',
        'Times of Israel',
      ),
      relation: 'different',
      probability: 0.92,
      confidence: 0.9,
      action: 'do_not_join',
    },
    {
      name: 'thin clickbait: generic Trump lawsuit and generic Trump jobs',
      a: described('trump-lawsuit', 'Trump lawsuit shocks nation', 'You will not believe this.', 'Outlet A'),
      b: described('trump-jobs', 'Trump jobs bombshell', 'What happens next will surprise you.', 'Outlet B'),
      relation: 'unclear',
      probability: 0.7,
      confidence: 0.41,
      action: 'review',
    },
  ];

  it('sends the schema-2 choice criteria', () => {
    expect([...HEADLINE_RELATIONS]).toEqual([
      'same_event',
      'same_story',
      'related_context',
      'different',
      'unclear',
    ]);
    expect(JEV_RELATION_CRITERIA).not.toHaveProperty(RETIRED_HEADLINE_RELATION);
    expect(JEV_RELATION_CRITERIA.same_story).toContain('Shared geography or a shared conflict alone does not create this label');
    expect(JEV_RELATION_INSTRUCTIONS).toContain('Do not treat all surveillance items as one story');
    expect(JEV_RELATION_INSTRUCTIONS).toContain('Do not treat all election items as one story');
    expect(JEV_SAME_EVENT_JOIN_THRESHOLD).toBe(0.8);
  });

  it.each(cases)('$name', async ({ a, b, relation, probability, confidence, action }) => {
    const { result, policy } = await mockedClassification(a, b, relation, probability, confidence);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.relation).toBe(relation);
    expect(policy.action).toBe(action);
    if (relation !== 'same_event') expect(policy.action).not.toBe('join');
    if (relation !== 'same_story') expect(policy.action).not.toBe('story_link');
  });

  it('does not join a low-confidence reading of thin Trump headlines', async () => {
    const { policy } = await mockedClassification(
      described('trump-lawsuit', 'Trump lawsuit shocks nation', 'You will not believe this.', 'Outlet A'),
      described('trump-jobs', 'Trump jobs bombshell', 'What happens next will surprise you.', 'Outlet B'),
      'same_event',
      0.9,
      0.35,
    );
    expect(policy.action).toBe('review');
  });

  it('stores the five-way distribution and prints story links separately from joins', async () => {
    const byStory: Record<string, HeadlineRelation> = {
      pakman: 'same_event',
      bondi: 'same_story',
      schiff: 'related_context',
      zelensky: 'different',
      netanyahu: 'unclear',
    };
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { state: { a: { title: string }; b: { title: string } } };
      const relation = byStory[storyKey(`${body.state.a.title} || ${body.state.b.title}`)];
      const probability = relation === 'same_event' ? 0.91 : 0.86;
      const confidence = relation === 'unclear' ? 0.42 : 0.9;
      return jsonResponse(systemOneBody(success(relation, probability, confidence)));
    });
    const evaluation = await evaluateHeadlinePairs(priorityCandidates(), {
      apiKey: 'test-key',
      fetchImpl,
      limit: 20,
    });

    expect(evaluation.jevEvaluated).toBe(5);
    expect(evaluation.sameEvent).toBe(1);
    expect(evaluation.sameStory).toBe(1);
    expect(evaluation.relatedContext).toBe(1);
    expect(evaluation.different).toBe(1);
    expect(evaluation.unclear).toBe(1);
    expect(evaluation.unclearOrReview).toBe(1);
    expect(evaluation.joins).toBe(1);
    expect(evaluation.storyLinks).toBe(1);
    expect(
      evaluation.sameEvent
      + evaluation.sameStory
      + evaluation.relatedContext
      + evaluation.different
      + evaluation.unclearOrReview,
    ).toBe(evaluation.jevEvaluated);

    const storyPair = evaluation.pairs.find((pair) => pair.jev.ok && pair.jev.relation === 'same_story');
    expect(storyPair?.policy.action).toBe('story_link');
    const text = formatJevPair(storyPair!, evaluation.pairs.indexOf(storyPair!) + 1);
    const jevBlock = text.split('JEV\n')[1]?.split('\nPOLICY')[0] ?? '';
    expect(jevBlock).toContain('same_event');
    expect(jevBlock).toContain('same_story');
    expect(jevBlock).toContain('related_context');
    expect(jevBlock).toContain('different');
    expect(jevBlock).toContain('unclear');
    expect(jevBlock).toContain('confidence');
    expect(text).toContain('POLICY\nSTORY LINK');
    expect(text).not.toContain('same_broader_topic');

    const report = formatJevEvaluationReport(evaluation, { limit: 20 });
    expect(report).toContain('relation schema: 2');
    expect(report).toContain('same event: 1');
    expect(report).toContain('same story: 1');
    expect(report).toContain('story links: 1');
    expect(report).toContain('related context: 1');
    expect(report).toContain('different: 1');
    expect(report).toContain('unclear/review: 1');
    expect(report).not.toContain('same broader topic');

    const artifact = jevEvaluationArtifact(evaluation, { limit: 20 });
    expect(artifact.schemaVersion).toBe(2);
    expect(artifact.schemaVersion).toBe(HEADLINE_JEV_RELATION_SCHEMA_VERSION);
    expect(artifact.totals.relations).toEqual({
      same_event: 1,
      same_story: 1,
      related_context: 1,
      different: 1,
      unclear: 1,
    });
    expect(artifact.totals).not.toHaveProperty('sameBroaderTopic');
    expect(artifact.totals.storyLinks).toBe(1);
    expect(artifact.totals.jevProposedJoins).toBe(1);
  });
});
