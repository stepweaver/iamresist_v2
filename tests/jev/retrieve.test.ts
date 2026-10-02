import { describe, expect, it } from 'vitest';

import { shouldMergeThreadIdentities, rankIdentityCandidates, type ThreadIdentity } from '@/lib/eventThreads/identity';
import { JEV_DECISION_CANDIDATE_LIMIT, JEV_RETRIEVED_CANDIDATE_LIMIT } from '@/lib/jev/constants';
import { candidateSetsForNote, type PreparedShadowNote } from '@/lib/jev/retrieve';
import type { ResolvedThreadEntry } from '@/lib/eventThreads/types';
import { makeNote } from '../eventThreads/helpers';

function identity(partial: Partial<ThreadIdentity>): ThreadIdentity {
  return {
    terms: [],
    phrases: [],
    generic: [],
    actors: [],
    actions: [],
    objects: [],
    institutions: [],
    locations: [],
    documents: [],
    ...partial,
  };
}

function prepared(id: string, terms: string[]): PreparedShadowNote {
  const note = makeNote({
    id,
    kind: 'event',
    text: `Note ${id} ${terms.join(' ')}`,
    sourceExcerpt: terms.join(' '),
  });
  const entry = {
    id,
    atomicNoteId: id,
    entryKind: 'event',
    resolvedText: note.text,
    resolutionType: 'literal',
    occurredAt: null,
    timeProvenance: 'unknown',
    sortOrder: 0,
    creatorName: null,
    sourceUrl: null,
    listenAnchorSeconds: null,
    confidence: 'high',
    identityTerms: terms,
    identityPhrases: [],
    identityAnchors: identity({}),
  } as ResolvedThreadEntry;
  return { note, entry, identity: identity({ terms }) };
}

describe('identity retrieval', () => {
  it('keeps a below-merge candidate in the ranked set', () => {
    const query = identity({ terms: ['estonia', 'tallinn'] });
    const weak = { id: 'weak', identity: identity({ terms: ['estonia'] }) };
    expect(shouldMergeThreadIdentities(query, weak.identity)).toBe(false);
    const ranked = rankIdentityCandidates(query, [weak], 10);
    expect(ranked.map((candidate) => candidate.id)).toEqual(['weak']);
    expect(ranked[0]?.score).toBeGreaterThan(0);
  });

  it('returns a diagnostic top 10 and sends only the best 5', () => {
    const queryId = '00000000-0000-4000-8000-000000000100';
    const shared = Array.from({ length: 10 }, (_, index) =>
      prepared(`00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, ['estonia']),
    );
    const missed = prepared('00000000-0000-4000-8000-000000000099', ['zzzznotashared']);
    const query = prepared(queryId, ['estonia', 'tallinn']);
    const corpus = [query, ...shared, missed];
    const sets = candidateSetsForNote(corpus, queryId);
    expect(JEV_RETRIEVED_CANDIDATE_LIMIT).toBe(10);
    expect(JEV_DECISION_CANDIDATE_LIMIT).toBe(5);
    expect(sets.retrieved).toHaveLength(10);
    expect(sets.jev).toHaveLength(5);
    expect(sets.jev.map((candidate) => candidate.id)).toEqual(sets.retrieved.slice(0, 5).map((candidate) => candidate.id));
    expect(sets.retrieved.map((candidate) => candidate.id)).not.toContain(missed.note.id);
    expect(sets.retrieved.every((candidate) => !shouldMergeThreadIdentities(query.identity, candidate.identity))).toBe(true);
  });
});
