import { describe, expect, it } from 'vitest';

import {
  applyBriefFilters,
  briefDiagnostics,
  groupBriefEpisodes,
  selectBriefEpisodes,
} from '@/lib/creatorNotes/brief';
import { CREATOR_NOTE_EXTRACTION_VERSION } from '@/lib/creatorNotes/constants';
import type { CreatorAtomicNote, CreatorNoteRun } from '@/lib/creatorNotes/types';

const CURRENT = CREATOR_NOTE_EXTRACTION_VERSION;

function run(overrides: Partial<CreatorNoteRun> = {}): CreatorNoteRun {
  return {
    id: 'run-1',
    sourceItemId: 'episode-1',
    sourceIdentityKey: null,
    creatorId: 'pakman',
    modelProvider: 'ollama',
    modelName: 'gemma3:4b',
    extractionVersion: CURRENT,
    transcriptHash: 'hash',
    status: 'success',
    inputChars: 100,
    notesCreated: 1,
    startedAt: '2026-09-20T00:00:00.000Z',
    completedAt: '2026-09-20T01:00:00.000Z',
    errorMessage: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  };
}

function note(overrides: Partial<CreatorAtomicNote> = {}): CreatorAtomicNote {
  return {
    id: 'note-1',
    sourceItemId: 'episode-1',
    creatorId: 'pakman',
    startSeconds: 12,
    endSeconds: 40,
    kind: 'event',
    text: 'A court issued a stay on the deployment order.',
    attribution: null,
    eventFeatures: null,
    sourceExcerpt: 'A federal appeals court issued a stay.',
    sourceQuote: 'issued a stay',
    exactQuote: 'issued a stay',
    sourceSegmentIndexes: [4, 5],
    contentRole: 'editorial',
    verificationStatus: 'unverified',
    extractionRunId: 'run-current',
    noteFingerprint: 'fp-1',
    createdAt: '2026-09-20T01:00:00.000Z',
    ...overrides,
  };
}

describe('Atomic Creator Notes brief selection', () => {
  it('shows only the newest successful current-version run for an episode', () => {
    const episodes = selectBriefEpisodes({
      runs: [
        run({
          id: 'run-old',
          extractionVersion: 'creator-notes-v1.10',
          completedAt: '2026-09-22T01:00:00.000Z',
        }),
        run({
          id: 'run-current',
          extractionVersion: CURRENT,
          completedAt: '2026-09-21T01:00:00.000Z',
          sourceIdentityKey: 'https://example.com/episode',
        }),
        run({
          id: 'run-failed',
          extractionVersion: CURRENT,
          status: 'failed',
          completedAt: '2026-09-23T01:00:00.000Z',
        }),
      ],
      notes: [
        note({ id: 'old-note', extractionRunId: 'run-old', text: 'Obsolete v1.10 note about the stay order.' }),
        note({ id: 'current-note', extractionRunId: 'run-current' }),
        note({ id: 'failed-note', extractionRunId: 'run-failed', text: 'Failed run note that must stay hidden.' }),
      ],
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0].runId).toBe('run-current');
    expect(episodes[0].extractionVersion).toBe(CURRENT);
    expect(episodes[0].notes.map((item) => item.id)).toEqual(['current-note']);
    expect(episodes[0].sourceUrl).toBe('https://example.com/episode');
  });

  it('does not duplicate an episode across v1.8, v1.9, and v1.10 runs', () => {
    const runs = [
      run({ id: 'v18', extractionVersion: 'creator-notes-v1.8', completedAt: '2026-09-18T01:00:00.000Z' }),
      run({ id: 'v19', extractionVersion: 'creator-notes-v1.9', completedAt: '2026-09-19T01:00:00.000Z' }),
      run({ id: 'v110', extractionVersion: 'creator-notes-v1.10', completedAt: '2026-09-20T01:00:00.000Z' }),
    ];
    const withoutCurrent = selectBriefEpisodes({
      runs,
      notes: [
        note({ id: 'n18', extractionRunId: 'v18', text: 'Version 1.8 note about the deployment stay.' }),
        note({ id: 'n19', extractionRunId: 'v19', text: 'Version 1.9 note about the deployment stay.' }),
        note({ id: 'n110', extractionRunId: 'v110', text: 'Version 1.10 note about the deployment stay.' }),
      ],
    });
    expect(withoutCurrent).toHaveLength(1);
    expect(withoutCurrent[0].runId).toBe('v110');
    expect(withoutCurrent[0].notes.map((item) => item.id)).toEqual(['n110']);

    const withCurrent = selectBriefEpisodes({
      runs: [
        ...runs,
        run({ id: 'v111', extractionVersion: CURRENT, completedAt: '2026-09-17T01:00:00.000Z' }),
      ],
      notes: [
        note({ id: 'n18', extractionRunId: 'v18', text: 'Version 1.8 note about the deployment stay.' }),
        note({ id: 'n19', extractionRunId: 'v19', text: 'Version 1.9 note about the deployment stay.' }),
        note({ id: 'n110', extractionRunId: 'v110', text: 'Version 1.10 note about the deployment stay.' }),
        note({ id: 'n111', extractionRunId: 'v111', text: 'Current version note about the deployment stay.' }),
      ],
    });
    expect(withCurrent).toHaveLength(1);
    expect(withCurrent[0].extractionVersion).toBe(CURRENT);
    expect(withCurrent[0].notes.map((item) => item.id)).toEqual(['n111']);
  });

  it('excludes non-editorial content roles', () => {
    const episodes = selectBriefEpisodes({
      runs: [run({ id: 'run-current' })],
      notes: [
        note({ id: 'keep', contentRole: 'editorial' }),
        note({ id: 'sponsor', contentRole: 'sponsor_read', text: 'Use the offer code at the sponsor site today.' }),
        note({ id: 'house', contentRole: 'housekeeping', text: 'Please subscribe and hit the notification bell.' }),
        note({ id: 'intro', contentRole: 'intro_outro', text: 'Welcome back to the show, thanks for listening.' }),
        note({ id: 'unsure', contentRole: 'uncertain', text: 'Uncertain segment that is not editorial material.' }),
        note({ id: 'legacy', contentRole: undefined, text: 'Legacy note stored before content-role classification.' }),
      ],
    });

    expect(episodes[0].notes.map((item) => item.id)).toEqual(['keep']);
  });

  it('groups episodes by day and creator without mixing creators', () => {
    const episodes = selectBriefEpisodes({
      metas: [
        {
          sourceItemId: 'episode-1',
          creatorName: 'David Pakman',
          title: 'Stay order',
          publishedAt: '2026-09-22T15:00:00.000Z',
          sourceUrl: null,
          transcriptSource: null,
        },
        {
          sourceItemId: 'episode-2',
          creatorName: 'Breaking Points',
          title: 'Hearing day',
          publishedAt: '2026-09-22T18:00:00.000Z',
          sourceUrl: null,
          transcriptSource: 'publisher-transcript',
        },
      ],
      runs: [
        run({ id: 'run-a', sourceItemId: 'episode-1', creatorId: 'pakman' }),
        run({ id: 'run-b', sourceItemId: 'episode-2', creatorId: 'bp', completedAt: '2026-09-22T19:00:00.000Z' }),
      ],
      notes: [
        note({ id: 'a', sourceItemId: 'episode-1', creatorId: 'pakman', extractionRunId: 'run-a' }),
        note({
          id: 'b',
          sourceItemId: 'episode-2',
          creatorId: 'bp',
          extractionRunId: 'run-b',
          kind: 'claim',
          text: 'The host claims the committee withheld the memo from members.',
          verificationStatus: 'unverified',
        }),
      ],
    });

    const days = groupBriefEpisodes(episodes);
    expect(days).toHaveLength(1);
    expect(days[0].dayKey).toBe('2026-09-22');
    expect(days[0].creators.map((group) => group.creatorName)).toEqual(['Breaking Points', 'David Pakman']);
    expect(days[0].creators[0].episodes[0].transcriptSource).toBe('publisher-transcript');
    expect(days[0].creators[0].episodes[0].title).toBe('Hearing day');

    const filtered = applyBriefFilters(episodes, { creator: 'pakman', kind: 'event' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].creatorId).toBe('pakman');
  });

  it('keeps evidence expansion fields on the selected note', () => {
    const [episode] = selectBriefEpisodes({
      runs: [run({ id: 'run-current' })],
      notes: [
        note({
          sourceExcerpt: 'The docket entry quotes the stay order verbatim from the clerk.',
          sourceSegmentIndexes: [7, 8, 9],
          startSeconds: 90,
          endSeconds: 140,
          referencedSource: "Lloyd's of London",
        }),
      ],
    });

    const selected = episode.notes[0];
    expect(selected.sourceExcerpt).toContain('docket entry');
    expect(selected.sourceSegmentIndexes).toEqual([7, 8, 9]);
    expect(selected.startSeconds).toBe(90);
    expect(selected.endSeconds).toBe(140);
    expect(selected.referencedSource).toBe("Lloyd's of London");
    expect(selected.verificationStatus).toBe('unverified');
  });

  it('returns an empty corpus when nothing editorial is stored', () => {
    expect(selectBriefEpisodes({ runs: [], notes: [] })).toEqual([]);
    expect(briefDiagnostics([])).toMatchObject({
      episodeCount: 0,
      noteCount: 0,
      newestExtractionAt: null,
      creators: [],
      extractionVersions: [],
    });
  });
});
