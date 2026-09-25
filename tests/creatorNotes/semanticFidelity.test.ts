import { describe, expect, it } from 'vitest';

import { acceptGroundedCreatorNotes } from '@/lib/creatorNotes/sourceEvidence';
import {
  applyEntailmentItem,
  assessSemanticFidelity,
  parseSemanticEntailmentContent,
  resolveStatementRole,
} from '@/lib/creatorNotes/semanticFidelity';
import type { CreatorTranscriptSegment, RawCreatorNote } from '@/lib/creatorNotes/types';

const TRUMP_EVIDENCE = 'they won against the Trump regime';
const SAILOR_EVIDENCE =
  'eight US Navy sailors assigned to the USS Abraham Lincoln Carrier Strike Group attempted suicide during deployment';
const LETTER_EVIDENCE = 'a letter from acting Navy secretary John Smith obtained by CNN';

function segment(text: string): CreatorTranscriptSegment {
  return { index: 0, startSeconds: 0, endSeconds: 20, text };
}

function note(text: string, evidence: string, overrides: Partial<RawCreatorNote> = {}): RawCreatorNote {
  return {
    kind: 'event',
    startSeconds: 0,
    endSeconds: 20,
    text,
    attribution: 'MeidasTouch',
    eventFeatures: null,
    sourceExcerpt: null,
    exactQuote: evidence,
    sourceQuote: evidence,
    sourceSegmentIndexes: [0],
    ...overrides,
  };
}

describe('semantic fidelity', () => {
  it('rejects a winner reversal', () => {
    expect(
      assessSemanticFidelity(TRUMP_EVIDENCE, 'the Trump regime won against them').failureReason,
    ).toBe('relation_reversed');
    const accepted = acceptGroundedCreatorNotes(
      [note('MeidasTouch Network reported that the Trump regime won a lawsuit against Politico, CNN, and MSNOW.', TRUMP_EVIDENCE)],
      [segment(TRUMP_EVIDENCE)],
    );
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.diagnostics.semanticRelationReversed).toBe(1);
  });

  it('rejects a subject and object swap', () => {
    const bad = 'The Abraham Lincoln Carrier Strike Group attempted a suicide deployment';
    expect(assessSemanticFidelity(SAILOR_EVIDENCE, bad).failureReason).toBe('actor_mismatch');
    const accepted = acceptGroundedCreatorNotes([note(bad, SAILOR_EVIDENCE)], [segment(SAILOR_EVIDENCE)]);
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.diagnostics.semanticActorMismatch).toBe(1);
  });

  it('rejects an obtained-by attribution swap', () => {
    const bad = 'Acting Navy secretary John Smith obtained the letter';
    expect(assessSemanticFidelity(LETTER_EVIDENCE, bad).failureReason).toBe('attribution_mismatch');
    const accepted = acceptGroundedCreatorNotes([note(bad, LETTER_EVIDENCE)], [segment(LETTER_EVIDENCE)]);
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.diagnostics.semanticAttributionMismatch).toBe(1);
  });

  it('rejects strengthened modality, questions, and belief-as-fact', () => {
    expect(assessSemanticFidelity('a tariff could raise prices', 'a tariff will raise prices').failureReason).toBe(
      'modality_strengthened',
    );
    expect(
      assessSemanticFidelity('the creator asks whether the vote happened', 'the vote happened').failureReason,
    ).toBe('modality_strengthened');
    expect(
      assessSemanticFidelity('the creator believes the vote happened', 'the vote is established fact').failureReason,
    ).toBe('modality_strengthened');
  });

  it('rejects treating a quoted speaker as the creator', () => {
    expect(
      assessSemanticFidelity('Senator Reed said the budget could pass', 'The creator said the budget could pass', {
        quotedSpeaker: 'Senator Reed',
      }).failureReason,
    ).toBe('attribution_mismatch');
  });

  it('accepts a note that preserves the evidence', () => {
    const text =
      'Eight US Navy sailors assigned to the USS Abraham Lincoln Carrier Strike Group attempted suicide during deployment.';
    expect(assessSemanticFidelity(SAILOR_EVIDENCE, text).decision).toBe('accept');
    const accepted = acceptGroundedCreatorNotes([note(text, SAILOR_EVIDENCE)], [segment(SAILOR_EVIDENCE)]);
    expect(accepted.notes).toHaveLength(1);
    expect(accepted.notes[0]?.statementRole).toBe('creator');
  });

  it('distinguishes creator, quoted, reported, and unknown statement roles from existing fields', () => {
    expect(resolveStatementRole({ kind: 'creator_analysis', attribution: 'MeidasTouch' })).toBe('creator');
    expect(resolveStatementRole({ kind: 'claim', attribution: 'MeidasTouch', quotedSpeaker: 'Senator Reed' })).toBe(
      'quoted_speaker',
    );
    expect(resolveStatementRole({ kind: 'evidence_reference', attribution: 'MeidasTouch', referencedSource: 'CNN' })).toBe(
      'reported',
    );
    expect(resolveStatementRole({ kind: 'event', attribution: 'The speaker' })).toBe('unknown');
  });

  it('does not let a high-confidence rubber stamp override a reversal', () => {
    const parsed = parseSemanticEntailmentContent(
      JSON.stringify({
        results: [{ id: '0', entailed: true, failureReason: 'other', confidence: 'high' }],
      }),
    );
    expect(
      applyEntailmentItem(TRUMP_EVIDENCE, 'the Trump regime won against them', parsed?.[0]).text,
    ).toBeNull();
    expect(
      applyEntailmentItem('a tariff could raise prices', 'a tariff could raise prices', {
        id: '0',
        entailed: true,
        failureReason: null,
        confidence: 'low',
        correctedNote: null,
      }).text,
    ).toBeNull();
  });

  it('rejects a quantity the evidence does not contain', () => {
    expect(
      assessSemanticFidelity(SAILOR_EVIDENCE, 'eighty US Navy sailors assigned to the strike group attempted suicide')
        .failureReason,
    ).toBe('quantity_mismatch');
  });
});
