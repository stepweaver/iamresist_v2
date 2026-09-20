import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildEvidenceWindows, splitCreatorTranscriptChunk } from '@/lib/creatorNotes/chunk';
import {
  CREATOR_NOTES_AI_TIMEOUT_MS_DEFAULT,
  CREATOR_NOTES_DEFAULT_MODEL,
  CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS,
  CREATOR_NOTES_EVIDENCE_WINDOW_MAX_SECONDS,
  CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS,
  creatorNotesAiTimeoutMs,
  creatorNotesModel,
} from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import { resolveCreatorNotesAiConfig } from '@/lib/creatorNotes/extract';
import { formatCreatorNotesReport, formatNotePreview } from '@/lib/creatorNotes/format';
import { buildCreatorNoteMessages } from '@/lib/creatorNotes/prompt';
import { creatorNotesRunStatus, runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { acceptGroundedCreatorNotes } from '@/lib/creatorNotes/sourceEvidence';
import type {
  CreatorTranscriptInput,
  CreatorTranscriptSegment,
  RawCreatorNote,
} from '@/lib/creatorNotes/types';
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
  sourceItemId = 'source-item-hardening',
): CreatorTranscriptInput {
  return {
    sourceItemId,
    creatorId: 'riley-quinn',
    creatorName: 'Riley Quinn',
    sourceTitle: 'Westmere filing',
    sourceUrl: 'https://example.test/westmere',
    publishedAt: '2026-09-17T00:00:00.000Z',
    sourceIdentityKey: 'https://example.test/westmere',
    segments,
  };
}

function groundedNote(index: number, overrides: Partial<RawCreatorNote> = {}): RawCreatorNote {
  const label = `Seg ${String(index).padStart(3, '0')}`;
  return {
    kind: 'event',
    startSeconds: index * 10,
    endSeconds: index * 10 + 8,
    text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
    attribution: null,
    eventFeatures: null,
    sourceExcerpt: 'MODEL PARAPHRASE THAT MUST NOT BECOME EVIDENCE',
    exactQuote: label,
    sourceSegmentIndexes: [index],
    ...overrides,
  };
}

describe('Atomic Creator Notes long-transcript hardening', () => {
  const envKeys = ['CREATOR_NOTES_AI_TIMEOUT_MS', 'CREATOR_NOTES_MODEL'] as const;
  const previousEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of envKeys) {
      if (key in previousEnv) {
        const value = previousEnv[key];
        if (value == null) delete process.env[key];
        else process.env[key] = value;
        delete previousEnv[key];
      }
    }
  });

  function setEnv(key: (typeof envKeys)[number], value: string | undefined) {
    if (!(key in previousEnv)) previousEnv[key] = process.env[key];
    if (value == null || value === '') delete process.env[key];
    else process.env[key] = value;
  }

  it('builds ~30-60s evidence windows on transcript-segment boundaries with overlap', () => {
    const segments = makeSegments(80, 150);
    const totalChars = segments.reduce((sum, segment) => sum + segment.text.length, 0);
    expect(totalChars).toBeGreaterThanOrEqual(12000);
    expect(totalChars).toBeLessThan(13000);

    const windows = buildEvidenceWindows(segments);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((window) => window.charCount <= CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS + 150)).toBe(true);
    expect(
      windows.every((window) => {
        if (window.startSeconds == null || window.endSeconds == null) return true;
        const duration = window.endSeconds - window.startSeconds;
        return duration <= CREATOR_NOTES_EVIDENCE_WINDOW_MAX_SECONDS + 1;
      }),
    ).toBe(true);

    const firstIndexes = windows[0].segments.map((segment) => segment.index);
    const overlapIndexes = windows[1].segments
      .map((segment) => segment.index)
      .filter((index) => firstIndexes.includes(index));
    expect(overlapIndexes.length).toBeGreaterThan(0);
    const overlapSeconds =
      (windows[0].endSeconds ?? 0) - (windows[1].startSeconds ?? (windows[0].endSeconds ?? 0));
    expect(overlapSeconds).toBeGreaterThanOrEqual(CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS - 8);

    for (const window of windows) {
      expect(window.windowId).toMatch(/^w\d+$/);
      expect(window.verbatimTranscript.length).toBeGreaterThan(0);
      expect(window.segmentIndexes).toEqual(window.segments.map((segment) => segment.index));
      for (const segment of window.segments) {
        expect(segment.text).toBe(segments[segment.index].text);
        expect(segment.index).toBe(segments[segment.index].index);
      }
    }
  });

  it('does not split an individual transcript segment that exceeds the target', () => {
    const huge = {
      index: 0,
      startSeconds: 0,
      endSeconds: 12,
      text: `${'Westmere filing '.repeat(600).trim()}.`,
    };
    expect(huge.text.length).toBeGreaterThan(CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS);
    const windows = buildEvidenceWindows([huge, { index: 1, startSeconds: 12, endSeconds: 20, text: 'Next original segment stays whole.' }]);
    expect(windows[0].segments).toHaveLength(1);
    expect(windows[0].segments[0].text).toBe(huge.text);
    expect(windows[1].segments[0].text).toBe('Next original segment stays whole.');
    expect(windows[1].segments.every((segment) => segment.text !== huge.text)).toBe(true);
  });

  it('uses CREATOR_NOTES_AI_TIMEOUT_MS independently of Theme Memory', () => {
    expect(CREATOR_NOTES_AI_TIMEOUT_MS_DEFAULT).toBe(300000);
    setEnv('CREATOR_NOTES_AI_TIMEOUT_MS', '');
    expect(creatorNotesAiTimeoutMs()).toBe(300000);
    expect('CREATOR_NOTES_AI_TIMEOUT_MS' in themeMemoryEnv).toBe(false);
    setEnv('CREATOR_NOTES_AI_TIMEOUT_MS', '180000');
    expect(creatorNotesAiTimeoutMs()).toBe(180000);
  });

  it('CREATOR_NOTES_MODEL overrides shared OLLAMA_MODEL', () => {
    expect('CREATOR_NOTES_MODEL' in themeMemoryEnv).toBe(false);
    expect(CREATOR_NOTES_DEFAULT_MODEL).toBe('gemma3:4b');
    setEnv('CREATOR_NOTES_MODEL', 'gemma3:4b');
    expect(creatorNotesModel('llama3:latest')).toBe('gemma3:4b');
    expect(resolveCreatorNotesAiConfig().model).toBe('gemma3:4b');
    setEnv('CREATOR_NOTES_MODEL', '');
    expect(creatorNotesModel('llama3:latest')).toBe('llama3:latest');
    expect(creatorNotesModel(null)).toBe('gemma3:4b');
    expect(creatorNotesModel('')).toBe('gemma3:4b');
  });

  it('on timeout splits the window and retries children once sequentially', async () => {
    const segments = makeSegments(16, 400);
    const transcript = transcriptFromSegments(segments);
    const parent = buildEvidenceWindows(segments)[0];
    const calls: Array<{ chars: number; repair?: boolean; indexes: number[] }> = [];
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('timeout-split'),
        log: () => {},
        extractChunk: async ({ chunk, repair }) => {
          calls.push({ chars: chunk.charCount, repair: Boolean(repair), indexes: [...chunk.segmentIndexes] });
          if (!repair && chunk.segmentIndexes.length >= parent.segmentIndexes.length) throw timeoutError();
          return { notes: [groundedNote(chunk.segmentIndexes[0])], rejected: 0 };
        },
      },
    );
    expect(calls[0]?.indexes).toEqual(parent.segmentIndexes);
    expect(calls.slice(1).some((call) => call.chars < calls[0].chars)).toBe(true);
    expect(calls.length).toBeGreaterThan(2);
    expect(result.ai.failedChunks).toBe(0);
    expect(result.persistence.status).toBe('success');
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.notes.every((note) => note.sourceSegmentIndexes.length > 0)).toBe(true);
  });

  it('does not retry timed-out child chunks a second time', async () => {
    const segments = makeSegments(16, 400);
    const transcript = transcriptFromSegments(segments);
    const events: string[] = [];
    let calls = 0;
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('timeout-once'),
        log: (_prefix, event) => events.push(event),
        extractChunk: async () => {
          calls += 1;
          throw timeoutError();
        },
      },
    );
    expect(events).toContain('chunk timeout');
    expect(events).toContain('chunk split');
    expect(events).toContain('retry child chunk started');
    expect(events).toContain('retry child chunk failed');
    expect(events.filter((event) => event === 'chunk split').length).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(1);
    const parent = buildEvidenceWindows(segments)[0];
    expect(calls).toBeLessThanOrEqual(
      buildEvidenceWindows(segments).length * (1 + splitCreatorTranscriptChunk(parent).length),
    );
    expect(result.persistence.status).toBe('failed');
    expect(result.notes).toHaveLength(0);
  });

  it('rejects missing and invalid source segment indexes instead of inventing them', () => {
    const segments = loadSyntheticTranscript().segments;
    const chunkIndexes = [1, 2, 3];
    const missing = acceptGroundedCreatorNotes([groundedNote(1, { sourceSegmentIndexes: [] })], segments, {
      allowedSegmentIndexes: chunkIndexes,
    });
    expect(missing.notes).toHaveLength(0);
    expect(missing.rejected).toBe(1);

    const invalid = acceptGroundedCreatorNotes([groundedNote(1, { sourceSegmentIndexes: [99] })], segments, {
      allowedSegmentIndexes: chunkIndexes,
    });
    expect(invalid.notes).toHaveLength(0);
    expect(invalid.rejected).toBe(1);
    expect(invalid.diagnostics.invalidSourceSegmentReferences).toBe(1);

    const outOfChunk = acceptGroundedCreatorNotes([groundedNote(1, { sourceSegmentIndexes: [6] })], segments, {
      allowedSegmentIndexes: chunkIndexes,
    });
    expect(outOfChunk.notes).toHaveLength(0);
    expect(outOfChunk.rejected).toBe(1);

    const ok = acceptGroundedCreatorNotes(
      [
        groundedNote(1, {
          sourceExcerpt: 'MODEL PARAPHRASE THAT MUST NOT BECOME EVIDENCE',
          exactQuote: segments[1].text,
        }),
      ],
      segments,
      { allowedSegmentIndexes: chunkIndexes },
    );
    expect(ok.notes).toHaveLength(1);
    expect(ok.notes[0].sourceExcerpt).toBe(segments[1].text);
    expect(ok.notes[0].sourceExcerpt).not.toBe('MODEL PARAPHRASE THAT MUST NOT BECOME EVIDENCE');
    expect(ok.notes[0].sourceSegmentIndexes).toEqual([1]);
  });

  it('inherits evidence-window indexes even when the model omits them', async () => {
    const transcript = loadSyntheticTranscript();
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('require-index'),
        log: () => {},
        extractChunk: async ({ chunk }) => ({
          notes: [
            groundedNote(chunk.segmentIndexes[0], {
              sourceSegmentIndexes: [],
              exactQuote: transcript.segments[chunk.segmentIndexes[0]].text.slice(0, 40),
            }),
          ],
          rejected: 0,
        }),
      },
    );
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.notes.every((note) => note.sourceSegmentIndexes.length > 0)).toBe(true);
    expect(result.notes[0].sourceExcerpt).toContain(transcript.segments[result.notes[0].sourceSegmentIndexes[0]].text);
    expect(result.persistence.status).toBe('success');
  });

  it('attempts grounding repair once when a window returns only ungrounded notes', async () => {
    const transcript = loadSyntheticTranscript();
    const events: string[] = [];
    let calls = 0;
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('repair'),
        log: (_prefix, event) => events.push(event),
        extractChunk: async ({ repair, chunk }) => {
          calls += 1;
          const index = chunk.segmentIndexes[0];
          if (!repair) {
            return {
              notes: [groundedNote(index, { exactQuote: 'this fabricated quote is not in the window' })],
              rejected: 0,
            };
          }
          return {
            notes: [groundedNote(index, { exactQuote: transcript.segments[index].text.slice(0, 24) })],
            rejected: 0,
          };
        },
      },
    );
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(events).toContain('chunk grounding repair started');
    expect(events).toContain('chunk grounding repair completed');
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.notes[0].sourceSegmentIndexes.length).toBeGreaterThan(0);
    expect(result.notes[0].sourceExcerpt).toContain(transcript.segments[result.notes[0].sourceSegmentIndexes[0]].text);
    expect(result.persistence.status).toBe('success');
  });

  it('does not attempt a second grounding repair', async () => {
    const transcript = loadSyntheticTranscript();
    let calls = 0;
    await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('repair-once'),
        log: () => {},
        extractChunk: async ({ chunk }) => {
          calls += 1;
          return {
            notes: [
              groundedNote(chunk.segmentIndexes[0], { exactQuote: 'this fabricated quote is not in the window' }),
            ],
            rejected: 0,
          };
        },
      },
    );
    const windows = buildEvidenceWindows(transcript.segments);
    expect(calls).toBe(windows.length * 2);
  });

  it('puts required repair instructions in the repair prompt', () => {
    const transcript = loadSyntheticTranscript();
    const messages = buildCreatorNoteMessages({
      transcript,
      chunk: buildEvidenceWindows(transcript.segments)[0],
      chunkCount: 1,
      repair: true,
    });
    expect(messages[1].content).toContain('Every note must include sourceQuote copied verbatim from this window');
    expect(messages[1].content).toContain('Do not emit a note that cannot be supported by this window');
    expect(messages[1].content).toContain('Preserve attribution');
    expect(messages[1].content).toContain('Distinguish factual statements from creator analysis');
    expect(messages[1].content).toContain('kind is required');
    expect(messages[1].content).toContain('Do not return transcript segment indexes');
  });

  it('classifies success, partial, and failed run status', () => {
    expect(creatorNotesRunStatus({ failedChunks: 0, noteCount: 6 })).toBe('success');
    expect(creatorNotesRunStatus({ failedChunks: 2, noteCount: 6 })).toBe('partial');
    expect(creatorNotesRunStatus({ failedChunks: 2, noteCount: 0 })).toBe('failed');
    expect(creatorNotesRunStatus({ failedChunks: 0, noteCount: 0 })).toBe('success');
  });

  it('logs the actual run status instead of forcing success', async () => {
    const segments = makeSegments(80, 150);
    const transcript = transcriptFromSegments(segments);
    const events: Array<{ event: string; extra?: Record<string, unknown> }> = [];
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: ids('status-log'),
        log: (_prefix, event, extra) => events.push({ event, extra }),
        extractChunk: async ({ chunk }) => {
          if (chunk.index > 0) throw new Error('chunk boom');
          return { notes: [groundedNote(chunk.segmentIndexes[0])], rejected: 0 };
        },
      },
    );
    expect(result.persistence.status).toBe('partial');
    expect(result.notes.length).toBeGreaterThan(0);
    expect(events.find((row) => row.event === 'run complete')?.extra?.status).toBe('partial');
  });

  it('does not write Atomic Notes on a non-dry-run partial extraction', async () => {
    const segments = makeSegments(80, 150);
    const transcript = transcriptFromSegments(segments);
    const store = createMemoryCreatorNotesStore();
    const insertNotes = vi.spyOn(store, 'insertNotes');
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: false },
      {
        store,
        aiConfig: TEST_AI,
        id: ids('partial-nowrite'),
        log: () => {},
        extractChunk: async ({ chunk }) => {
          if (chunk.index > 0) throw new Error('chunk boom');
          return { notes: [groundedNote(chunk.segmentIndexes[0])], rejected: 0 };
        },
      },
    );
    expect(result.persistence.status).toBe('partial');
    expect(result.notes.length).toBeGreaterThan(0);
    expect(insertNotes).not.toHaveBeenCalled();
    expect(result.persistence.notesWritten).toBe(0);
    expect(store.notes).toHaveLength(0);
    expect(store.runs[0]?.status).toBe('partial');
  });

  it('previews grounded notes with excerpt, indexes, and start/end timestamps', () => {
    const preview = formatNotePreview({
      id: 'n1',
      sourceItemId: 's1',
      creatorId: 'professor-jiang',
      startSeconds: 12,
      endSeconds: 28,
      kind: 'event',
      text: 'Iran expanded the exclusion zone after a navy warning.',
      attribution: 'Professor Jiang',
      eventFeatures: null,
      sourceExcerpt: 'Iran expands the exclusion zone after a navy warning.',
      exactQuote: 'Iran expands the exclusion zone.',
      sourceSegmentIndexes: [4, 5],
      verificationStatus: 'unverified',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp',
      createdAt: '2026-09-18T00:00:00.000Z',
    });
    expect(preview).toContain('[00:00:12–00:00:28] EVENT — Professor Jiang');
    expect(preview).toContain('Evidence:');
    expect(preview).toContain('Iran expands the exclusion zone after a navy warning.');
    expect(preview).toContain('Note:');
    expect(preview).toContain('Source segments: 4, 5');
    expect(preview).toContain('Source quote:');
    expect(preview).toContain('"Iran expands the exclusion zone."');
    expect(preview).toContain('Source segments: 4, 5');
    expect(preview).toContain('Evidence duration:');
    expect(preview).not.toContain('Evidence: (not available)');
  });

  it('keeps Theme Memory timeout semantics untouched', () => {
    expect('CREATOR_NOTES_AI_TIMEOUT_MS' in themeMemoryEnv).toBe(false);
    expect(themeMemoryEnv).toHaveProperty('THEME_AI_TIMEOUT_MS');
    setEnv('CREATOR_NOTES_AI_TIMEOUT_MS', '333000');
    expect(creatorNotesAiTimeoutMs()).toBe(333000);
    expect(themeMemoryEnv.THEME_AI_TIMEOUT_MS).not.toBe(333000);
  });
});

describe('Atomic Creator Notes dry-run isolation (hardening)', () => {
  it('still performs zero creator-note writes on a successful dry-run', async () => {
    const store = createMemoryCreatorNotesStore();
    const transcript = loadSyntheticTranscript();
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        store,
        aiConfig: TEST_AI,
        id: ids('dry-hard'),
        log: () => {},
        extractChunk: async () => ({ notes: [groundedNote(1, { exactQuote: transcript.segments[1].text })], rejected: 0 }),
      },
    );
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.persistence.runId).toBeNull();
    expect(store.writeCount()).toBe(0);
    expect(formatCreatorNotesReport(result)).toContain('notes written: 0');
  });
});
