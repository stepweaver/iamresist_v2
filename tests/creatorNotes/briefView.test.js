import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { selectBriefEpisodes } from '@/lib/creatorNotes/brief';
import {
  briefDisplayText,
  briefForbiddenEpistemicPhrases,
  briefStatementRoleLabel,
  presentBriefNote,
} from '@/lib/creatorNotes/briefPresentation';
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
    attribution: 'David Pakman',
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

function episodeFromNotes(notes, meta = {}) {
  return selectBriefEpisodes({
    runs: [run()],
    notes,
    metas: [
      {
        sourceItemId: 'episode-1',
        creatorName: 'David Pakman',
        title: 'Stay order',
        publishedAt: '2026-09-22T15:00:00.000Z',
        sourceUrl: null,
        transcriptSource: null,
        ...meta,
      },
    ],
  });
}

async function renderBrief(props) {
  const { default: AtomicNotesBrief } = await import('@/components/brief/AtomicNotesBrief');
  return renderToStaticMarkup(React.createElement(AtomicNotesBrief, props));
}

describe('brief presentation helpers', () => {
  it('does not treat creator_analysis as editorial opinion', () => {
    const presented = presentBriefNote(
      note({
        kind: 'creator_analysis',
        text: 'A federal judge granted an injunction restoring access to the affected outlets.',
        verificationStatus: 'unverified',
      }),
    );
    expect(presented.kindLabel).toBe('CREATOR ANALYSIS');
    expect(presented.displayText).toBe(
      'A federal judge granted an injunction restoring access to the affected outlets.',
    );
    expect(presented.verificationLabel).toBe('UNVERIFIED');
    for (const phrase of briefForbiddenEpistemicPhrases()) {
      expect(presented.displayText.toLowerCase()).not.toContain(phrase);
    }
  });

  it('keeps verification status independent of note kind', () => {
    const analysisUnverified = presentBriefNote(
      note({ kind: 'creator_analysis', verificationStatus: 'unverified' }),
    );
    const eventSupported = presentBriefNote(
      note({
        kind: 'event',
        text: 'A federal judge granted an injunction.',
        attribution: null,
        verificationStatus: 'supported',
      }),
    );
    expect(analysisUnverified.kind).toBe('creator_analysis');
    expect(analysisUnverified.verificationStatus).toBe('unverified');
    expect(eventSupported.kind).toBe('event');
    expect(eventSupported.verificationStatus).toBe('supported');
    expect(analysisUnverified.dataAttrs.briefLane).toBe('creator_analysis');
    expect(eventSupported.dataAttrs.briefLane).toBe('fact_event');
  });

  it('renders factual proposition text plainly', () => {
    const text = 'A federal judge granted an injunction restoring access to the affected outlets.';
    expect(briefDisplayText(note({ kind: 'event', text }))).toBe(text);
    expect(briefDisplayText(note({ kind: 'claim', text }))).toBe(text);
  });

  it('attributes genuine creator interpretation without rewriting the proposition', () => {
    const text = 'frames the ruling as a major setback for the administration.';
    const presented = presentBriefNote(
      note({
        kind: 'creator_analysis',
        text,
        attribution: 'MeidasTouch',
        statementRole: 'creator',
      }),
    );
    expect(presented.displayText).toBe(text);
    expect(presented.interpretationAttribution).toBe('MeidasTouch');
  });

  it('does not misattribute quoted or reported speech to the creator', () => {
    const quotedNote = note({
      kind: 'claim',
      text: 'The order will restore access within 48 hours.',
      attribution: 'David Pakman',
      quotedSpeaker: 'Donald Trump',
      statementRole: 'quoted_speaker',
    });
    const reportedNote = note({
      kind: 'claim',
      text: "Lloyd's warned of escalating shipping risk.",
      attribution: 'David Pakman',
      referencedSource: "Lloyd's of London",
      statementRole: 'reported',
    });
    const quoted = presentBriefNote(quotedNote);
    const reported = presentBriefNote(reportedNote);
    expect(briefStatementRoleLabel(quotedNote)).toContain('Quoted speaker');
    expect(briefStatementRoleLabel(quotedNote)).toContain('Donald Trump');
    expect(quoted.interpretationAttribution).toBeNull();
    expect(briefStatementRoleLabel(reportedNote)).toContain('Reported');
    expect(reported.interpretationAttribution).toBeNull();
  });

  it('does not introduce generic transcript or creator-claims hedges', () => {
    const presented = presentBriefNote(
      note({
        kind: 'event',
        text: 'A federal judge granted an injunction.',
        attribution: null,
        verificationStatus: 'unverified',
      }),
    );
    const blob = [
      presented.displayText,
      presented.interpretationAttribution || '',
      presented.statementRoleLabel || '',
      presented.kindLabel,
    ]
      .join(' ')
      .toLowerCase();
    expect(blob).not.toContain('the transcript says');
    expect(blob).not.toContain('the creator claims');
    expect(blob).not.toContain('the creator believes');
    expect(blob).not.toContain('editorial opinion');
    expect(blob).not.toContain('not established fact');
  });
});

describe('Atomic Creator Notes brief view', () => {
  it('renders the empty state', async () => {
    const html = await renderBrief({ episodes: [], configured: true, loadError: null });
    expect(html).toContain('NO EDITORIAL NOTES');
    expect(html).toContain('Episodes');
    expect(html).not.toContain('data-episode');
  });

  it('renders evidence without conflating kind with epistemology', async () => {
    const episodes = episodeFromNotes([note()]);
    const html = await renderBrief({ episodes, configured: true, loadError: null });

    expect(html).toContain('overflow-x-hidden');
    expect(html).toContain('break-words');
    expect(html).toContain('sm:p-4');
    expect(html).toContain('CREATOR ANALYSIS');
    expect(html).not.toContain('not established fact');
    expect(html).not.toContain('Editorial opinion');
    expect(html).not.toContain('editorial opinion');
    expect(html).not.toContain('The transcript says');
    expect(html).not.toContain('The creator claims');
    expect(html).not.toContain('The creator believes');
    expect(html).toContain('Evidence window text for the stay analysis.');
    expect(html).toContain('Source segments');
    expect(html).toContain('2, 3');
    expect(html).toContain('Time range');
    expect(html).toContain('NOT APPLICABLE');
    expect(html).toContain('David Pakman');
    expect(html).toContain('Stay order');
    expect(html).toContain('data-brief-lane="creator_analysis"');
    expect(html).toContain('data-verification-status="not_applicable"');
  });

  it('renders factual event text plainly with independent verification', async () => {
    const episodes = episodeFromNotes([
      note({
        id: 'note-event',
        kind: 'event',
        text: 'A federal judge granted an injunction restoring access to the affected outlets.',
        attribution: null,
        statementRole: 'unknown',
        verificationStatus: 'unverified',
      }),
    ]);
    const html = await renderBrief({ episodes, configured: true, loadError: null });
    expect(html).toContain('A federal judge granted an injunction restoring access to the affected outlets.');
    expect(html).toContain('data-note-kind="event"');
    expect(html).toContain('data-verification-status="unverified"');
    expect(html).toContain('data-brief-lane="fact_event"');
    expect(html).not.toContain('not established fact');
    expect(html).not.toContain('The creator claims');
    expect(html).not.toContain('data-interpretation-attribution');
  });

  it('attributes creator interpretation when the proposition itself is not already named', async () => {
    const episodes = episodeFromNotes([
      note({
        kind: 'creator_analysis',
        text: 'frames the ruling as a major setback for the administration.',
        attribution: 'MeidasTouch',
        statementRole: 'creator',
        verificationStatus: 'not_applicable',
      }),
    ]);
    const html = await renderBrief({ episodes, configured: true, loadError: null });
    expect(html).toContain('frames the ruling as a major setback for the administration.');
    expect(html).toContain('Interpretation · MeidasTouch');
    expect(html).toContain('data-brief-lane="creator_analysis"');
    expect(html).not.toContain('editorial opinion');
  });

  it('labels quoted speech without treating it as creator interpretation', async () => {
    const episodes = episodeFromNotes([
      note({
        id: 'note-quoted',
        kind: 'claim',
        text: 'The order will restore access within 48 hours.',
        attribution: 'David Pakman',
        quotedSpeaker: 'Donald Trump',
        statementRole: 'quoted_speaker',
        verificationStatus: 'unverified',
      }),
    ]);
    const html = await renderBrief({ episodes, configured: true, loadError: null });
    expect(html).toContain('Quoted speaker · Donald Trump');
    expect(html).toContain('data-statement-role="quoted_speaker"');
    expect(html).not.toContain('Interpretation · David Pakman');
    expect(html).not.toContain('The creator claims');
  });

  it('omits opaque episode ids and filenames from the heading', async () => {
    const opaqueId = 'Jjr199LfbBt7AHIEMSNCwrHXLHNqiKY';
    const episodes = selectBriefEpisodes({
      runs: [run({ sourceItemId: opaqueId })],
      notes: [note({ sourceItemId: opaqueId })],
      metas: [
        {
          sourceItemId: opaqueId,
          creatorName: 'Mel Dastouch Network',
          title: `${opaqueId}.mp3`,
          publishedAt: null,
          sourceUrl: 'https://example.com/audio',
          transcriptSource: null,
        },
      ],
    });
    const html = await renderBrief({ episodes, configured: true, loadError: null });

    expect(html).toContain('Mel Dastouch Network');
    expect(html).not.toContain(`${opaqueId}.mp3`);
    expect(html).not.toContain(`>${opaqueId}<`);
    expect(html).not.toContain('<h4');
  });
});
