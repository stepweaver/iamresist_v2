import { describe, expect, it } from 'vitest';

import { CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS } from '@/lib/creatorNotes/constants';
import { formatNotePreview } from '@/lib/creatorNotes/format';
import {
  applyQuoteVerification,
  concatenateTranscriptSegments,
  extractVerifiedQuote,
  normalizeForQuoteMatch,
  quoteAnchorStartSeconds,
} from '@/lib/creatorNotes/quotes';
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
    sourceExcerpt: null,
    exactQuote: null,
    sourceSegmentIndexes: [],
    ...overrides,
  };
}

describe('Atomic Creator Notes quote matching', () => {
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
  ];

  it('verifies a verbatim transcript excerpt', () => {
    const quote =
      'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.';
    const source = concatenateTranscriptSegments(segments, [1]);
    expect(extractVerifiedQuote(quote, source)).toBe(quote);
  });

  it('verifies harmless whitespace and line-break differences', () => {
    const source = concatenateTranscriptSegments(segments, [1, 2]);
    const messy =
      'On   March 3, 2026,\nWestmere County Court accepted a new filing in Calder v. Westmere Civic Board.';
    const verified = extractVerifiedQuote(messy, source);
    expect(verified).toBe(
      'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
    );
    expect(normalizeForQuoteMatch(messy).normalized).toBe(normalizeForQuoteMatch(verified || '').normalized);
  });

  it('verifies smart/straight quote folding without rewriting an unverifiable string', () => {
    const local = [segment(0, 'She called it “a no-bid Harborline water contract.”')];
    const source = concatenateTranscriptSegments(local, [0]);
    expect(extractVerifiedQuote('She called it "a no-bid Harborline water contract."', source)).toBe(
      'She called it “a no-bid Harborline water contract.”',
    );
  });

  it('does not verify a fabricated quote and removes it', () => {
    const result = applyQuoteVerification(
      [
        note({
          exactQuote: 'The moon is made of cheese according to the secret Calder appendix.',
          sourceSegmentIndexes: [1],
        }),
      ],
      segments,
    );
    expect(result.notes[0].exactQuote).toBeNull();
    expect(result.notes[0].text).toContain('Westmere County Court');
    expect(result.diagnostics).toEqual({ requested: 1, verified: 0, rejected: 1 });
  });

  it('omits an oversized quote instead of truncating it', () => {
    const longQuote = `${'The Westmere Civic Board '}${'hid the Harborline numbers. '.repeat(40)}`.slice(
      0,
      CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS + 40,
    );
    const result = applyQuoteVerification(
      [note({ exactQuote: longQuote, sourceSegmentIndexes: [1] })],
      segments,
    );
    expect(longQuote.length).toBeGreaterThan(CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS);
    expect(result.notes[0].exactQuote).toBeNull();
    expect(result.diagnostics.rejected).toBe(1);
  });

  it('counts requested, verified, and rejected quotes', () => {
    const result = applyQuoteVerification(
      [
        note({
          exactQuote:
            'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
          sourceSegmentIndexes: [1],
        }),
        note({
          kind: 'claim',
          text: 'Riley Quinn says the declaration lists a $2.6 million Harborline contract.',
          attribution: 'Riley Quinn',
          exactQuote: 'This quote does not appear in the Westmere transcript at all.',
          sourceSegmentIndexes: [2],
        }),
        note({
          kind: 'context',
          text: 'Calder v. Westmere Civic Board started last fall after the rate workshop closed.',
          exactQuote: null,
          sourceSegmentIndexes: [3],
        }),
      ],
      segments,
    );
    expect(result.diagnostics).toEqual({ requested: 2, verified: 1, rejected: 1 });
    expect(result.notes[0].exactQuote).toContain('Westmere County Court');
    expect(result.notes[1].exactQuote).toBeNull();
    expect(result.notes[2].exactQuote).toBeNull();
  });
});

describe('supportQuote listen anchors', () => {
  it('derives anchorStartSeconds from the segment that contains the quote start', () => {
    const segments: CreatorTranscriptSegment[] = [
      { index: 0, startSeconds: 10, endSeconds: 20, text: 'Welcome back to the show.' },
      { index: 1, startSeconds: 754, endSeconds: 770, text: 'Professor Jiang says control is more important than dominance.' },
      { index: 2, startSeconds: 770, endSeconds: 790, text: 'That is the strategic frame for the rest of the hour.' },
    ];
    expect(
      quoteAnchorStartSeconds(
        segments,
        [0, 1, 2],
        'Professor Jiang says control is more important than dominance.',
      ),
    ).toBe(754);
  });

  it('anchors a quote that spans segments to the first matching segment', () => {
    const segments: CreatorTranscriptSegment[] = [
      { index: 0, startSeconds: 12, endSeconds: 20, text: 'The key question is not who is winning,' },
      { index: 1, startSeconds: 20, endSeconds: 28, text: 'but who is controlling the cost.' },
      { index: 2, startSeconds: 28, endSeconds: 36, text: 'That is why the bulletin matters.' },
    ];
    expect(
      quoteAnchorStartSeconds(
        segments,
        [0, 1, 2],
        'The key question is not who is winning, but who is controlling the cost.',
      ),
    ).toBe(12);
  });

  it('prints a mechanical Listen anchor in the note preview', () => {
    const preview = formatNotePreview({
      id: 'n1',
      sourceItemId: 's1',
      creatorId: 'professor-jiang',
      startSeconds: 754,
      endSeconds: 770,
      kind: 'creator_analysis',
      text: 'Jiang argues control is more important than dominance.',
      attribution: 'Professor Jiang',
      eventFeatures: null,
      sourceExcerpt: 'Professor Jiang says control is more important than dominance.',
      sourceQuote: 'Professor Jiang says control is more important than dominance.',
      exactQuote: 'Professor Jiang says control is more important than dominance.',
      sourceSegmentIndexes: [1],
      anchorStartSeconds: 754,
      verificationStatus: 'not_applicable',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp',
      createdAt: '2026-09-20T00:00:00.000Z',
    });
    expect(preview).toContain('Listen anchor: 00:12:34');
  });
});
