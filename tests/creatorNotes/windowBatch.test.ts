import { describe, expect, it, vi } from 'vitest';

import { buildEvidenceWindows } from '@/lib/creatorNotes/chunk';
import { CREATOR_NOTE_EXTRACTION_VERSION } from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  createMemoryCreatorNotesExtractionCache,
  extractionCacheKey,
} from '@/lib/creatorNotes/extractionCache';
import { formatCreatorNotesReport } from '@/lib/creatorNotes/format';
import { emptyKindDiagnostics, parseCreatorNotesBatchOutput } from '@/lib/creatorNotes/validate';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { packEvidenceWindowBatches, selectEvidenceWindows } from '@/lib/creatorNotes/windowBatch';
import type {
  CreatorTranscriptChunk,
  CreatorTranscriptInput,
  RawCreatorNote,
} from '@/lib/creatorNotes/types';

const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};

function pad(text: string, size: number): string {
  if (text.length >= size) return text;
  return `${text} ${'x'.repeat(size - text.length - 1)}`;
}

function twoWindowTranscript(sourceItemId = 'guid-jiang-batch'): CreatorTranscriptInput {
  return {
    sourceItemId,
    creatorId: 'professor-jiang',
    creatorName: 'Professor Jiang',
    sourceTitle: 'Two-window calibration',
    sourceUrl: 'https://creator.example/jiang-batch',
    publishedAt: '2026-09-20T00:00:00.000Z',
    sourceIdentityKey: 'https://creator.example/jiang-batch',
    segments: [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: 40,
        text: pad('Lloyds of London published the war-risk bulletin after the zone expanded. UNIQUE_WINDOW_ZERO_TOKEN.', 900),
      },
      {
        index: 1,
        startSeconds: 50,
        endSeconds: 90,
        text: pad('The IAEA issued a new inspection notice for the enrichment site. UNIQUE_WINDOW_ONE_TOKEN.', 900),
      },
    ],
  };
}

function noteForWindow(chunk: CreatorTranscriptChunk, quote: string, text: string): RawCreatorNote {
  return {
    kind: 'evidence_reference',
    startSeconds: chunk.startSeconds,
    endSeconds: chunk.endSeconds,
    text,
    attribution: 'Professor Jiang',
    referencedSource: null,
    eventFeatures: null,
    sourceExcerpt: null,
    sourceQuote: quote,
    exactQuote: quote,
    sourceSegmentIndexes: [],
  };
}

describe('batched evidence windows', () => {
  it('packs windows without merging their identities or transcripts', () => {
    const transcript = twoWindowTranscript();
    const windows = buildEvidenceWindows(transcript.segments);
    expect(windows.length).toBeGreaterThanOrEqual(2);
    const batches = packEvidenceWindowBatches(windows, { maxWindows: 2, maxInputChars: 50_000 });
    expect(batches).toHaveLength(1);
    expect(batches[0].map((window) => window.windowId)).toEqual(windows.slice(0, 2).map((window) => window.windowId));
    expect(batches[0][0].verbatimTranscript).toBe(windows[0].verbatimTranscript);
    expect(batches[0][1].verbatimTranscript).toBe(windows[1].verbatimTranscript);
    expect(batches[0][0].segmentIndexes).not.toEqual(batches[0][1].segmentIndexes);
  });

  it('keeps returned notes bound to their windowId', async () => {
    const transcript = twoWindowTranscript();
    const windows = buildEvidenceWindows(transcript.segments);
    const extractBatch = vi.fn(async ({ windows: batch }: { windows: CreatorTranscriptChunk[] }) => ({
      windows: batch.map((chunk) => ({
        windowId: chunk.windowId,
        notes: [
          noteForWindow(
            chunk,
            chunk.verbatimTranscript.slice(0, 48),
            chunk.index === 0
              ? 'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.'
              : 'Jiang cites an IAEA inspection notice for the enrichment site.',
          ),
        ],
        rejected: 0,
        kindDiagnostics: emptyKindDiagnostics(),
      })),
    }));
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'batch-id',
        log: () => {},
        extractionCache: null,
        extractBatch,
        extractChunk: async () => ({ notes: [], rejected: 0, kindDiagnostics: emptyKindDiagnostics() }),
      },
    );
    expect(extractBatch).toHaveBeenCalled();
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0].sourceExcerpt).toContain('Lloyds of London');
    expect(result.notes[1].sourceExcerpt).toContain('IAEA');
    expect(result.notes[0].sourceSegmentIndexes).toEqual(windows[0].segmentIndexes);
    expect(result.notes[1].sourceSegmentIndexes).toEqual(windows[1].segmentIndexes);
    expect(result.performance.ollamaBatchRequests).toBeGreaterThanOrEqual(1);
  });

  it('rejects a note that cites another window’s evidence', async () => {
    const transcript = twoWindowTranscript('guid-jiang-cross-window');
    const windows = buildEvidenceWindows(transcript.segments);
    const foreignQuote = 'UNIQUE_WINDOW_ONE_TOKEN';
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'cross-window',
        log: () => {},
        extractionCache: null,
        extractBatch: async ({ windows: batch }) => ({
          windows: batch.map((chunk) => ({
            windowId: chunk.windowId,
            notes: [
              noteForWindow(
                chunk,
                foreignQuote,
                'Jiang cites an IAEA inspection notice for the enrichment site.',
              ),
            ],
            rejected: 0,
            kindDiagnostics: emptyKindDiagnostics(),
          })),
        }),
        extractChunk: async ({ chunk }) => ({
          notes: [
            noteForWindow(
              chunk,
              foreignQuote,
              'Jiang cites an IAEA inspection notice for the enrichment site.',
            ),
          ],
          rejected: 0,
          kindDiagnostics: emptyKindDiagnostics(),
        }),
      },
    );
    expect(result.notes.some((note) => note.sourceExcerpt?.includes('UNIQUE_WINDOW_ZERO_TOKEN'))).toBe(false);
    expect(result.evidenceDiagnostics.groundingRejected).toBeGreaterThan(0);
  });

  it('falls back to individual windows when a batch request fails', async () => {
    const transcript = twoWindowTranscript('guid-jiang-batch-fallback');
    const windows = buildEvidenceWindows(transcript.segments);
    const extractChunk = vi.fn(async ({ chunk }: { chunk: CreatorTranscriptChunk }) => ({
      notes: [
        noteForWindow(
          chunk,
          chunk.index === 0 ? 'UNIQUE_WINDOW_ZERO_TOKEN' : 'UNIQUE_WINDOW_ONE_TOKEN',
          chunk.index === 0
            ? 'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.'
            : 'Jiang cites an IAEA inspection notice for the enrichment site.',
        ),
      ],
      rejected: 0,
      kindDiagnostics: emptyKindDiagnostics(),
    }));
    const extractBatch = vi.fn(async () => {
      throw new Error('batch exploded');
    });
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'fallback',
        log: () => {},
        extractionCache: null,
        extractBatch,
        extractChunk,
      },
    );
    expect(extractBatch).toHaveBeenCalled();
    expect(extractChunk).toHaveBeenCalledTimes(windows.length);
    expect(result.performance.individualFallbackRequests).toBe(windows.length);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.persistence.dryRun).toBe(true);
  });
});

describe('extraction cache', () => {
  it('records a miss then a hit for unchanged windows', async () => {
    const transcript = twoWindowTranscript();
    const cache = createMemoryCreatorNotesExtractionCache();
    const extractChunk = vi.fn(async ({ chunk }: { chunk: CreatorTranscriptChunk }) => ({
      notes: [
        noteForWindow(
          chunk,
          chunk.verbatimTranscript.slice(0, 48),
          'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
        ),
      ],
      rejected: 0,
      kindDiagnostics: emptyKindDiagnostics(),
    }));
    const first = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { aiConfig: TEST_AI, id: () => 'cache-1', log: () => {}, extractChunk, extractionCache: cache },
    );
    expect(first.performance.cacheMisses).toBe(first.performance.evidenceWindowsTotal);
    expect(first.performance.cacheHits).toBe(0);
    expect(extractChunk).toHaveBeenCalledTimes(first.performance.evidenceWindowsTotal);

    extractChunk.mockClear();
    const second = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { aiConfig: TEST_AI, id: () => 'cache-2', log: () => {}, extractChunk, extractionCache: cache },
    );
    expect(second.performance.cacheHits).toBe(second.performance.evidenceWindowsTotal);
    expect(second.performance.cacheMisses).toBe(0);
    expect(extractChunk).not.toHaveBeenCalled();
  });

  it('misses when extraction version in the cache key changes', async () => {
    const transcript = twoWindowTranscript();
    const cache = createMemoryCreatorNotesExtractionCache();
    const extractChunk = vi.fn(async ({ chunk }: { chunk: CreatorTranscriptChunk }) => ({
      notes: [
        noteForWindow(
          chunk,
          chunk.verbatimTranscript.slice(0, 48),
          'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
        ),
      ],
      rejected: 0,
      kindDiagnostics: emptyKindDiagnostics(),
    }));
    await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { aiConfig: TEST_AI, id: () => 'ver-1', log: () => {}, extractChunk, extractionCache: cache },
    );
    const bumped = {
      async get(key: Parameters<typeof cache.get>[0]) {
        return cache.get({ ...key, extractionVersion: `${key.extractionVersion}-bumped` });
      },
      set: cache.set.bind(cache),
    };
    extractChunk.mockClear();
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { aiConfig: TEST_AI, id: () => 'ver-2', log: () => {}, extractChunk, extractionCache: bumped },
    );
    expect(result.performance.cacheHits).toBe(0);
    expect(result.performance.cacheMisses).toBe(result.performance.evidenceWindowsTotal);
    expect(extractChunk).toHaveBeenCalled();
    expect(
      extractionCacheKey({
        sourceItemId: 's',
        transcriptHash: 'h',
        normalizationVersion: 'transcript-norm-v1',
        windowHash: 'w',
        extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
        provider: 'test',
        model: 'test-model',
      }),
    ).not.toBe(
      extractionCacheKey({
        sourceItemId: 's',
        transcriptHash: 'h',
        normalizationVersion: 'transcript-norm-v1',
        windowHash: 'w',
        extractionVersion: `${CREATOR_NOTE_EXTRACTION_VERSION}-bumped`,
        provider: 'test',
        model: 'test-model',
      }),
    );
  });

  it('bypasses cache reads when force is set', async () => {
    const transcript = twoWindowTranscript();
    const cache = createMemoryCreatorNotesExtractionCache();
    const extractChunk = vi.fn(async ({ chunk }: { chunk: CreatorTranscriptChunk }) => ({
      notes: [
        noteForWindow(
          chunk,
          chunk.verbatimTranscript.slice(0, 48),
          'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
        ),
      ],
      rejected: 0,
      kindDiagnostics: emptyKindDiagnostics(),
    }));
    await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { aiConfig: TEST_AI, id: () => 'force-1', log: () => {}, extractChunk, extractionCache: cache },
    );
    extractChunk.mockClear();
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true, force: true },
      { aiConfig: TEST_AI, id: () => 'force-2', log: () => {}, extractChunk, extractionCache: cache },
    );
    expect(result.performance.cacheHits).toBe(0);
    expect(extractChunk).toHaveBeenCalled();
  });

  it('dry-run still writes zero DB rows with cache and batching enabled', async () => {
    const transcript = twoWindowTranscript();
    const store = createMemoryCreatorNotesStore();
    const cache = createMemoryCreatorNotesExtractionCache();
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        store,
        aiConfig: TEST_AI,
        id: () => 'dry-batch',
        log: () => {},
        extractionCache: cache,
        extractBatch: async ({ windows }) => ({
          windows: windows.map((chunk) => ({
            windowId: chunk.windowId,
            notes: [
              noteForWindow(
                chunk,
                chunk.verbatimTranscript.slice(0, 48),
                'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
              ),
            ],
            rejected: 0,
            kindDiagnostics: emptyKindDiagnostics(),
          })),
        }),
        extractChunk: async () => ({ notes: [], rejected: 0, kindDiagnostics: emptyKindDiagnostics() }),
      },
    );
    expect(store.writeCount()).toBe(0);
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.persistence.runId).toBeNull();
    const report = formatCreatorNotesReport(result);
    expect(report).toContain('notes written: 0');
    expect(report).toContain('cache hits:');
    expect(report).toContain('Ollama batch requests:');
    expect(report).toContain('batch windows submitted:');
    expect(report).toContain('individual fallback windows:');
  });
});

describe('partial batch keep, repair, and fallback', () => {
  it('keeps valid windows from a partial batch response', async () => {
    const transcript = twoWindowTranscript('guid-jiang-partial-keep');
    const windows = buildEvidenceWindows(transcript.segments);
    const extractChunk = vi.fn(async ({ chunk }: { chunk: CreatorTranscriptChunk }) => ({
      notes: [
        noteForWindow(
          chunk,
          'UNIQUE_WINDOW_ONE_TOKEN',
          'Jiang cites an IAEA inspection notice for the enrichment site.',
        ),
      ],
      rejected: 0,
      kindDiagnostics: emptyKindDiagnostics(),
    }));
    const extractBatch = vi.fn(async ({ windows: batch, repair }: { windows: CreatorTranscriptChunk[]; repair?: boolean }) => {
      if (repair) return { windows: [] };
      return {
        windows: [
          {
            windowId: batch[0].windowId,
            notes: [
              noteForWindow(
                batch[0],
                'UNIQUE_WINDOW_ZERO_TOKEN',
                'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
              ),
            ],
            rejected: 0,
            kindDiagnostics: emptyKindDiagnostics(),
          },
        ],
      };
    });
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'partial-keep',
        log: () => {},
        extractionCache: null,
        extractBatch,
        extractChunk,
      },
    );
    expect(result.notes.some((note) => note.sourceExcerpt?.includes('UNIQUE_WINDOW_ZERO_TOKEN'))).toBe(true);
    expect(extractChunk.mock.calls.every((call) => call[0].chunk.windowId !== windows[0].windowId)).toBe(true);
    expect(result.performance.batchWindowsAccepted).toBe(1);
  });

  it('repairs a missing batch window once and does not fall it back individually', async () => {
    const transcript = twoWindowTranscript('guid-jiang-repair-once');
    const extractChunk = vi.fn(async () => ({
      notes: [],
      rejected: 0,
      kindDiagnostics: emptyKindDiagnostics(),
    }));
    const extractBatch = vi.fn(async ({ windows: batch, repair }: { windows: CreatorTranscriptChunk[]; repair?: boolean }) => ({
      windows: (repair ? batch : batch.slice(0, 1)).map((chunk) => ({
        windowId: chunk.windowId,
        notes: [
          noteForWindow(
            chunk,
            chunk.index === 0 ? 'UNIQUE_WINDOW_ZERO_TOKEN' : 'UNIQUE_WINDOW_ONE_TOKEN',
            chunk.index === 0
              ? 'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.'
              : 'Jiang cites an IAEA inspection notice for the enrichment site.',
          ),
        ],
        rejected: 0,
        kindDiagnostics: emptyKindDiagnostics(),
      })),
    }));
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'repair-once',
        log: () => {},
        extractionCache: null,
        extractBatch,
        extractChunk,
      },
    );
    expect(extractBatch).toHaveBeenCalledTimes(2);
    expect(extractBatch.mock.calls[1][0].repair).toBe(true);
    expect(extractChunk).not.toHaveBeenCalled();
    expect(result.performance.batchWindowsRepaired).toBe(1);
    expect(result.performance.individualFallbackWindows).toBe(0);
    expect(result.notes.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back individually only for the window that is still missing after repair', async () => {
    const transcript = twoWindowTranscript('guid-jiang-one-fallback');
    const windows = buildEvidenceWindows(transcript.segments);
    const extractChunk = vi.fn(async ({ chunk }: { chunk: CreatorTranscriptChunk }) => ({
      notes: [
        noteForWindow(
          chunk,
          'UNIQUE_WINDOW_ONE_TOKEN',
          'Jiang cites an IAEA inspection notice for the enrichment site.',
        ),
      ],
      rejected: 0,
      kindDiagnostics: emptyKindDiagnostics(),
    }));
    const extractBatch = vi.fn(async ({ windows: batch, repair }: { windows: CreatorTranscriptChunk[]; repair?: boolean }) => {
      if (repair) return { windows: [] };
      return {
        windows: [
          {
            windowId: batch[0].windowId,
            notes: [
              noteForWindow(
                batch[0],
                'UNIQUE_WINDOW_ZERO_TOKEN',
                'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
              ),
            ],
            rejected: 0,
            kindDiagnostics: emptyKindDiagnostics(),
          },
        ],
      };
    });
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'one-fallback',
        log: () => {},
        extractionCache: null,
        extractBatch,
        extractChunk,
      },
    );
    expect(extractChunk).toHaveBeenCalledTimes(1);
    expect(extractChunk.mock.calls[0][0].chunk.windowId).toBe(windows[1].windowId);
    expect(result.performance.individualFallbackWindows).toBe(1);
    expect(result.performance.batchWindowsAccepted).toBe(1);
    expect(result.notes.some((note) => note.sourceExcerpt?.includes('UNIQUE_WINDOW_ZERO_TOKEN'))).toBe(true);
    expect(result.notes.some((note) => note.sourceExcerpt?.includes('UNIQUE_WINDOW_ONE_TOKEN'))).toBe(true);
  });

  it('caches successful windows before falling back the missing one', async () => {
    const transcript = twoWindowTranscript('guid-jiang-cache-before-fallback');
    const windows = buildEvidenceWindows(transcript.segments);
    const inner = createMemoryCreatorNotesExtractionCache();
    const order: string[] = [];
    const cache = {
      async get(key: Parameters<typeof inner.get>[0]) {
        return inner.get(key);
      },
      async set(key: Parameters<typeof inner.set>[0], value: Parameters<typeof inner.set>[1]) {
        order.push(`cache:${value.windowId}`);
        return inner.set(key, value);
      },
    };
    const extractChunk = vi.fn(async ({ chunk }: { chunk: CreatorTranscriptChunk }) => {
      order.push(`fallback:${chunk.windowId}`);
      return {
        notes: [
          noteForWindow(
            chunk,
            'UNIQUE_WINDOW_ONE_TOKEN',
            'Jiang cites an IAEA inspection notice for the enrichment site.',
          ),
        ],
        rejected: 0,
        kindDiagnostics: emptyKindDiagnostics(),
      };
    });
    await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'cache-before',
        log: () => {},
        extractionCache: cache,
        extractBatch: async ({ windows: batch, repair }) => {
          if (repair) throw new Error('repair failed');
          return {
            windows: [
              {
                windowId: batch[0].windowId,
                notes: [
                  noteForWindow(
                    batch[0],
                    'UNIQUE_WINDOW_ZERO_TOKEN',
                    'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
                  ),
                ],
                rejected: 0,
                kindDiagnostics: emptyKindDiagnostics(),
              },
            ],
          };
        },
        extractChunk,
      },
    );
    expect(order[0]).toBe(`cache:${windows[0].windowId}`);
    expect(order).toContain(`fallback:${windows[1].windowId}`);
    expect(order.indexOf(`cache:${windows[0].windowId}`)).toBeLessThan(
      order.indexOf(`fallback:${windows[1].windowId}`),
    );
    expect(order).not.toContain(`fallback:${windows[0].windowId}`);
  });

  it('reports missing and malformed window IDs separately from returned windows', () => {
    const parsed = parseCreatorNotesBatchOutput(
      JSON.stringify({
        windows: [
          {
            windowId: 'w0',
            notes: [
              {
                kind: 'claim',
                text: 'Jiang says Iran has overstated military results before.',
                attribution: 'Professor Jiang',
                sourceQuote: 'Iran has overstated military results before',
              },
            ],
          },
          { windowId: 'w2', notes: 'not-an-array' },
          { notes: [] },
        ],
      }),
      { knownCreatorName: 'Professor Jiang', expectedWindowIds: ['w0', 'w1', 'w2'] },
    );
    expect(parsed.diagnostics.submittedWindowIds).toEqual(['w0', 'w1', 'w2']);
    expect(parsed.diagnostics.returnedWindowIds).toEqual(['w0']);
    expect(parsed.diagnostics.missingWindowIds).toEqual(['w1']);
    expect(parsed.diagnostics.malformedWindowIds).toContain('w2');
    expect(parsed.windows).toHaveLength(1);
  });
});

describe('calibration window offset', () => {
  it('selects windows 6-11 for --window-offset 6 --max-windows 6', () => {
    const windows = Array.from({ length: 12 }, (_, index) => ({
      index,
      windowId: `w${index}`,
      startSeconds: index * 50,
      endSeconds: index * 50 + 40,
      segments: [],
      segmentIndexes: [index],
      text: `window ${index}`,
      verbatimTranscript: `window ${index}`,
      charCount: 10,
    }));
    const selected = selectEvidenceWindows(windows, { offset: 6, maxWindows: 6 });
    expect(selected.map((window) => window.windowId)).toEqual(['w6', 'w7', 'w8', 'w9', 'w10', 'w11']);
  });

  it('extracts only the offset window range', async () => {
    const transcript: CreatorTranscriptInput = {
      sourceItemId: 'guid-jiang-offset',
      creatorId: 'professor-jiang',
      creatorName: 'Professor Jiang',
      sourceTitle: 'Offset calibration',
      sourceUrl: 'https://creator.example/jiang-offset',
      publishedAt: '2026-09-20T00:00:00.000Z',
      sourceIdentityKey: 'https://creator.example/jiang-offset',
      segments: Array.from({ length: 12 }, (_, index) => ({
        index,
        startSeconds: index * 50,
        endSeconds: index * 50 + 40,
        text: pad(`UNIQUE_OFFSET_WINDOW_${index} token.`, 900),
      })),
    };
    const seen: string[] = [];
    await runCreatorNoteExtraction(
      { transcript, dryRun: true, windowOffset: 6, maxWindows: 6 },
      {
        aiConfig: TEST_AI,
        id: () => 'offset',
        log: () => {},
        extractionCache: null,
        extractChunk: async ({ chunk }) => {
          seen.push(chunk.windowId);
          return { notes: [], rejected: 0, kindDiagnostics: emptyKindDiagnostics() };
        },
      },
    );
    expect(seen).toEqual(['w6', 'w7', 'w8', 'w9', 'w10', 'w11']);
  });
});
