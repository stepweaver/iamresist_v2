import { describe, expect, it } from 'vitest';

import { formatNotePreview } from '@/lib/creatorNotes/format';
import {
  isEvidentiaryReferencedSource,
  resolveCreatorVersusReferencedSource,
} from '@/lib/creatorNotes/identity';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { acceptGroundedCreatorNotes } from '@/lib/creatorNotes/sourceEvidence';
import { emptyKindDiagnostics, validateRawCreatorNote } from '@/lib/creatorNotes/validate';
import type { CreatorTranscriptInput, RawCreatorNote } from '@/lib/creatorNotes/types';

const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};

function jiangTranscript(): CreatorTranscriptInput {
  return {
    sourceItemId: 'guid-jiang-lloyds',
    creatorId: 'professor-jiang',
    creatorName: 'Professor Jiang',
    sourceTitle: 'War-risk bulletin',
    sourceUrl: 'https://creator.example/jiang',
    publishedAt: '2026-09-20T00:00:00.000Z',
    sourceIdentityKey: 'https://creator.example/jiang',
    segments: [
      {
        index: 0,
        startSeconds: 12,
        endSeconds: 48,
        text: 'Jiang cites Lloyds of London which published a war-risk bulletin after the exclusion zone expanded.',
      },
    ],
  };
}

describe('creator vs referencedSource', () => {
  it('does not overwrite Professor Jiang with Lloyds of London on evidence_reference', () => {
    const note = validateRawCreatorNote(
      {
        kind: 'evidence_reference',
        text: 'Jiang cites a Lloyds of London war-risk bulletin after the exclusion zone expanded.',
        attribution: 'Lloyds of London',
        sourceQuote: 'Jiang cites Lloyds of London which published a war-risk bulletin',
        eventFeatures: {
          actors: [],
          action: 'published a war-risk bulletin',
          object: 'war-risk bulletin',
          institutions: ['Lloyds of London'],
          locations: [],
          referencedDocuments: ['Lloyds of London war-risk bulletin'],
        },
      },
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(note.attribution).toBe('Professor Jiang');
    expect(note.referencedSource).toBe('Lloyds of London');
  });

  it('keeps a named guest on claims and still records a referenced institution separately', () => {
    const note = resolveCreatorVersusReferencedSource(
      {
        kind: 'claim' as const,
        attribution: 'Jordan Hale',
        referencedSource: null,
        eventFeatures: {
          actors: ['Jordan Hale'],
          action: null,
          object: null,
          institutions: ['IAEA'],
          locations: [],
          referencedDocuments: [],
        },
      },
      'Professor Jiang',
    );
    expect(note.attribution).toBe('Jordan Hale');
    expect(note.referencedSource).toBeNull();
  });

  it('previews creator and referencedSource without replacing the speaker', () => {
    const preview = formatNotePreview({
      id: 'n1',
      sourceItemId: 'guid-jiang-lloyds',
      creatorId: 'professor-jiang',
      startSeconds: 12,
      endSeconds: 48,
      kind: 'evidence_reference',
      text: 'Jiang cites a Lloyds of London war-risk bulletin after the exclusion zone expanded.',
      attribution: 'Professor Jiang',
      referencedSource: "Lloyd's of London",
      eventFeatures: null,
      sourceExcerpt: 'Jiang cites Lloyds of London which published a war-risk bulletin after the exclusion zone expanded.',
      exactQuote: 'Jiang cites Lloyds of London which published a war-risk bulletin',
      sourceSegmentIndexes: [0],
      verificationStatus: 'not_applicable',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp',
      createdAt: '2026-09-20T00:00:00.000Z',
    });
    expect(preview).toContain('EVIDENCE REFERENCE — Professor Jiang');
    expect(preview).toContain("referencedSource: Lloyd's of London");
    expect(preview).not.toContain('EVIDENCE REFERENCE — Lloyd');
  });

  it('repairs model attribution during extraction so the creator remains Jiang', async () => {
    const transcript = jiangTranscript();
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'ref-src',
        log: () => {},
        extractChunk: async () => ({
          notes: [
            {
              kind: 'evidence_reference',
              startSeconds: 12,
              endSeconds: 48,
              text: 'Jiang cites a Lloyds of London war-risk bulletin after the exclusion zone expanded.',
              attribution: 'Lloyds of London',
              referencedSource: null,
              eventFeatures: {
                actors: [],
                action: 'published a war-risk bulletin',
                object: 'war-risk bulletin',
                institutions: ['Lloyds of London'],
                locations: [],
                referencedDocuments: [],
              },
              sourceExcerpt: null,
              sourceQuote: 'Jiang cites Lloyds of London which published a war-risk bulletin',
              exactQuote: 'Jiang cites Lloyds of London which published a war-risk bulletin',
              sourceSegmentIndexes: [],
            } satisfies RawCreatorNote,
          ],
          rejected: 0,
          kindDiagnostics: emptyKindDiagnostics(),
        }),
      },
    );
    expect(result.notes[0]?.attribution).toBe('Professor Jiang');
    expect(result.notes[0]?.referencedSource).toBe('Lloyds of London');
    expect(result.notes[0]?.kind).toBe('evidence_reference');
  });

  it('does not populate referencedSource with a subject country or actor', () => {
    const note = validateRawCreatorNote(
      {
        kind: 'evidence_reference',
        text: 'Jiang says Iran expanded the exclusion zone after the navy warning.',
        attribution: 'Professor Jiang',
        referencedSource: 'Iran',
        sourceQuote: 'Iran expanded the exclusion zone after the navy warning',
        eventFeatures: {
          actors: ['Iran'],
          action: 'expanded the exclusion zone',
          object: 'exclusion zone',
          institutions: ['Iran'],
          locations: ['Iran'],
          referencedDocuments: [],
        },
      },
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(note.referencedSource).toBeNull();
    expect(note.kind).toBe('evidence_reference');
  });

  it('rejects evidence_reference when a country or actor masquerades as referencedSource', () => {
    const segments = jiangTranscript().segments;
    const accepted = acceptGroundedCreatorNotes(
      [
        {
          kind: 'evidence_reference',
          startSeconds: 12,
          endSeconds: 48,
          text: 'Jiang says Iran expanded the exclusion zone after the navy warning.',
          attribution: 'Professor Jiang',
          referencedSource: 'Iran',
          eventFeatures: {
            actors: ['Iran'],
            action: 'expanded the exclusion zone',
            object: 'exclusion zone',
            institutions: ['Iran'],
            locations: ['Iran'],
            referencedDocuments: [],
          },
          sourceExcerpt: null,
          sourceQuote: 'Iran expanded the exclusion zone after the navy warning',
          exactQuote: 'Iran expanded the exclusion zone after the navy warning',
          sourceSegmentIndexes: [0],
        },
      ],
      segments,
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.rejected).toBe(1);
    expect(accepted.notes.some((item) => item.kind !== 'evidence_reference')).toBe(false);
  });

  it('rejects evidence_reference when referencedSource does not occur in the evidence window', () => {
    const segments = jiangTranscript().segments;
    expect(
      isEvidentiaryReferencedSource('Wall Street Journal', { actors: [], action: null, object: null, institutions: ['Wall Street Journal'], locations: [], referencedDocuments: [] }, segments[0].text),
    ).toBe(false);
    const accepted = acceptGroundedCreatorNotes(
      [
        {
          kind: 'evidence_reference',
          startSeconds: 12,
          endSeconds: 48,
          text: 'Jiang cites a Wall Street Journal report on the war-risk bulletin.',
          attribution: 'Professor Jiang',
          referencedSource: 'Wall Street Journal',
          eventFeatures: {
            actors: [],
            action: 'cites',
            object: 'war-risk bulletin',
            institutions: ['Wall Street Journal'],
            locations: [],
            referencedDocuments: ['Wall Street Journal report'],
          },
          sourceExcerpt: null,
          sourceQuote: 'Jiang cites Lloyds of London which published a war-risk bulletin',
          exactQuote: 'Jiang cites Lloyds of London which published a war-risk bulletin',
          sourceSegmentIndexes: [0],
        },
      ],
      segments,
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.rejected).toBe(1);
    expect(accepted.notes.map((item) => item.kind)).not.toContain('claim');
    expect(accepted.notes.map((item) => item.kind)).not.toContain('event');
  });

  it('keeps a real publication or document as referencedSource', () => {
    const note = validateRawCreatorNote(
      {
        kind: 'evidence_reference',
        text: 'Jiang cites a Wall Street Journal report on the war-risk bulletin.',
        attribution: 'Professor Jiang',
        referencedSource: 'Wall Street Journal',
        sourceQuote: 'Jiang cites a Wall Street Journal report on the war-risk bulletin',
        eventFeatures: {
          actors: ['Iran'],
          action: 'cites',
          object: 'war-risk bulletin',
          institutions: ['Wall Street Journal'],
          locations: ['Iran'],
          referencedDocuments: ['Wall Street Journal report'],
        },
      },
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(note.referencedSource).toBe('Wall Street Journal');
    expect(note.kind).toBe('evidence_reference');
  });

  it('accepts evidence_reference only when the named source occurs in the evidence window', () => {
    const segments = [
      {
        index: 0,
        startSeconds: 12,
        endSeconds: 48,
        text: 'Jiang cites a Wall Street Journal report on the war-risk bulletin after the exclusion zone expanded.',
      },
    ];
    const accepted = acceptGroundedCreatorNotes(
      [
        {
          kind: 'evidence_reference',
          startSeconds: 12,
          endSeconds: 48,
          text: 'Jiang cites a Wall Street Journal report on the war-risk bulletin.',
          attribution: 'Professor Jiang',
          referencedSource: 'Wall Street Journal',
          eventFeatures: {
            actors: ['Iran'],
            action: 'cites',
            object: 'war-risk bulletin',
            institutions: ['Wall Street Journal'],
            locations: ['Iran'],
            referencedDocuments: ['Wall Street Journal report'],
          },
          sourceExcerpt: null,
          sourceQuote: 'Jiang cites a Wall Street Journal report on the war-risk bulletin',
          exactQuote: 'Jiang cites a Wall Street Journal report on the war-risk bulletin',
          sourceSegmentIndexes: [0],
        },
      ],
      segments,
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(accepted.notes).toHaveLength(1);
    expect(accepted.notes[0]?.kind).toBe('evidence_reference');
    expect(accepted.notes[0]?.referencedSource).toBe('Wall Street Journal');
  });
});
