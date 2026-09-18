import { describe, expect, it } from 'vitest';

import {
  CREATOR_NOTES_PREFERRED_SOURCE_SEGMENTS,
  CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS,
} from '@/lib/creatorNotes/constants';
import {
  applySourceEvidence,
  buildSourceExcerpt,
  resolveSourceSegmentEvidence,
  trimToWordBoundary,
} from '@/lib/creatorNotes/sourceEvidence';
import type { CreatorTranscriptSegment, RawCreatorNote } from '@/lib/creatorNotes/types';

function segment(index: number, text: string): CreatorTranscriptSegment {
  return { index, startSeconds: index * 10, endSeconds: index * 10 + 9, text };
}

function note(overrides: Partial<RawCreatorNote> = {}): RawCreatorNote {
  return {
    kind: 'event',
    startSeconds: 10,
    endSeconds: 20,
    text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
    attribution: null,
    eventFeatures: null,
    sourceExcerpt: 'MODEL PARAPHRASE THAT MUST NOT BECOME EVIDENCE',
    exactQuote: null,
    sourceSegmentIndexes: [],
    ...overrides,
  };
}

describe('Atomic Creator Notes source evidence', () => {
  const segments = [
    segment(0, 'Welcome back to the show.'),
    segment(
      1,
      'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
    ),
    segment(
      2,
      'The filing is the Supplemental Declaration of Records Custodian Ellis Voss, and it lists a $2.6 million no-bid Harborline water contract.',
    ),
    segment(3, 'Calder v. Westmere Civic Board started last fall after the board closed the rate workshop in Westmere.'),
  ];

  it('copies sourceExcerpt from original transcript text, not model text', () => {
    const result = applySourceEvidence(
      [
        note({
          sourceSegmentIndexes: [1],
          exactQuote: 'The speaker argues that Westmere County Court made a politically significant filing.',
        }),
      ],
      segments,
    );
    expect(result.notes[0].sourceExcerpt).toBe(segments[1].text);
    expect(result.notes[0].sourceExcerpt).not.toContain('politically significant');
    expect(result.notes[0].sourceExcerpt).not.toBe('MODEL PARAPHRASE THAT MUST NOT BECOME EVIDENCE');
    expect(result.notes[0].text).toContain('Westmere County Court');
    expect(result.diagnostics.notesWithSourceEvidence).toBe(1);
    expect(result.diagnostics.exactQuotesRejected).toBe(1);
    expect(result.notes[0].exactQuote).toBeNull();
  });

  it('does not let a model paraphrase alter sourceExcerpt', () => {
    const paraphrase =
      'The speaker argues that the development is politically significant, while making clear that this is their interpretation of the consequences.';
    const result = applySourceEvidence(
      [
        note({
          text: 'Quinn interprets the Westmere filing as politically significant.',
          sourceExcerpt: paraphrase,
          exactQuote: paraphrase,
          sourceSegmentIndexes: [1],
        }),
      ],
      segments,
    );
    expect(result.notes[0].sourceExcerpt).toBe(segments[1].text);
    expect(result.notes[0].sourceExcerpt).not.toBe(paraphrase);
    expect(result.notes[0].exactQuote).toBeNull();
  });

  it('produces exact transcript evidence from correct segment indexes', () => {
    const result = applySourceEvidence([note({ sourceSegmentIndexes: [1, 2] })], segments);
    expect(result.notes[0].sourceExcerpt).toBe(`${segments[1].text} ${segments[2].text}`);
    expect(result.notes[0].sourceSegmentIndexes).toEqual([1, 2]);
    expect(result.diagnostics.notesWithSourceEvidence).toBe(1);
    expect(result.diagnostics.notesWithoutSourceEvidence).toBe(0);
    expect(result.diagnostics.invalidSourceSegmentReferences).toBe(0);
  });

  it('rejects invalid segment indexes without using them as evidence', () => {
    const result = applySourceEvidence(
      [
        note({ sourceSegmentIndexes: [1, 99] }),
        note({
          kind: 'context',
          text: 'Calder v. Westmere Civic Board started last fall after the rate workshop closed.',
          sourceSegmentIndexes: [0, 3],
        }),
      ],
      segments,
    );
    expect(result.notes[0].sourceExcerpt).toBeNull();
    expect(result.notes[0].sourceSegmentIndexes).toEqual([]);
    expect(result.notes[1].sourceExcerpt).toBeNull();
    expect(result.diagnostics.invalidSourceSegmentReferences).toBe(2);
    expect(result.diagnostics.notesWithoutSourceEvidence).toBe(2);
    expect(result.notes).toHaveLength(2);
  });

  it('keeps a fabricated exactQuote null while sourceExcerpt survives', () => {
    const result = applySourceEvidence(
      [
        note({
          exactQuote: 'The moon is made of cheese according to the secret Calder appendix.',
          sourceSegmentIndexes: [1],
        }),
      ],
      segments,
    );
    expect(result.notes[0].exactQuote).toBeNull();
    expect(result.notes[0].sourceExcerpt).toBe(segments[1].text);
    expect(result.diagnostics.exactQuotesRequested).toBe(1);
    expect(result.diagnostics.exactQuotesVerified).toBe(0);
    expect(result.diagnostics.exactQuotesRejected).toBe(1);
    expect(result.diagnostics.notesWithSourceEvidence).toBe(1);
  });

  it('retains a valid exactQuote after verification against original transcript text', () => {
    const quote =
      'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.';
    const result = applySourceEvidence(
      [note({ exactQuote: quote, sourceSegmentIndexes: [1] })],
      segments,
    );
    expect(result.notes[0].exactQuote).toBe(quote);
    expect(result.notes[0].sourceExcerpt).toBe(segments[1].text);
    expect(result.diagnostics.exactQuotesVerified).toBe(1);
    expect(result.diagnostics.exactQuotesRejected).toBe(0);
  });

  it('bounds oversized source evidence without truncating a word or inserting generated text', () => {
    const longA = `${'Harborline '.repeat(40)}contract.`;
    const longB = `${'Westmere '.repeat(40)}workshop.`;
    const longC = `${'Calder '.repeat(40)}filing.`;
    const longD = `${'Voss '.repeat(40)}declaration.`;
    const oversized = [segment(0, longA), segment(1, longB), segment(2, longC), segment(3, longD)];
    expect(longA.length + longB.length + longC.length + longD.length).toBeGreaterThan(
      CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS,
    );

    const built = buildSourceExcerpt(oversized, [0, 1, 2, 3]);
    expect(built).not.toBeNull();
    expect(built?.indexes.length).toBeLessThanOrEqual(CREATOR_NOTES_PREFERRED_SOURCE_SEGMENTS);
    expect(built?.excerpt.length).toBeLessThanOrEqual(CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS);
    const fromOriginal = built?.indexes.map((index) => oversized[index].text).join(' ');
    expect(built?.excerpt).toBe(fromOriginal);
    expect(built?.excerpt).not.toContain('…');
    expect(built?.excerpt).not.toContain('[truncated]');
    expect(built?.excerpt).not.toMatch(/[A-Za-z]$/);

    const hugeWord = `Harborline${'x'.repeat(CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS + 40)}`;
    const trimmed = trimToWordBoundary(`The ${hugeWord} ended`, CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS);
    expect(trimmed.endsWith('x')).toBe(false);
    expect(trimmed).toBe('The');
    expect(trimmed.length).toBeLessThanOrEqual(CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS);
  });
});

describe('Atomic Creator Notes source index resolution', () => {
  it('fills a nearly contiguous gap from original transcript segments', () => {
    const segments = [
      segment(0, 'Alpha opening.'),
      segment(1, 'Bravo filing accepted.'),
      segment(2, 'Charlie declaration listed.'),
    ];
    const resolved = resolveSourceSegmentEvidence([1, 2], segments);
    expect(resolved.ok).toBe(true);
    expect(resolved.indexes).toEqual([1, 2]);
    expect(resolved.excerpt).toBe('Bravo filing accepted. Charlie declaration listed.');
  });
});
