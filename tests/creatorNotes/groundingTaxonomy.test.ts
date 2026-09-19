import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { chunkCreatorTranscript, splitCreatorTranscriptChunk } from '@/lib/creatorNotes/chunk';
import { CREATOR_NOTE_KINDS, CREATOR_NOTES_TEXT_MAX_CHARS } from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  creatorNotesRecoveryReason,
  isCreatorNotesRecoverableInferenceError,
  isCreatorNotesTokenRepeatError,
} from '@/lib/creatorNotes/extract';
import { formatCreatorNotesReport, formatNotePreview } from '@/lib/creatorNotes/format';
import { buildCreatorNoteMessages } from '@/lib/creatorNotes/prompt';
import { dedupeRawCreatorNotes } from '@/lib/creatorNotes/postprocess';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { CREATOR_NOTES_JSON_SCHEMA } from '@/lib/creatorNotes/schema';
import {
  acceptGroundedCreatorNotes,
  compoundNoteReason,
  unsupportedNumericTokens,
} from '@/lib/creatorNotes/sourceEvidence';
import type { CreatorTranscriptInput, CreatorTranscriptSegment, RawCreatorNote } from '@/lib/creatorNotes/types';
import { parseCreatorNotesOutput, validateRawCreatorNote } from '@/lib/creatorNotes/validate';
import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { loadSyntheticTranscript } from './helpers';

const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 300000,
  retries: 0,
};

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function tokenRepeatError(): Error {
  const error = new Error('ollama_http_500:prediction aborted, token repeat limit reached');
  (error as Error & { code: string }).code = 'ollama_http_500';
  return error;
}

function genericHttp500(): Error {
  const error = new Error('ollama_http_500:internal server error');
  (error as Error & { code: string }).code = 'ollama_http_500';
  return error;
}

function timeoutError(): Error {
  const error = new Error('ollama_timeout');
  (error as Error & { code: string }).code = 'ollama_timeout';
  return error;
}

function makeSegments(count: number, charsPerSegment: number): CreatorTranscriptSegment[] {
  return Array.from({ length: count }, (_, index) => {
    const prefix = `Seg ${String(index).padStart(3, '0')} `;
    const suffix = ' Westmere.';
    const fill = Math.max(0, charsPerSegment - prefix.length - suffix.length);
    return {
      index,
      startSeconds: index * 10,
      endSeconds: index * 10 + 8,
      text: `${prefix}${'x'.repeat(fill)}${suffix}`,
    };
  });
}

function transcriptFromSegments(
  segments: CreatorTranscriptSegment[],
  sourceItemId = 'source-item-grounding',
): CreatorTranscriptInput {
  return {
    sourceItemId,
    creatorId: 'professor-jiang',
    creatorName: 'Professor Jiang',
    sourceTitle: 'Iran Expands Exclusion Zone?',
    sourceUrl: 'https://example.test/jiang',
    publishedAt: '2026-09-16T00:00:00.000Z',
    sourceIdentityKey: 'https://example.test/jiang',
    segments,
  };
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
    exactQuote: 'Westmere County Court accepted a new filing',
    sourceSegmentIndexes: [1],
    ...overrides,
  };
}

describe('Atomic Creator Notes taxonomy calibration', () => {
  it('does not default a missing kind to event', () => {
    expect(() =>
      validateRawCreatorNote({
        text: 'A federal court issued a new order in the case.',
        sourceSegmentIndexes: [1],
      }),
    ).toThrow(/kind_missing/);
    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [{ text: 'A federal court issued a new order in the case.', sourceSegmentIndexes: [1] }],
      }),
    );
    expect(parsed.notes).toHaveLength(0);
    expect(parsed.notes.some((item) => item.kind === 'event')).toBe(false);
    expect(parsed.kindDiagnostics.missingKind).toBe(1);
    expect(parsed.kindDiagnostics.coercions).toBe(0);
    expect(parsed.kindDiagnostics.validatedCounts.event).toBe(0);
  });

  it('rejects an invalid kind instead of coercing it', () => {
    expect(() =>
      validateRawCreatorNote({
        kind: 'hot_take',
        text: 'A federal court issued a new order in the case.',
        sourceSegmentIndexes: [1],
      }),
    ).toThrow(/kind_invalid/);
    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [
          {
            kind: 'hot_take',
            text: 'A federal court issued a new order in the case.',
            sourceSegmentIndexes: [1],
          },
        ],
      }),
    );
    expect(parsed.notes).toHaveLength(0);
    expect(parsed.kindDiagnostics.invalidKind).toBe(1);
    expect(parsed.kindDiagnostics.coercions).toBe(0);
    expect(parsed.kindDiagnostics.rawCounts.hot_take).toBe(1);
    expect(parsed.kindDiagnostics.validatedCounts.event).toBe(0);
  });

  it('reports raw vs validated kind diagnostics without coercions', () => {
    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [
          {
            kind: 'creator_analysis',
            text: 'Jiang argues the steelman of the official narrative still fails.',
            attribution: 'Professor Jiang',
            sourceSegmentIndexes: [1],
          },
          { kind: 'nope', text: 'this kind is not real and should be dropped entirely.' },
          {
            kind: 'why_it_matters',
            text: 'Jiang says the exclusion zone change raises the cost of a wider war.',
            attribution: 'Professor Jiang',
            sourceSegmentIndexes: [2],
          },
          {
            kind: 'claim',
            text: 'Jiang says Iran has overstated military results before.',
            attribution: 'Professor Jiang',
            sourceSegmentIndexes: [3],
          },
        ],
      }),
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(parsed.kindDiagnostics.rawCounts).toMatchObject({
      creator_analysis: 1,
      nope: 1,
      why_it_matters: 1,
      claim: 1,
    });
    expect(parsed.kindDiagnostics.validatedCounts.creator_analysis).toBe(1);
    expect(parsed.kindDiagnostics.validatedCounts.why_it_matters).toBe(1);
    expect(parsed.kindDiagnostics.validatedCounts.claim).toBe(1);
    expect(parsed.kindDiagnostics.validatedCounts.event).toBe(0);
    expect(parsed.kindDiagnostics.invalidKind).toBe(1);
    expect(parsed.kindDiagnostics.coercions).toBe(0);
    expect(parsed.notes.map((item) => item.kind)).toEqual(['creator_analysis', 'why_it_matters', 'claim']);
  });

  it('lets creator_analysis, why_it_matters, and claim survive normalization', () => {
    for (const kind of ['creator_analysis', 'why_it_matters', 'claim'] as const) {
      const parsed = validateRawCreatorNote(
        {
          kind,
          text: 'Jiang says the official narrative is a strategic performance of confidence.',
          attribution: 'Professor Jiang',
          sourceQuote: 'Now here is where the steelman breaks.',
          sourceSegmentIndexes: [4],
        },
        { knownCreatorName: 'Professor Jiang' },
      );
      expect(parsed.kind).toBe(kind);
    }
  });

  it('does not put a JSON Schema enum on kind, which would bias constrained decoding toward event', () => {
    const kindSchema = CREATOR_NOTES_JSON_SCHEMA.properties.notes.items.properties.kind as { type?: string; enum?: string[] };
    expect(kindSchema.enum).toBeUndefined();
    expect(kindSchema.type).toBe('string');
    expect(JSON.stringify(CREATOR_NOTES_JSON_SCHEMA)).not.toMatch(/"enum":\["event"/);
    expect(CREATOR_NOTE_KINDS[0]).toBe('event');
  });
});

describe('Atomic Creator Notes quote and segment alignment', () => {
  const segments: CreatorTranscriptSegment[] = [
    { index: 0, startSeconds: 10, endSeconds: 16, text: 'Pressure often perform confidence they do not feel.' },
    { index: 1, startSeconds: 16, endSeconds: 22, text: 'And Iran has overstated military results before.' },
    { index: 2, startSeconds: 22, endSeconds: 28, text: "Now here's where the steelman breaks." },
  ];

  it('verifies an exact supporting quote against the cited segments', () => {
    const accepted = acceptGroundedCreatorNotes(
      [
        note({
          kind: 'claim',
          attribution: 'Professor Jiang',
          text: 'Jiang says Iran has overstated military results before.',
          sourceQuote: 'Iran has overstated military results before.',
          exactQuote: 'Iran has overstated military results before.',
          sourceSegmentIndexes: [1],
        }),
      ],
      segments,
    );
    expect(accepted.notes).toHaveLength(1);
    expect(accepted.notes[0].sourceQuote).toBe('Iran has overstated military results before.');
    expect(accepted.notes[0].sourceExcerpt).toBe(segments[1].text);
    expect(accepted.notes[0].sourceSegmentIndexes).toEqual([1]);
  });

  it('rejects a quote that does not occur in the cited indexes', () => {
    const accepted = acceptGroundedCreatorNotes(
      [
        note({
          text: 'Jiang says Iran has overstated military results before.',
          sourceQuote: 'Iran has overstated military results before.',
          exactQuote: 'Iran has overstated military results before.',
          sourceSegmentIndexes: [2],
        }),
      ],
      segments,
    );
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.rejected).toBe(1);
    expect(accepted.diagnostics.quoteVerificationRejected).toBe(1);
  });

  it('rejects the off-by-one pattern where segment N is summarized on segment N+1', () => {
    const drifted = acceptGroundedCreatorNotes(
      [
        note({
          text: 'Jiang says Iran has overstated military results before.',
          sourceQuote: 'Iran has overstated military results before.',
          exactQuote: 'Iran has overstated military results before.',
          sourceSegmentIndexes: [2],
        }),
      ],
      segments,
    );
    expect(drifted.notes).toHaveLength(0);

    const aligned = acceptGroundedCreatorNotes(
      [
        note({
          kind: 'claim',
          attribution: 'Professor Jiang',
          text: 'Jiang says Iran has overstated military results before.',
          sourceQuote: 'And Iran has overstated military results before.',
          exactQuote: 'And Iran has overstated military results before.',
          sourceSegmentIndexes: [1],
        }),
      ],
      segments,
    );
    expect(aligned.notes).toHaveLength(1);
    expect(aligned.notes[0].sourceSegmentIndexes).toEqual([1]);
    expect(aligned.notes[0].sourceExcerpt).toBe(segments[1].text);
    expect(aligned.notes[0].sourceQuote).toContain('Iran has overstated military results before.');
    const preview = formatNotePreview({
      id: 'n1',
      sourceItemId: 's1',
      creatorId: 'professor-jiang',
      startSeconds: aligned.notes[0].startSeconds,
      endSeconds: aligned.notes[0].endSeconds,
      kind: aligned.notes[0].kind,
      text: aligned.notes[0].text,
      attribution: 'Professor Jiang',
      eventFeatures: null,
      sourceExcerpt: aligned.notes[0].sourceExcerpt,
      sourceQuote: aligned.notes[0].sourceQuote,
      exactQuote: aligned.notes[0].exactQuote,
      sourceSegmentIndexes: aligned.notes[0].sourceSegmentIndexes,
      evidenceDurationSeconds: aligned.notes[0].evidenceDurationSeconds,
      verificationStatus: 'unverified',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp',
      createdAt: '2026-09-19T00:00:00.000Z',
    });
    expect(preview).toContain(segments[1].text);
    expect(preview).toContain('Iran has overstated military results before.');
    expect(preview).toContain('Source segments: 1');
    expect(preview).not.toContain(segments[2].text);
  });
});

describe('Atomic Creator Notes semantic grounding', () => {
  it('rejects a note that introduces an unsupported number', () => {
    const segments: CreatorTranscriptSegment[] = [
      { index: 0, startSeconds: 0, endSeconds: 8, text: 'Iran expands the exclusion zone after a navy warning.' },
    ];
    const accepted = acceptGroundedCreatorNotes(
      [
        note({
          text: 'Iran fired 200 missiles with an 80% interception rate at a cost of $50 million.',
          sourceQuote: 'Iran expands the exclusion zone after a navy warning.',
          exactQuote: 'Iran expands the exclusion zone after a navy warning.',
          sourceSegmentIndexes: [0],
        }),
      ],
      segments,
    );
    expect(unsupportedNumericTokens(
      'Iran fired 200 missiles with an 80% interception rate at a cost of $50 million.',
      segments[0].text,
    ).length).toBeGreaterThan(0);
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.diagnostics.unsupportedNumberRejected).toBe(1);
  });

  it('rejects an oversized compound note', () => {
    const text =
      'Iran fired 200 missiles. Interception was 80 percent. The strike cost 50 million dollars. Aircraft were damaged at a second base.';
    expect(compoundNoteReason(text)).toBe('text_not_atomic');
    expect(text.length).toBeLessThanOrEqual(CREATOR_NOTES_TEXT_MAX_CHARS);
    const segments: CreatorTranscriptSegment[] = [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: 6,
        text: 'Iran fired 200 missiles with 80 percent intercepted, costing 50 million dollars, and aircraft were damaged at a second base.',
      },
    ];
    const accepted = acceptGroundedCreatorNotes(
      [
        note({
          text,
          sourceQuote: 'Iran fired 200 missiles',
          exactQuote: 'Iran fired 200 missiles',
          sourceSegmentIndexes: [0],
        }),
      ],
      segments,
    );
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.diagnostics.compoundRejected).toBe(1);
  });
});

describe('Atomic Creator Notes same-source dedupe', () => {
  it('removes near-duplicate notes from the same source segment', () => {
    const result = dedupeRawCreatorNotes([
      note({
        text: 'Iran has overstated military results before.',
        sourceSegmentIndexes: [553],
        startSeconds: 3200,
      }),
      note({
        text: 'Iran has overstated military results before.',
        sourceSegmentIndexes: [553],
        startSeconds: 3201,
      }),
    ]);
    expect(result.duplicatesRemoved).toBeGreaterThan(0);
    expect(result.notes).toHaveLength(1);
  });

  it('keeps distinct kinds that share evidence', () => {
    const result = dedupeRawCreatorNotes([
      note({
        kind: 'evidence_reference',
        text: 'Jiang cites the report that Iran overstated military results before.',
        sourceSegmentIndexes: [553],
      }),
      note({
        kind: 'creator_analysis',
        attribution: 'Professor Jiang',
        text: 'Jiang treats the overstated results as a reason the steelman fails.',
        sourceSegmentIndexes: [553],
      }),
    ]);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.notes).toHaveLength(2);
    expect(result.notes.map((item) => item.kind).sort()).toEqual(['creator_analysis', 'evidence_reference']);
  });
});

describe('Atomic Creator Notes recoverable inference failures', () => {
  it('classifies token-repeat Ollama failures as recoverable and generic HTTP 500 as not', () => {
    expect(isCreatorNotesTokenRepeatError(tokenRepeatError())).toBe(true);
    expect(isCreatorNotesRecoverableInferenceError(tokenRepeatError())).toBe(true);
    expect(creatorNotesRecoveryReason(tokenRepeatError())).toBe('token_repeat');
    expect(isCreatorNotesRecoverableInferenceError(timeoutError())).toBe(true);
    expect(isCreatorNotesRecoverableInferenceError(genericHttp500())).toBe(false);
    expect(creatorNotesRecoveryReason(genericHttp500())).toBeNull();
  });

  it('splits and retries once after a token-repeat failure', async () => {
    const segments = makeSegments(16, 400);
    const transcript = transcriptFromSegments(segments);
    const events: Array<{ event: string; extra?: Record<string, unknown> }> = [];
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('token-repeat'),
        log: (_prefix, event, extra) => events.push({ event, extra }),
        extractChunk: async ({ chunk }) => {
          if (chunk.charCount > 5000) throw tokenRepeatError();
          const index = chunk.segmentIndexes[0];
          return {
            notes: [
              note({
                text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
                exactQuote: `Seg ${String(index).padStart(3, '0')}`,
                sourceQuote: `Seg ${String(index).padStart(3, '0')}`,
                sourceSegmentIndexes: [index],
                startSeconds: index * 10,
                endSeconds: index * 10 + 8,
              }),
            ],
            rejected: 0,
          };
        },
      },
    );
    expect(events.some((row) => row.event === 'recoverable failure' && row.extra?.reason === 'token_repeat')).toBe(true);
    expect(events.some((row) => row.event === 'chunk split' && row.extra?.splitReason === 'token_repeat')).toBe(true);
    expect(result.ai.failedChunks).toBe(0);
    expect(result.persistence.status).toBe('success');
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('does not retry token-repeat child chunks a second time', async () => {
    const segments = makeSegments(16, 400);
    const transcript = transcriptFromSegments(segments);
    const events: string[] = [];
    let calls = 0;
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('token-repeat-once'),
        log: (_prefix, event) => events.push(event),
        extractChunk: async () => {
          calls += 1;
          throw tokenRepeatError();
        },
      },
    );
    expect(events).toContain('recoverable failure');
    expect(events).toContain('chunk split');
    expect(events.filter((event) => event === 'chunk split')).toHaveLength(1);
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(1 + splitCreatorTranscriptChunk(chunkCreatorTranscript(segments)[0]).length);
    expect(result.persistence.status).toBe('failed');
    expect(result.notes).toHaveLength(0);
  });

  it('does not split on a generic HTTP 500', async () => {
    const transcript = loadSyntheticTranscript();
    const events: string[] = [];
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('http-500'),
        log: (_prefix, event) => events.push(event),
        extractChunk: async () => {
          throw genericHttp500();
        },
      },
    );
    expect(events).not.toContain('chunk split');
    expect(events).toContain('chunk failed');
    expect(result.persistence.status).toBe('failed');
  });
});

describe('Atomic Creator Notes partial persistence and isolation', () => {
  it('writes zero notes on a partial non-dry-run', async () => {
    const segments = makeSegments(80, 150);
    const transcript = transcriptFromSegments(segments);
    const store = createMemoryCreatorNotesStore();
    const insertNotes = vi.spyOn(store, 'insertNotes');
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: false },
      {
        store,
        aiConfig: TEST_AI,
        id: ids('partial-nowrite-grounding'),
        log: () => {},
        extractChunk: async ({ chunk }) => {
          if (chunk.index > 0) throw new Error('chunk boom');
          const index = chunk.segmentIndexes[0];
          return {
            notes: [
              note({
                exactQuote: `Seg ${String(index).padStart(3, '0')}`,
                sourceQuote: `Seg ${String(index).padStart(3, '0')}`,
                sourceSegmentIndexes: [index],
                startSeconds: index * 10,
                endSeconds: index * 10 + 8,
              }),
            ],
            rejected: 0,
          };
        },
      },
    );
    expect(result.persistence.status).toBe('partial');
    expect(result.notes.length).toBeGreaterThan(0);
    expect(insertNotes).not.toHaveBeenCalled();
    expect(result.persistence.notesWritten).toBe(0);
    expect(store.notes).toHaveLength(0);
  });

  it('keeps Theme Memory isolation for grounding files', () => {
    expect('CREATOR_NOTES_AI_TIMEOUT_MS' in themeMemoryEnv).toBe(false);
    const dir = join(process.cwd(), 'lib/creatorNotes');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      if (file === 'extract.ts' || file === 'validate.ts') continue;
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src).not.toMatch(/themeMemory\/themesDb/);
      expect(src).not.toMatch(/theme_memberships/);
      expect(src).not.toMatch(/processThemeMemory/);
    }
  });

  it('puts sourceQuote and atomic-note rules in the prompt', () => {
    const transcript = loadSyntheticTranscript();
    const messages = buildCreatorNoteMessages({
      transcript,
      chunk: chunkCreatorTranscript(transcript.segments)[0],
      chunkCount: 1,
    });
    expect(messages[1].content).toContain('sourceQuote is required');
    expect(messages[1].content).toContain('one primary proposition');
    expect(messages[1].content).toContain('Do not classify an interpretation as EVENT');
    const report = formatCreatorNotesReport({
      source: {
        sourceItemId: 's',
        creatorId: null,
        creatorName: 'Professor Jiang',
        title: 't',
        url: null,
        transcriptSegments: 1,
        transcriptChars: 10,
        transcriptHash: 'h',
      },
      ai: {
        provider: 'test',
        model: 'test',
        extractionVersion: 'creator-notes-v1.4',
        chunks: 1,
        successfulChunks: 1,
        failedChunks: 0,
      },
      notes: [],
      kindCounts: {
        event: 0,
        claim: 0,
        new_development: 0,
        context: 0,
        evidence_reference: 0,
        creator_analysis: 0,
        why_it_matters: 0,
      },
      kindDiagnostics: {
        rawCounts: { event: 2 },
        validatedCounts: {
          event: 1,
          claim: 0,
          new_development: 0,
          context: 0,
          evidence_reference: 0,
          creator_analysis: 0,
          why_it_matters: 0,
        },
        missingKind: 0,
        invalidKind: 0,
        coercions: 0,
      },
      validationRejected: 0,
      duplicatesRemoved: 0,
      evidenceDiagnostics: {
        notesWithSourceEvidence: 0,
        notesWithoutSourceEvidence: 0,
        invalidSourceSegmentReferences: 0,
        exactQuotesRequested: 0,
        exactQuotesVerified: 0,
        exactQuotesRejected: 0,
        quoteVerificationRejected: 0,
        groundingRejected: 0,
        unsupportedNumberRejected: 0,
        compoundRejected: 0,
        wideEvidenceWindows: 0,
      },
      quoteDiagnostics: { requested: 0, verified: 0, rejected: 0 },
      persistence: {
        dryRun: true,
        priorEquivalentRunId: null,
        runId: null,
        notesWritten: 0,
        status: 'failed',
      },
    });
    expect(report).toContain('raw kinds:');
    expect(report).toContain('validated kinds:');
    expect(report).toContain('kind coercions: 0');
    expect(report).toContain('quote verification rejected:');
    expect(report).toContain('grounding rejected:');
  });
});
