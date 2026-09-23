import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import { audioDownloadFailedError } from '@/lib/creatorNotes/errors';
import {
  formatCreatorNotesPodcastBatchReport,
  parseCreatorNotesBatchArgs,
} from '@/lib/creatorNotes/format';
import { runCreatorNotesPodcastBatch, type CreatorNotesPodcastBatchDeps } from '@/lib/creatorNotes/podcastBatch';
import { acquireCreatorNotesRunLock } from '@/lib/creatorNotes/runLock';
import type { CreatorNotesBatchArgs, CreatorTranscriptInput, PodcastEpisodeSource } from '@/lib/creatorNotes/types';
import { createFasterWhisperTranscriptionProvider } from '@/lib/creatorNotes/whisperProvider';
import { mockExtractChunk } from './helpers';

vi.mock('@/lib/creatorNotes/whisperProvider', () => ({
  createFasterWhisperTranscriptionProvider: vi.fn(),
}));

const FIXTURE_VTT = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'podcast', 'sample.vtt'),
  'utf8',
);
const NOW = new Date('2026-09-18T10:32:00.000Z');
const CANONICAL = 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.';
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
  return {
    sourceItemId: 'guid-no-transcript',
    creatorId: 'brennan-center',
    creatorName: 'The Briefing',
    feedUrl: 'https://creator.example/feed.xml',
    guid: 'guid-no-transcript',
    title: 'Episode Without Publisher Transcript',
    episodeUrl: 'https://creator.example/episodes/no-transcript',
    audioUrl: 'https://creator.example/audio/no-transcript.mp3',
    publishedAt: hoursAgo(2),
    transcriptCandidates: [],
    ...overrides,
  };
}

function batchArgs(overrides: Partial<CreatorNotesBatchArgs> = {}): CreatorNotesBatchArgs {
  return {
    limit: 10,
    dryRun: true,
    force: false,
    creator: null,
    sinceHours: 48,
    json: false,
    transcribeAudio: false,
    ...overrides,
  };
}

function localTranscript(text = CANONICAL): CreatorTranscriptInput {
  return {
    sourceItemId: 'pending',
    creatorId: null,
    creatorName: null,
    sourceTitle: null,
    sourceUrl: null,
    publishedAt: null,
    sourceIdentityKey: null,
    segments: [{ index: 0, startSeconds: 1.2, endSeconds: 4.8, text }],
    rawSegments: [{ index: 0, startSeconds: 1.2, endSeconds: 4.8, text }],
    transcriptSource: 'local_audio_transcription',
    transcriptLanguage: 'en',
    transcriptionProvider: 'faster-whisper',
    transcriptionModel: 'small',
    transcriptionVersion: 'creator-notes-whisper-v1',
  };
}

function mockProvider(text = CANONICAL) {
  const transcribe = vi.fn(async () => localTranscript(text));
  return { transcribe };
}

function batchDeps(extra: CreatorNotesPodcastBatchDeps = {}): CreatorNotesPodcastBatchDeps {
  return {
    adapters: [],
    extractChunk: mockExtractChunk([]),
    skipLock: true,
    skipWarmup: true,
    aiConfig: TEST_AI,
    now: () => NOW,
    log: () => {},
    listEpisodes: async () => [episode()],
    ...extra,
  };
}

describe('podcast batch --transcribe-audio', () => {
  beforeEach(() => {
    vi.mocked(createFasterWhisperTranscriptionProvider).mockReset();
  });

  it('parseCreatorNotesBatchArgs recognizes --transcribe-audio only when present', () => {
    expect(parseCreatorNotesBatchArgs([]).transcribeAudio).toBe(false);
    expect(parseCreatorNotesBatchArgs(['--limit', '10']).transcribeAudio).toBe(false);
    expect(parseCreatorNotesBatchArgs(['--limit', '10', '--transcribe-audio']).transcribeAudio).toBe(true);
  });

  it('keeps TRANSCRIPT_UNAVAILABLE when a publisher transcript is missing and audio transcription is off', async () => {
    const audioTranscription = mockProvider();
    const result = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: false }),
      batchDeps({ audioTranscription }),
    );
    expect(result.items[0]?.transcriptStatus).toBe('TRANSCRIPT_UNAVAILABLE');
    expect(result.items[0]?.outcome).toBe('transcript_unavailable');
    expect(audioTranscription.transcribe).not.toHaveBeenCalled();
    expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
  });

  it('calls the transcription provider when enabled and the episode has an audio enclosure', async () => {
    const audioTranscription = mockProvider();
    const result = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true }),
      batchDeps({ audioTranscription }),
    );
    expect(audioTranscription.transcribe).toHaveBeenCalledTimes(1);
    expect(audioTranscription.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ audioUrl: 'https://creator.example/audio/no-transcript.mp3' }),
    );
    expect(result.items[0]?.transcriptStatus).toBe('TRANSCRIPT_AVAILABLE');
    expect(result.items[0]?.transcriptSource).toBe('local_audio_transcription');
    expect(formatCreatorNotesPodcastBatchReport(result)).toContain('local_audio_transcription');
    expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
  });

  it('does not call the transcription provider when an official transcript is available', async () => {
    const audioTranscription = mockProvider();
    const result = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true }),
      batchDeps({
        audioTranscription,
        get: async () => ({ ok: true, status: 200, text: FIXTURE_VTT, contentType: 'text/vtt' }),
        listEpisodes: async () => [
          episode({
            title: 'Episode With VTT',
            transcriptCandidates: [
              {
                url: 'https://creator.example/transcripts/ep.vtt',
                mimeType: 'text/vtt',
                language: 'en',
                rel: 'captions',
                source: 'podcast_namespace',
              },
            ],
          }),
        ],
      }),
    );
    expect(result.items[0]?.transcriptStatus).toBe('TRANSCRIPT_AVAILABLE');
    expect(result.items[0]?.transcriptSource).toBe('podcast_namespace');
    expect(audioTranscription.transcribe).not.toHaveBeenCalled();
    expect(formatCreatorNotesPodcastBatchReport(result)).toContain('podcast_namespace');
  });

  it('returns TRANSCRIPT_UNAVAILABLE when transcription is enabled but there is no audio URL', async () => {
    const audioTranscription = mockProvider();
    const result = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true }),
      batchDeps({
        audioTranscription,
        listEpisodes: async () => [episode({ audioUrl: null, title: 'No enclosure' })],
      }),
    );
    expect(result.items[0]?.transcriptStatus).toBe('TRANSCRIPT_UNAVAILABLE');
    expect(result.items[0]?.outcome).toBe('transcript_unavailable');
    expect(audioTranscription.transcribe).not.toHaveBeenCalled();
  });

  it('keeps an audio failure status and still processes the next episode', async () => {
    const audioTranscription = mockProvider();
    audioTranscription.transcribe.mockRejectedValueOnce(audioDownloadFailedError('ECONNRESET'));
    const extractChunk = vi.fn(mockExtractChunk([]));
    const result = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true }),
      batchDeps({
        audioTranscription,
        extractChunk,
        listEpisodes: async () => [
          episode({
            sourceItemId: 'fail-audio',
            guid: 'fail-audio',
            title: 'Download fails',
            publishedAt: hoursAgo(1),
            audioUrl: 'https://creator.example/audio/fail.mp3',
          }),
          episode({
            sourceItemId: 'next-audio',
            guid: 'next-audio',
            title: 'Next episode',
            publishedAt: hoursAgo(4),
            audioUrl: 'https://creator.example/audio/next.mp3',
          }),
        ],
      }),
    );
    expect(result.items.map((item) => item.sourceItemId)).toEqual(['fail-audio', 'next-audio']);
    expect(result.items[0]).toMatchObject({
      outcome: 'failed',
      transcriptStatus: 'AUDIO_DOWNLOAD_FAILED',
    });
    expect(result.items[1]).toMatchObject({
      outcome: 'processed',
      transcriptStatus: 'TRANSCRIPT_AVAILABLE',
      transcriptSource: 'local_audio_transcription',
    });
    expect(result.summary.failed).toBe(1);
    expect(result.summary.processed).toBe(1);
    expect(extractChunk).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it('sends the canonical Whisper transcript into Atomic Notes extraction', async () => {
    const audioTranscription = mockProvider(CANONICAL);
    const seen: CreatorTranscriptInput[] = [];
    const extractChunk = vi.fn(async (input: { transcript: CreatorTranscriptInput }) => {
      seen.push(input.transcript);
      return mockExtractChunk([])();
    });
    const result = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true }),
      batchDeps({
        audioTranscription,
        extractChunk,
        listEpisodes: async () => [
          episode({
            sourceItemId: 'whisper-canonical',
            guid: 'whisper-canonical',
            title: 'Local transcript episode',
          }),
        ],
      }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.transcriptSource).toBe('local_audio_transcription');
    expect(seen[0]?.segments.map((segment) => segment.text).join('\n')).toBe(CANONICAL);
    expect(seen[0]?.transcriptionProvider).toBe('faster-whisper');
    expect(result.items[0]?.transcriptSource).toBe('local_audio_transcription');
    expect(result.summary.processed).toBe(1);
  });

  it('builds one faster-whisper provider for the batch and reuses it', async () => {
    const transcribe = vi.fn(async () => localTranscript());
    vi.mocked(createFasterWhisperTranscriptionProvider).mockReturnValue({ transcribe });
    await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true }),
      batchDeps({
        listEpisodes: async () => [
          episode({
            sourceItemId: 'reuse-a',
            guid: 'reuse-a',
            publishedAt: hoursAgo(1),
            audioUrl: 'https://creator.example/audio/a.mp3',
          }),
          episode({
            sourceItemId: 'reuse-b',
            guid: 'reuse-b',
            publishedAt: hoursAgo(3),
            audioUrl: 'https://creator.example/audio/b.mp3',
          }),
        ],
      }),
    );
    expect(createFasterWhisperTranscriptionProvider).toHaveBeenCalledTimes(1);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it('skips an equivalent completed episode and keeps the batch lock', async () => {
    const store = createMemoryCreatorNotesStore();
    const audioTranscription = mockProvider();
    const extractChunk = vi.fn(mockExtractChunk([]));
    const deps = batchDeps({
      audioTranscription,
      extractChunk,
      store,
      listEpisodes: async () => [
        episode({
          sourceItemId: 'already-done',
          guid: 'already-done',
          title: 'Already processed episode',
        }),
      ],
    });
    const first = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true, dryRun: false }),
      deps,
    );
    expect(first.items[0]?.outcome).toBe('processed');
    expect(first.summary.persistence.runsCreated).toBe(1);
    expect(extractChunk).toHaveBeenCalledTimes(1);

    const second = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true, dryRun: false }),
      deps,
    );
    expect(second.items[0]?.outcome).toBe('already_processed');
    expect(second.summary.alreadyProcessed).toBe(1);
    expect(second.summary.persistence.runsCreated).toBe(0);
    expect(second.summary.persistence.notesWritten).toBe(0);
    expect(extractChunk).toHaveBeenCalledTimes(1);
    expect(store.runs.filter((run) => run.status === 'success')).toHaveLength(1);

    const dir = mkdtempSync(path.join(os.tmpdir(), 'creator-notes-podcast-lock-'));
    const lockPath = path.join(dir, 'batch.lock');
    const held = acquireCreatorNotesRunLock(lockPath);
    const locked = await runCreatorNotesPodcastBatch(
      batchArgs({ transcribeAudio: true }),
      batchDeps({ skipLock: false, lockPath, audioTranscription }),
    );
    expect(locked.lockBusy).toBe(true);
    expect(locked.ok).toBe(true);
    expect(locked.overallStatus).toBe('skipped');
    expect(locked.items).toEqual([]);
    expect(formatCreatorNotesPodcastBatchReport(locked)).toMatch(/already running/i);
    held.release();
  });
});
