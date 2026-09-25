import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  CREATOR_NOTES_BATCH_SCAN_FLOOR,
  CREATOR_NOTES_BATCH_SCAN_HARD_MAX,
  CREATOR_NOTES_BATCH_SCAN_MULTIPLIER,
} from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import { audioDownloadFailedError } from '@/lib/creatorNotes/errors';
import { formatCreatorNotesPodcastBatchReport, parseCreatorNotesBatchArgs } from '@/lib/creatorNotes/format';
import { runCreatorNotesPodcastBatch, type CreatorNotesPodcastBatchDeps } from '@/lib/creatorNotes/podcastBatch';
import { acquireCreatorNotesRunLock } from '@/lib/creatorNotes/runLock';
import { defaultCreatorNotesBatchScanLimit } from '@/lib/creatorNotes/select';
import type { CreatorNotesBatchArgs, PodcastEpisodeSource } from '@/lib/creatorNotes/types';
import { mockExtractChunk } from './helpers';

const FIXTURE_VTT = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'podcast', 'sample.vtt'),
  'utf8',
);
const NOW = new Date('2026-09-18T10:32:00.000Z');
const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function episode(overrides: Partial<PodcastEpisodeSource> = {}): PodcastEpisodeSource {
  const id = overrides.sourceItemId || overrides.guid || 'episode';
  return {
    sourceItemId: id,
    creatorId: 'brennan-center',
    creatorName: 'The Briefing',
    feedUrl: 'https://creator.example/feed.xml',
    guid: id,
    title: 'Episode',
    episodeUrl: `https://creator.example/episodes/${id}`,
    audioUrl: null,
    publishedAt: hoursAgo(2),
    transcriptCandidates: [],
    ...overrides,
  };
}

function unavailable(id: string, hours: number): PodcastEpisodeSource {
  return episode({
    sourceItemId: id,
    guid: id,
    title: id,
    publishedAt: hoursAgo(hours),
    audioUrl: null,
    transcriptCandidates: [],
  });
}

function processable(id: string, hours: number): PodcastEpisodeSource {
  return episode({
    sourceItemId: id,
    guid: id,
    title: id,
    publishedAt: hoursAgo(hours),
    audioUrl: `https://creator.example/audio/${id}.mp3`,
    transcriptCandidates: [
      {
        url: `https://creator.example/transcripts/${id}.vtt`,
        mimeType: 'text/vtt',
        language: 'en',
        rel: 'captions',
        source: 'podcast_namespace',
      },
    ],
  });
}

function args(overrides: Partial<CreatorNotesBatchArgs> = {}): CreatorNotesBatchArgs {
  return {
    limit: 1,
    dryRun: true,
    force: false,
    creator: null,
    sinceHours: 48,
    json: false,
    transcribeAudio: true,
    ...overrides,
  };
}

function deps(episodes: PodcastEpisodeSource[], extra: CreatorNotesPodcastBatchDeps = {}): CreatorNotesPodcastBatchDeps {
  return {
    adapters: [],
    extractChunk: mockExtractChunk([]),
    skipLock: true,
    skipWarmup: true,
    aiConfig: TEST_AI,
    now: () => NOW,
    log: () => {},
    get: async () => ({ ok: true, status: 200, text: FIXTURE_VTT, contentType: 'text/vtt' }),
    listEpisodes: async () => episodes,
    ...extra,
  };
}

describe('podcast batch scan limit', () => {
  it('defaults scan-limit to max(10, limit * 5) and clamps it', () => {
    expect(defaultCreatorNotesBatchScanLimit(1)).toBe(CREATOR_NOTES_BATCH_SCAN_FLOOR);
    expect(defaultCreatorNotesBatchScanLimit(10)).toBe(10 * CREATOR_NOTES_BATCH_SCAN_MULTIPLIER);
    expect(parseCreatorNotesBatchArgs(['--limit', '1']).scanLimit).toBe(10);
    expect(parseCreatorNotesBatchArgs(['--limit', '10']).scanLimit).toBe(50);
    expect(parseCreatorNotesBatchArgs(['--limit', '10', '--scan-limit', '12']).scanLimit).toBe(12);
    expect(parseCreatorNotesBatchArgs(['--scan-limit', '9999']).scanLimit).toBe(CREATOR_NOTES_BATCH_SCAN_HARD_MAX);
  });

  it('processes the second candidate when the newest is TRANSCRIPT_UNAVAILABLE and limit is 1', async () => {
    const extractChunk = vi.fn(mockExtractChunk([]));
    const result = await runCreatorNotesPodcastBatch(
      args({ limit: 1 }),
      deps(
        [
          unavailable('texas-red-alert', 1),
          processable('usable-second', 3),
        ],
        { extractChunk },
      ),
    );

    expect(result.items.map((item) => item.sourceItemId)).toEqual(['texas-red-alert', 'usable-second']);
    expect(result.items[0]).toMatchObject({
      outcome: 'transcript_unavailable',
      transcriptStatus: 'TRANSCRIPT_UNAVAILABLE',
    });
    expect(result.items[1]).toMatchObject({
      outcome: 'processed',
      transcriptStatus: 'TRANSCRIPT_AVAILABLE',
      transcriptSource: 'podcast_namespace',
    });
    expect(result.summary.processed).toBe(1);
    expect(result.summary.transcriptUnavailable).toBe(1);
    expect(result.summary.candidateEpisodes).toBe(2);
    expect(result.summary.scanLimitReached).toBe(false);
    expect(extractChunk).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    const report = formatCreatorNotesPodcastBatchReport(result);
    expect(report).toContain('Candidates inspected: 2');
    expect(report).toContain('Successfully processed: 1');
    expect(report).toContain('Transcript unavailable: 1');
    expect(report).toContain('Scan limit reached: no');
    expect(report).not.toContain('Candidate episodes:');
  });

  it('skips multiple unavailable candidates before a success', async () => {
    const result = await runCreatorNotesPodcastBatch(
      args({ limit: 1 }),
      deps([
        unavailable('miss-1', 1),
        unavailable('miss-2', 2),
        unavailable('miss-3', 3),
        processable('hit', 4),
        processable('later', 5),
      ]),
    );
    expect(result.items.map((item) => item.sourceItemId)).toEqual(['miss-1', 'miss-2', 'miss-3', 'hit']);
    expect(result.summary.transcriptUnavailable).toBe(3);
    expect(result.summary.processed).toBe(1);
    expect(result.summary.scanLimitReached).toBe(false);
  });

  it('continues past an already-processed candidate to the next success', async () => {
    const store = createMemoryCreatorNotesStore();
    const extractChunk = vi.fn(mockExtractChunk([]));
    const shared = deps(
      [processable('done-first', 1), processable('still-open', 4)],
      { extractChunk, store },
    );
    const first = await runCreatorNotesPodcastBatch(args({ limit: 1, dryRun: false }), shared);
    expect(first.items.map((item) => item.sourceItemId)).toEqual(['done-first']);
    expect(first.summary.processed).toBe(1);
    expect(extractChunk).toHaveBeenCalledTimes(1);

    const second = await runCreatorNotesPodcastBatch(args({ limit: 1, dryRun: false }), shared);
    expect(second.items.map((item) => item.sourceItemId)).toEqual(['done-first', 'still-open']);
    expect(second.items[0]?.outcome).toBe('already_processed');
    expect(second.items[1]?.outcome).toBe('processed');
    expect(second.summary.alreadyProcessed).toBe(1);
    expect(second.summary.processed).toBe(1);
    expect(second.summary.persistence.runsCreated).toBe(1);
    expect(store.runs.filter((run) => run.status === 'success')).toHaveLength(2);
    expect(extractChunk).toHaveBeenCalledTimes(2);
  });

  it('stops at the scan limit without walking the rest of the eligible window', async () => {
    const extractChunk = vi.fn(mockExtractChunk([]));
    const result = await runCreatorNotesPodcastBatch(
      args({ limit: 1, scanLimit: 2 }),
      deps(
        [
          unavailable('skip-a', 1),
          unavailable('skip-b', 2),
          processable('beyond-scan', 3),
          processable('also-beyond', 4),
        ],
        { extractChunk },
      ),
    );
    expect(result.items.map((item) => item.sourceItemId)).toEqual(['skip-a', 'skip-b']);
    expect(result.summary.processed).toBe(0);
    expect(result.summary.candidateEpisodes).toBe(2);
    expect(result.summary.scanLimit).toBe(2);
    expect(result.summary.scanLimitReached).toBe(true);
    expect(extractChunk).not.toHaveBeenCalled();
    expect(formatCreatorNotesPodcastBatchReport(result)).toContain('Scan limit reached: yes');
  });

  it('stops after N successful episodes', async () => {
    const extractChunk = vi.fn(mockExtractChunk([]));
    const result = await runCreatorNotesPodcastBatch(
      args({ limit: 2, scanLimit: 20 }),
      deps(
        [
          processable('one', 1),
          processable('two', 2),
          processable('three', 3),
          processable('four', 4),
        ],
        { extractChunk },
      ),
    );
    expect(result.items.map((item) => item.sourceItemId)).toEqual(['one', 'two']);
    expect(result.summary.processed).toBe(2);
    expect(result.summary.processLimit).toBe(2);
    expect(result.summary.scanLimitReached).toBe(false);
    expect(extractChunk).toHaveBeenCalledTimes(2);
  });

  it('continues after one transcription failure to a later success', async () => {
    const transcribe = vi.fn(async () => {
      throw audioDownloadFailedError('ECONNRESET');
    });
    const extractChunk = vi.fn(mockExtractChunk([]));
    const result = await runCreatorNotesPodcastBatch(
      args({ limit: 1, transcribeAudio: true }),
      deps(
        [
          episode({
            sourceItemId: 'audio-fail',
            guid: 'audio-fail',
            title: 'Audio fails',
            publishedAt: hoursAgo(1),
            audioUrl: 'https://creator.example/audio/fail.mp3',
            transcriptCandidates: [],
          }),
          processable('after-failure', 3),
        ],
        { extractChunk, audioTranscription: { transcribe } },
      ),
    );
    expect(result.items[0]).toMatchObject({
      sourceItemId: 'audio-fail',
      outcome: 'failed',
      transcriptStatus: 'AUDIO_DOWNLOAD_FAILED',
    });
    expect(result.items[1]).toMatchObject({
      sourceItemId: 'after-failure',
      outcome: 'processed',
    });
    expect(result.summary.failed).toBe(1);
    expect(result.summary.processed).toBe(1);
    expect(result.ok).toBe(true);
    expect(extractChunk).toHaveBeenCalledTimes(1);
  });

  it('keeps the run lock and does not reprocess an equivalent episode', async () => {
    const store = createMemoryCreatorNotesStore();
    const extractChunk = vi.fn(mockExtractChunk([]));
    const shared = deps([processable('only-once', 1)], { extractChunk, store });
    const first = await runCreatorNotesPodcastBatch(args({ limit: 1, dryRun: false, scanLimit: 10 }), shared);
    expect(first.summary.processed).toBe(1);
    const second = await runCreatorNotesPodcastBatch(args({ limit: 1, dryRun: false, scanLimit: 10 }), shared);
    expect(second.items[0]?.outcome).toBe('already_processed');
    expect(second.summary.persistence.runsCreated).toBe(0);
    expect(second.summary.persistence.notesWritten).toBe(0);
    expect(store.runs.filter((run) => run.status === 'success')).toHaveLength(1);
    expect(extractChunk).toHaveBeenCalledTimes(1);

    const dir = mkdtempSync(path.join(os.tmpdir(), 'creator-notes-scan-lock-'));
    const lockPath = path.join(dir, 'batch.lock');
    const held = acquireCreatorNotesRunLock(lockPath);
    const locked = await runCreatorNotesPodcastBatch(
      args({ limit: 1 }),
      deps([processable('blocked', 1)], { skipLock: false, lockPath }),
    );
    expect(locked.lockBusy).toBe(true);
    expect(locked.ok).toBe(true);
    expect(locked.overallStatus).toBe('skipped');
    expect(locked.items).toEqual([]);
    expect(formatCreatorNotesPodcastBatchReport(locked)).toMatch(/already running/i);
    held.release();
  });
});
