import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildEvidenceWindows,
  splitCreatorTranscriptChunk,
} from '@/lib/creatorNotes/chunk';
import {
  CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS,
  CREATOR_NOTES_EVIDENCE_WINDOW_MAX_SECONDS,
  CREATOR_NOTES_EVIDENCE_WINDOW_MIN_CHARS,
  CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS,
  CREATOR_NOTES_EVIDENCE_WINDOW_TARGET_SECONDS,
} from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import { formatNotePreview } from '@/lib/creatorNotes/format';
import { buildCreatorNoteMessages } from '@/lib/creatorNotes/prompt';
import { dedupeRawCreatorNotes } from '@/lib/creatorNotes/postprocess';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { CREATOR_NOTES_JSON_SCHEMA } from '@/lib/creatorNotes/schema';
import {
  acceptGroundedCreatorNotes,
  attachEvidenceWindowToNotes,
  unsupportedNumericTokens,
} from '@/lib/creatorNotes/sourceEvidence';
import type { CreatorTranscriptInput, CreatorTranscriptSegment, RawCreatorNote } from '@/lib/creatorNotes/types';
import { themeMemoryEnv } from '@/lib/env/themeMemory';

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

function timeoutError(): Error {
  const error = new Error('ollama_timeout');
  (error as Error & { code: string }).code = 'ollama_timeout';
  return error;
}

function fetchFailedError(): Error {
  const error = new Error('fetch failed');
  (error as Error & { code: string }).code = 'UND_ERR_SOCKET';
  return error;
}

function timedSegment(index: number, text: string, start: number, end: number): CreatorTranscriptSegment {
  return { index, startSeconds: start, endSeconds: end, text };
}

function transcriptFromSegments(
  segments: CreatorTranscriptSegment[],
  sourceItemId = 'source-item-windows',
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

describe('Atomic Creator Notes evidence windows', () => {
  it('builds deterministic 30-60s windows on original segment boundaries', () => {
    const segments = Array.from({ length: 20 }, (_, index) =>
      timedSegment(
        index,
        `Original segment ${index} discusses the Westmere filing without being split.`,
        index * 10,
        index * 10 + 8,
      ),
    );
    const windows = buildEvidenceWindows(segments);
    expect(windows.length).toBeGreaterThan(1);
    for (const window of windows) {
      expect(window.segments.length).toBeGreaterThan(0);
      expect(window.windowId).toBe(`w${window.index}`);
      expect(window.segmentIndexes).toEqual(window.segments.map((segment) => segment.index));
      expect(window.verbatimTranscript).toBe(window.text);
      if (window.startSeconds != null && window.endSeconds != null) {
        expect(window.endSeconds - window.startSeconds).toBeLessThanOrEqual(
          CREATOR_NOTES_EVIDENCE_WINDOW_MAX_SECONDS + 1,
        );
      }
      for (const segment of window.segments) {
        expect(segment.text).toBe(segments[segment.index].text);
        expect(segment.index).toBe(segments[segment.index].index);
      }
    }
    const first = windows[0];
    expect(first.startSeconds).toBe(0);
    expect((first.endSeconds ?? 0) - (first.startSeconds ?? 0)).toBeGreaterThanOrEqual(30);
  });

  it('keeps evidence timestamps from the window segments', () => {
    const segments = [
      timedSegment(0, 'Alpha opening about Westmere County Court.', 12, 20),
      timedSegment(1, 'Bravo filing accepted in Calder v. Westmere Civic Board.', 20, 36),
      timedSegment(2, 'Charlie declaration listed a Harborline contract.', 36, 58),
    ];
    const [window] = buildEvidenceWindows(segments);
    expect(window.startSeconds).toBe(12);
    expect(window.endSeconds).toBe(58);
    expect(window.segmentIndexes).toEqual([0, 1, 2]);
  });

  it('overlaps neighboring windows by about 10-15 seconds', () => {
    const segments = Array.from({ length: 18 }, (_, index) =>
      timedSegment(index, `Segment ${index} stays whole while windows overlap around the Westmere filing.`, index * 8, index * 8 + 7),
    );
    const windows = buildEvidenceWindows(segments);
    expect(windows.length).toBeGreaterThan(1);
    const overlap = windows[0].segmentIndexes.filter((index) => windows[1].segmentIndexes.includes(index));
    expect(overlap.length).toBeGreaterThan(0);
    const overlapStart = windows[1].startSeconds ?? 0;
    const firstEnd = windows[0].endSeconds ?? 0;
    expect(firstEnd - overlapStart).toBeGreaterThanOrEqual(CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS - 8);
    expect(firstEnd - overlapStart).toBeLessThanOrEqual(CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS + 10);
  });

  it('uses character budgets when timestamps are missing', () => {
    const segments = Array.from({ length: 12 }, (_, index) => ({
      index,
      startSeconds: null,
      endSeconds: null,
      text: `Untimed original segment ${index} ${'Westmere filing '.repeat(20).trim()}.`,
    }));
    const windows = buildEvidenceWindows(segments);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((window) => window.charCount <= CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS + 80 || window.segments.length === 1)).toBe(true);
    expect(windows[0].charCount).toBeGreaterThanOrEqual(CREATOR_NOTES_EVIDENCE_WINDOW_MIN_CHARS - 80);
  });
});

describe('Atomic Creator Notes inherited evidence coordinates', () => {
  const segments = [
    timedSegment(0, 'Welcome back to the Westmere briefing.', 0, 10),
    timedSegment(1, 'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.', 10, 28),
    timedSegment(2, 'The MARV is not a traditional ballistic trajectory.', 28, 44),
  ];

  it('does not put global sourceSegmentIndexes on the extraction schema', () => {
    const schema = JSON.stringify(CREATOR_NOTES_JSON_SCHEMA);
    expect(schema).not.toContain('sourceSegmentIndexes');
    expect(CREATOR_NOTES_JSON_SCHEMA.properties.notes.items.required).toEqual(['kind', 'text', 'sourceQuote']);
  });

  it('inherits window sourceSegmentIndexes even if the model supplies global indexes', async () => {
    const transcript = transcriptFromSegments(segments);
    const window = buildEvidenceWindows(segments)[0];
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('inherit-idx'),
        log: () => {},
        extractChunk: async ({ chunk }) => ({
          notes: [
            note({
              text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
              sourceQuote: 'Westmere County Court accepted a new filing',
              exactQuote: 'Westmere County Court accepted a new filing',
              sourceSegmentIndexes: [99],
            }),
          ],
          rejected: 0,
        }),
      },
    );
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].sourceSegmentIndexes).toEqual(window.segmentIndexes);
    expect(result.notes[0].sourceExcerpt).toContain('Westmere County Court');
    expect(result.notes[0].sourceExcerpt).toContain('The MARV is not a traditional ballistic trajectory.');
    expect(result.evidenceDiagnostics.invalidSourceSegmentReferences).toBe(0);
  });

  it('verifies supportQuote inside the evidence window, not a one-segment quote slice', () => {
    const window = buildEvidenceWindows(segments)[0];
    const attached = attachEvidenceWindowToNotes(
      [
        note({
          kind: 'creator_analysis',
          attribution: 'Professor Jiang',
          text: 'Jiang says this is a very big deal because the MARV is not a traditional ballistic trajectory.',
          sourceQuote: 'This is a very big deal.',
          exactQuote: 'This is a very big deal.',
          sourceSegmentIndexes: [99],
        }),
      ],
      window,
    );
    expect(attached[0].sourceSegmentIndexes).toEqual(window.segmentIndexes);
    const accepted = acceptGroundedCreatorNotes(attached, segments, {
      allowedSegmentIndexes: window.segmentIndexes,
    });
    expect(accepted.notes).toHaveLength(0);

    const ok = acceptGroundedCreatorNotes(
      attachEvidenceWindowToNotes(
        [
          note({
            kind: 'claim',
            attribution: 'Professor Jiang',
            text: 'Jiang says the MARV is not a traditional ballistic trajectory.',
            sourceQuote: 'The MARV is not a traditional ballistic trajectory.',
            exactQuote: 'The MARV is not a traditional ballistic trajectory.',
          }),
        ],
        window,
      ),
      segments,
      { allowedSegmentIndexes: window.segmentIndexes },
    );
    expect(ok.notes).toHaveLength(1);
    expect(ok.notes[0].sourceQuote).toBe('The MARV is not a traditional ballistic trajectory.');
    expect(ok.notes[0].sourceExcerpt).toContain('The MARV is not a traditional ballistic trajectory.');
    expect(ok.notes[0].sourceExcerpt).toContain('Westmere County Court');
    expect(ok.notes[0].sourceSegmentIndexes).toEqual(window.segmentIndexes);
  });

  it('validates numeric claims against the full evidence window, not only supportQuote', () => {
    const local = [
      timedSegment(0, 'Iran fired 200 missiles in the latest wave.', 0, 20),
      timedSegment(1, 'Jiang says this is a very big deal.', 20, 40),
    ];
    const window = buildEvidenceWindows(local)[0];
    expect(
      unsupportedNumericTokens('Jiang says Iran fired 200 missiles.', 'Jiang says this is a very big deal.'),
    ).toContain('200');
    expect(unsupportedNumericTokens('Jiang says Iran fired 200 missiles.', window.verbatimTranscript)).toEqual([]);
    const accepted = acceptGroundedCreatorNotes(
      attachEvidenceWindowToNotes(
        [
          note({
            kind: 'claim',
            attribution: 'Professor Jiang',
            text: 'Jiang says Iran fired 200 missiles.',
            sourceQuote: 'this is a very big deal',
            exactQuote: 'this is a very big deal',
          }),
        ],
        window,
      ),
      local,
      { allowedSegmentIndexes: window.segmentIndexes },
    );
    expect(accepted.notes).toHaveLength(1);
    expect(accepted.diagnostics.unsupportedNumberRejected).toBe(0);
  });

  it('keeps multiple different kinds from the same evidence window', async () => {
    const transcript = transcriptFromSegments(segments);
    const window = buildEvidenceWindows(segments)[0];
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('multi-kind'),
        log: () => {},
        extractChunk: async ({ chunk }) => {
          if (chunk.index !== 0) return { notes: [], rejected: 0 };
          return {
            notes: [
              note({
                kind: 'event',
                text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
                sourceQuote: 'Westmere County Court accepted a new filing',
                exactQuote: 'Westmere County Court accepted a new filing',
              }),
              note({
                kind: 'creator_analysis',
                attribution: 'Professor Jiang',
                text: 'Jiang says the MARV is not a traditional ballistic trajectory.',
                sourceQuote: 'The MARV is not a traditional ballistic trajectory.',
                exactQuote: 'The MARV is not a traditional ballistic trajectory.',
              }),
            ],
            rejected: 0,
          };
        },
      },
    );
    expect(result.notes).toHaveLength(2);
    expect(result.notes.map((item) => item.kind).sort()).toEqual(['creator_analysis', 'event']);
    expect(result.notes.every((item) => item.sourceSegmentIndexes.join(',') === window.segmentIndexes.join(','))).toBe(
      true,
    );
  });

  it('treats a successfully evaluated zero-note window as success', async () => {
    const transcript = transcriptFromSegments(segments);
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('zero-note'),
        log: () => {},
        extractChunk: async () => ({ notes: [], rejected: 0 }),
      },
    );
    expect(result.notes).toHaveLength(0);
    expect(result.ai.failedChunks).toBe(0);
    expect(result.ai.successfulChunks).toBe(result.ai.chunks);
    expect(result.persistence.status).toBe('success');
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesWritten).toBe(0);
  });
});

describe('Atomic Creator Notes overlap dedupe', () => {
  it('removes overlapping-window duplicates of the same kind and similar text', () => {
    const result = dedupeRawCreatorNotes([
      note({
        kind: 'claim',
        attribution: 'Professor Jiang',
        text: 'Jiang says the MARV cannot be easily tracked by existing Aegis systems.',
        sourceSegmentIndexes: [4, 5, 6],
        startSeconds: 40,
      }),
      note({
        kind: 'claim',
        attribution: 'Professor Jiang',
        text: 'Jiang says the MARV cannot be easily tracked by existing Aegis systems.',
        sourceSegmentIndexes: [6, 7, 8],
        startSeconds: 52,
      }),
    ]);
    expect(result.duplicatesRemoved).toBeGreaterThan(0);
    expect(result.notes).toHaveLength(1);
  });

  it('does not dedupe distinct kinds from the same passage', () => {
    const result = dedupeRawCreatorNotes([
      note({
        kind: 'event',
        text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
        sourceSegmentIndexes: [1, 2],
      }),
      note({
        kind: 'creator_analysis',
        attribution: 'Professor Jiang',
        text: 'Jiang treats the Westmere filing as a reason the official narrative fails.',
        sourceSegmentIndexes: [1, 2],
      }),
    ]);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.notes).toHaveLength(2);
  });
});

describe('Atomic Creator Notes transport vs inference recovery', () => {
  it('retries the same window on transport failure and does not split', async () => {
    const segments = Array.from({ length: 10 }, (_, index) =>
      timedSegment(
        index,
        `Seg ${String(index).padStart(3, '0')} Westmere filing stays inside this window.`,
        index * 10,
        index * 10 + 8,
      ),
    );
    const transcript = transcriptFromSegments(segments);
    const events: string[] = [];
    const calls: number[][] = [];
    let first = true;
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('transport-same'),
        log: (_prefix, event) => events.push(event),
        healthCheck: async () => ({ ok: true, reachable: true }),
        sleep: async () => {},
        extractChunk: async ({ chunk }) => {
          calls.push([...chunk.segmentIndexes]);
          if (first) {
            first = false;
            throw fetchFailedError();
          }
          return {
            notes: [
              note({
                exactQuote: `Seg ${String(chunk.segmentIndexes[0]).padStart(3, '0')}`,
                sourceQuote: `Seg ${String(chunk.segmentIndexes[0]).padStart(3, '0')}`,
              }),
            ],
            rejected: 0,
          };
        },
      },
    );
    expect(events).toContain('transport failure');
    expect(events).toContain('health check');
    expect(events).toContain('transport retry');
    expect(events).not.toContain('chunk split');
    expect(calls[0]).toEqual(calls[1]);
    expect(result.persistence.status).toBe('success');
  });

  it('keeps timeout/token-repeat as bounded recoverable splits', async () => {
    const segments = Array.from({ length: 12 }, (_, index) =>
      timedSegment(
        index,
        `Seg ${String(index).padStart(3, '0')} ${'Westmere filing '.repeat(12).trim()}.`,
        index * 10,
        index * 10 + 8,
      ),
    );
    const transcript = transcriptFromSegments(segments);
    const parent = buildEvidenceWindows(segments)[0];
    const events: string[] = [];
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('timeout-bounded'),
        log: (_prefix, event) => events.push(event),
        extractChunk: async ({ chunk }) => {
          if (chunk.segmentIndexes.length >= parent.segmentIndexes.length) throw timeoutError();
          return {
            notes: [
              note({
                exactQuote: `Seg ${String(chunk.segmentIndexes[0]).padStart(3, '0')}`,
                sourceQuote: `Seg ${String(chunk.segmentIndexes[0]).padStart(3, '0')}`,
              }),
            ],
            rejected: 0,
          };
        },
      },
    );
    expect(events).toContain('chunk timeout');
    expect(events).toContain('chunk split');
    expect(splitCreatorTranscriptChunk(parent).length).toBeGreaterThan(1);
    expect(result.persistence.status).toBe('success');
  });
});

describe('Atomic Creator Notes persistence and isolation', () => {
  it('keeps dry-run at zero persistence', async () => {
    const store = createMemoryCreatorNotesStore();
    const transcript = transcriptFromSegments([
      timedSegment(0, 'On March 3, 2026, Westmere County Court accepted a new filing.', 0, 20),
      timedSegment(1, 'The filing lists a Harborline water contract.', 20, 40),
    ]);
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        store,
        aiConfig: TEST_AI,
        id: ids('dry-windows'),
        log: () => {},
        extractChunk: async () => ({
          notes: [
            note({
              sourceQuote: 'Westmere County Court accepted a new filing',
              exactQuote: 'Westmere County Court accepted a new filing',
            }),
          ],
          rejected: 0,
        }),
      },
    );
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.persistence.runId).toBeNull();
    expect(store.writeCount()).toBe(0);
  });

  it('writes zero notes on a partial non-dry-run', async () => {
    const segments = Array.from({ length: 24 }, (_, index) =>
      timedSegment(
        index,
        `Seg ${String(index).padStart(3, '0')} Westmere County Court accepted a new filing.`,
        index * 10,
        index * 10 + 8,
      ),
    );
    const transcript = transcriptFromSegments(segments);
    const store = createMemoryCreatorNotesStore();
    const insertNotes = vi.spyOn(store, 'insertNotes');
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: false },
      {
        store,
        aiConfig: TEST_AI,
        id: ids('partial-windows'),
        log: () => {},
        extractChunk: async ({ chunk }) => {
          if (chunk.index > 0) throw new Error('window boom');
          return {
            notes: [
              note({
                exactQuote: `Seg ${String(chunk.segmentIndexes[0]).padStart(3, '0')}`,
                sourceQuote: `Seg ${String(chunk.segmentIndexes[0]).padStart(3, '0')}`,
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

  it('keeps Theme Memory isolation', () => {
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

  it('previews the note against the full evidence window', () => {
    const preview = formatNotePreview({
      id: 'n1',
      sourceItemId: 's1',
      creatorId: 'professor-jiang',
      startSeconds: 40,
      endSeconds: 88,
      kind: 'claim',
      text: 'Jiang says the MARV is not a traditional ballistic trajectory.',
      attribution: 'Professor Jiang',
      eventFeatures: null,
      sourceExcerpt:
        'This is a very big deal. The MARV is not a traditional ballistic trajectory, and therefore cannot be easily tracked.',
      sourceQuote: 'The MARV is not a traditional ballistic trajectory',
      exactQuote: 'The MARV is not a traditional ballistic trajectory',
      sourceSegmentIndexes: [8, 9, 10],
      evidenceDurationSeconds: 48,
      verificationStatus: 'unverified',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp',
      createdAt: '2026-09-19T00:00:00.000Z',
    });
    expect(preview).toContain('Note:');
    expect(preview).toContain('Jiang says the MARV is not a traditional ballistic trajectory.');
    expect(preview).toContain('Source quote:');
    expect(preview).toContain('Evidence:');
    expect(preview).toContain('[00:00:40–00:01:28]');
    expect(preview).toContain('This is a very big deal. The MARV is not a traditional ballistic trajectory');
    expect(preview).toContain('Source segments: 8, 9, 10');
  });

  it('asks the model to extract from one known window without global indexes', () => {
    const segments = [
      timedSegment(0, 'On March 3, 2026, Westmere County Court accepted a new filing.', 0, 20),
      timedSegment(1, 'The MARV is not a traditional ballistic trajectory.', 20, 40),
    ];
    const messages = buildCreatorNoteMessages({
      transcript: transcriptFromSegments(segments),
      chunk: buildEvidenceWindows(segments)[0],
      chunkCount: 1,
    });
    expect(messages[1].content).toContain('From ONLY the transcript below, extract zero or more notebook-worthy atomic notes.');
    expect(messages[1].content).toContain('{"notes":[]} is valid');
    expect(messages[1].content).not.toMatch(/\[SEGMENT \d+/);
    expect(CREATOR_NOTES_EVIDENCE_WINDOW_TARGET_SECONDS).toBe(45);
  });
});
