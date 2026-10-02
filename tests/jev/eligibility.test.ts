import { describe, expect, it } from 'vitest';

import { JEV_DECISION_CANDIDATE_LIMIT } from '@/lib/jev/constants';
import { takeUsableCandidates } from '@/lib/jev/eligibility';
import type { JevUpstreamNoteStatus, ShadowLabelFile, ShadowNoteReview } from '@/lib/jev/types';

function note(id: string, status: JevUpstreamNoteStatus): ShadowNoteReview {
  return { id, status } as ShadowNoteReview;
}

function labels(statuses: Record<string, JevUpstreamNoteStatus>): ShadowLabelFile {
  const notes: Record<string, ShadowNoteReview> = {};
  for (const [id, status] of Object.entries(statuses)) notes[id] = note(id, status);
  return { sourceItemIds: ['source-item-1'], notes, retrieval: [], rows: [] };
}

describe('usable candidate filter', () => {
  it.each(['misattributed', 'unsupported', 'non_editorial', 'unclear'] as const)(
    'drops a %s candidate and keeps the original retrieved rank',
    (status) => {
      const kept = takeUsableCandidates(
        [
          { id: 'invalid', rank: 2 },
          { id: 'valid', rank: 5 },
        ],
        labels({ invalid: status, valid: 'usable' }),
      );
      expect(kept).toEqual([{ id: 'valid', rank: 5 }]);
    },
  );

  it('keeps usable candidates in retrieval order without renumbering rank', () => {
    const kept = takeUsableCandidates(
      [
        { id: 'misattributed', rank: 1 },
        { id: 'first', rank: 2 },
        { id: 'unsupported', rank: 3 },
        { id: 'second', rank: 4 },
        { id: 'non_editorial', rank: 5 },
        { id: 'unclear', rank: 6 },
      ],
      labels({
        misattributed: 'misattributed',
        first: 'usable',
        unsupported: 'unsupported',
        second: 'usable',
        non_editorial: 'non_editorial',
        unclear: 'unclear',
      }),
    );
    expect(kept.map((candidate) => candidate.id)).toEqual(['first', 'second']);
    expect(kept.map((candidate) => candidate.rank)).toEqual([2, 4]);
  });

  it('caps the usable set at the existing Jev maximum', () => {
    const candidates = Array.from({ length: JEV_DECISION_CANDIDATE_LIMIT + 2 }, (_, index) => ({
      id: `usable-${index + 1}`,
      rank: index + 1,
    }));
    const kept = takeUsableCandidates(
      candidates,
      labels(Object.fromEntries(candidates.map((candidate) => [candidate.id, 'usable' as const]))),
    );
    expect(kept).toHaveLength(JEV_DECISION_CANDIDATE_LIMIT);
    expect(kept.map((candidate) => candidate.rank)).toEqual([1, 2, 3, 4, 5]);
  });
});
