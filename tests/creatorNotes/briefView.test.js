import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { selectBriefEpisodes } from '@/lib/creatorNotes/brief';
import { CREATOR_NOTE_EXTRACTION_VERSION } from '@/lib/creatorNotes/constants';

(globalThis).React = React;

function run(overrides = {}) {
  return {
    id: 'run-current',
    sourceItemId: 'episode-1',
    sourceIdentityKey: null,
    creatorId: 'pakman',
    modelProvider: 'ollama',
    modelName: 'gemma3:4b',
    extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
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

function note(overrides = {}) {
  return {
    id: 'note-1',
    sourceItemId: 'episode-1',
    creatorId: 'pakman',
    startSeconds: 12,
    endSeconds: 40,
    kind: 'creator_analysis',
    text: 'The host argues the stay shows the court is not deferring to the order.',
    attribution: null,
    eventFeatures: null,
    sourceExcerpt: 'Evidence window text for the stay analysis.',
    sourceQuote: 'issued a stay',
    exactQuote: 'issued a stay',
    sourceSegmentIndexes: [2, 3],
    contentRole: 'editorial',
    verificationStatus: 'not_applicable',
    extractionRunId: 'run-current',
    noteFingerprint: 'fp-1',
    createdAt: '2026-09-20T01:00:00.000Z',
    ...overrides,
  };
}

async function renderBrief(props) {
  const { default: AtomicNotesBrief } = await import('@/components/brief/AtomicNotesBrief');
  return renderToStaticMarkup(React.createElement(AtomicNotesBrief, props));
}

describe('Atomic Creator Notes brief view', () => {
  it('renders the empty state', async () => {
    const html = await renderBrief({ episodes: [], configured: true, loadError: null });
    expect(html).toContain('NO EDITORIAL NOTES');
    expect(html).toContain('Episodes');
    expect(html).not.toContain('data-episode');
  });

  it('renders evidence and stays within a mobile-safe width', async () => {
    const episodes = selectBriefEpisodes({
      runs: [run()],
      notes: [note()],
      metas: [
        {
          sourceItemId: 'episode-1',
          creatorName: 'David Pakman',
          title: 'Stay order',
          publishedAt: '2026-09-22T15:00:00.000Z',
          sourceUrl: null,
          transcriptSource: null,
        },
      ],
    });
    const html = await renderBrief({ episodes, configured: true, loadError: null });

    expect(html).toContain('overflow-x-hidden');
    expect(html).toContain('break-words');
    expect(html).toContain('sm:p-4');
    expect(html).toContain('CREATOR ANALYSIS');
    expect(html).toContain('not established fact');
    expect(html).toContain('Evidence window text for the stay analysis.');
    expect(html).toContain('Source segments');
    expect(html).toContain('2, 3');
    expect(html).toContain('Time range');
    expect(html).toContain('NOT APPLICABLE');
    expect(html).toContain('David Pakman');
  });
});
