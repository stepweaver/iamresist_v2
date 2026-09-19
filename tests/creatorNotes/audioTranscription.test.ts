import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LOCAL_AUDIO_TRANSCRIPT_SOURCE,
  asAudioTranscriptionResult,
  normalizeWhisperSegments,
  type AudioTranscriptionProvider,
} from '@/lib/creatorNotes/audioTranscription';
import {
  downloadPodcastAudio,
  withTemporaryAudioWorkspace,
} from '@/lib/creatorNotes/audioDownload';
import {
  audioTranscriptCacheKey,
  readAudioTranscriptCache,
  writeAudioTranscriptCache,
} from '@/lib/creatorNotes/audioTranscriptCache';
import { audioTranscodeFailedError } from '@/lib/creatorNotes/errors';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  formatTranscriptSection,
  parseCreatorNotesPodcastExtractArgs,
} from '@/lib/creatorNotes/format';
import { preparePodcastCreatorNotesTranscript } from '@/lib/creatorNotes/podcastPrepare';
import { resolvePodcastTranscript } from '@/lib/creatorNotes/podcastTranscript';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { createFasterWhisperTranscriptionProvider } from '@/lib/creatorNotes/whisperProvider';
import type { CreatorTranscriptSegment, PodcastEpisodeSource } from '@/lib/creatorNotes/types';
import { mockExtractChunk } from './helpers';

const NOW = new Date('2026-09-18T10:32:00.000Z');
const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};
const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:04.000
A federal appeals court issued a stay.
`;

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function episode(overrides: Partial<PodcastEpisodeSource> = {}): PodcastEpisodeSource {
  return {
    sourceItemId: 'guid-jiang-iran',
    creatorId: 'professor-jiang',
    creatorName: 'Professor Jiang',
    feedUrl: 'https://creator.example/jiang.xml',
    guid: 'guid-jiang-iran',
    title: 'Iran Expands Exclusion Zone?',
    episodeUrl: 'https://creator.example/episodes/iran',
    audioUrl: 'https://creator.example/audio/iran.mp3',
    publishedAt: hoursAgo(6),
    transcriptCandidates: [],
    ...overrides,
  };
}

function segments(): CreatorTranscriptSegment[] {
  return [
    { index: 0, startSeconds: 1.2, endSeconds: 4.8, text: 'Iran expands the exclusion zone.' },
    { index: 1, startSeconds: 4.8, endSeconds: 9.1, text: 'The navy issued a new warning.' },
  ];
}

function mockProvider(
  result: Partial<Awaited<ReturnType<AudioTranscriptionProvider['transcribe']>>> = {},
): AudioTranscriptionProvider & { transcribe: ReturnType<typeof vi.fn> } {
  const transcribe = vi.fn(async (input: { audioUrl: string; sourceItemId?: string }) => ({
    sourceItemId: input.sourceItemId || input.audioUrl,
    creatorId: null,
    creatorName: null,
    sourceTitle: null,
    sourceUrl: null,
    publishedAt: null,
    sourceIdentityKey: input.audioUrl,
    segments: segments(),
    audioUrl: input.audioUrl,
    transcriptSource: LOCAL_AUDIO_TRANSCRIPT_SOURCE,
    transcriptUrl: null,
    transcriptMimeType: null,
    transcriptLanguage: 'en',
    transcriptionProvider: 'faster-whisper',
    transcriptionModel: 'small',
    transcriptionVersion: 'creator-notes-whisper-v1',
    cacheHit: false,
    audioDownloadMs: 12,
    transcriptionMs: 34,
    ...result,
  }));
  return { transcribe };
}

describe('CLI --transcribe-audio flag', () => {
  it('is off by default and on when passed explicitly', () => {
    expect(parseCreatorNotesPodcastExtractArgs(['--source-item', 'abc', '--dry-run']).transcribeAudio).toBe(false);
    expect(
      parseCreatorNotesPodcastExtractArgs(['--source-item', 'abc', '--transcribe-audio', '--dry-run']).transcribeAudio,
    ).toBe(true);
  });
});

describe('publisher transcript wins over audio fallback', () => {
  it('uses podcast_namespace and does not call Whisper when a VTT exists', async () => {
    const audioTranscription = mockProvider();
    const resolved = await resolvePodcastTranscript(episode({
      transcriptCandidates: [
        {
          url: 'https://creator.example/transcripts/ep.vtt',
          mimeType: 'text/vtt',
          language: 'en',
          rel: 'captions',
          source: 'podcast_namespace',
        },
      ],
    }), {
      transcribeAudio: true,
      audioTranscription,
      adapters: [],
      get: async () => ({ ok: true, status: 200, text: SAMPLE_VTT, contentType: 'text/vtt' }),
    });
    expect(resolved.status).toBe('TRANSCRIPT_AVAILABLE');
    expect(resolved.transcript?.transcriptSource).toBe('podcast_namespace');
    expect(audioTranscription.transcribe).not.toHaveBeenCalled();
  });
});

describe('audio fallback gating', () => {
  it('uses local transcription when enabled and no publisher transcript exists', async () => {
    const audioTranscription = mockProvider();
    const resolved = await resolvePodcastTranscript(episode(), {
      transcribeAudio: true,
      audioTranscription,
      adapters: [],
    });
    expect(resolved.status).toBe('TRANSCRIPT_AVAILABLE');
    expect(resolved.transcript?.transcriptSource).toBe('local_audio_transcription');
    expect(resolved.transcript?.audioUrl).toBe('https://creator.example/audio/iran.mp3');
    expect(resolved.transcript?.transcriptionProvider).toBe('faster-whisper');
    expect(resolved.transcript?.transcriptionModel).toBe('small');
    expect(resolved.transcript?.transcriptionVersion).toBe('creator-notes-whisper-v1');
    expect(resolved.acquisition?.source).toBe('local_audio_transcription');
    expect(resolved.acquisition?.generated).toBe('yes');
    expect(resolved.acquisition?.audioUrl).toBe('https://creator.example/audio/iran.mp3');
    expect(audioTranscription.transcribe).toHaveBeenCalledTimes(1);
  });

  it('does not transcribe without --transcribe-audio', async () => {
    const audioTranscription = mockProvider();
    const resolved = await resolvePodcastTranscript(episode(), {
      transcribeAudio: false,
      audioTranscription,
      adapters: [],
    });
    expect(resolved.status).toBe('TRANSCRIPT_UNAVAILABLE');
    expect(audioTranscription.transcribe).not.toHaveBeenCalled();
  });

  it('returns TRANSCRIPT_UNAVAILABLE when enabled but no audio enclosure exists', async () => {
    const audioTranscription = mockProvider();
    const resolved = await resolvePodcastTranscript(episode({ audioUrl: null }), {
      transcribeAudio: true,
      audioTranscription,
      adapters: [],
    });
    expect(resolved.status).toBe('TRANSCRIPT_UNAVAILABLE');
    expect(audioTranscription.transcribe).not.toHaveBeenCalled();
  });
});

describe('normalized timestamps and exact text', () => {
  it('assigns stable indexes and preserves Whisper timestamps and wording', () => {
    const normalized = normalizeWhisperSegments([
      { start: 1.2, end: 4.8, text: '  Iran expands the exclusion zone.  ' },
      { startSeconds: 4.8, endSeconds: 9.1, text: 'The navy issued a new warning.' },
      { start: 9.1, end: 10, text: '   ' },
    ]);
    expect(normalized).toEqual([
      { index: 0, startSeconds: 1.2, endSeconds: 4.8, text: 'Iran expands the exclusion zone.' },
      { index: 1, startSeconds: 4.8, endSeconds: 9.1, text: 'The navy issued a new warning.' },
    ]);
  });
});

describe('transcript provenance formatting', () => {
  it('prints local_audio_transcription provider metadata and timings', () => {
    const report = formatTranscriptSection({
      source: 'local_audio_transcription',
      language: 'en',
      generated: 'yes',
      rawSegments: 2,
      normalizedSegments: 2,
      durationCoveredSeconds: 7.9,
      characters: 70,
      audioUrl: 'https://creator.example/audio/iran.mp3',
      transcriptionProvider: 'faster-whisper',
      transcriptionModel: 'small',
      transcriptionVersion: 'creator-notes-whisper-v1',
      cacheHit: false,
      timings: {
        audioDownloadMs: 1500,
        transcriptionMs: 8000,
        extractionMs: 4000,
        totalMs: 14000,
        cacheHit: false,
      },
    });
    expect(report).toContain('source: local_audio_transcription');
    expect(report).toContain('generated: yes');
    expect(report).toContain('transcription provider: faster-whisper');
    expect(report).toContain('transcription model: small');
    expect(report).toContain('transcription version: creator-notes-whisper-v1');
    expect(report).toContain('audio URL: https://creator.example/audio/iran.mp3');
    expect(report).toContain('cache: miss');
    expect(report).toContain('audio download:');
    expect(report).toContain('transcription:');
    expect(report).toContain('Atomic Notes extraction:');
    expect(report).toContain('total:');
  });
});

describe('local transcript cache', () => {
  it('keys cache by episode identity, audio URL, model, and version', () => {
    const a = audioTranscriptCacheKey({
      sourceItemId: 'guid-jiang-iran',
      audioUrl: 'https://creator.example/audio/iran.mp3',
      provider: 'faster-whisper',
      model: 'small',
      version: 'creator-notes-whisper-v1',
    });
    const b = audioTranscriptCacheKey({
      sourceItemId: 'guid-jiang-iran',
      audioUrl: 'https://creator.example/audio/iran.mp3',
      provider: 'faster-whisper',
      model: 'small',
      version: 'creator-notes-whisper-v1',
    });
    const c = audioTranscriptCacheKey({
      sourceItemId: 'guid-jiang-iran',
      audioUrl: 'https://creator.example/audio/other.mp3',
      provider: 'faster-whisper',
      model: 'small',
      version: 'creator-notes-whisper-v1',
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reuses a successful transcript on cache hit without rerunning Whisper', async () => {
    const cacheDir = tempDir('cn-cache-');
    const workRoot = tempDir('cn-work-');
    const runWhisper = vi.fn(async () => ({
      language: 'en',
      segments: [
        { start: 1.2, end: 4.8, text: 'Iran expands the exclusion zone.' },
      ],
    }));
    const download = vi.fn(async ({ destPath }: { destPath: string }) => {
      writeFileSync(destPath, 'audio-bytes');
      return { destPath, bytes: 11, contentType: 'audio/mpeg', elapsedMs: 5 };
    });
    const transcode = vi.fn(async ({ outputPath }: { outputPath: string }) => {
      writeFileSync(outputPath, 'wav-bytes');
      return { destPath: outputPath, elapsedMs: 7 };
    });
    const provider = createFasterWhisperTranscriptionProvider({
      cacheDir,
      workRoot,
      download,
      transcode,
      runWhisper,
    });
    const first = asAudioTranscriptionResult(
      await provider.transcribe({
        audioUrl: 'https://creator.example/audio/iran.mp3',
        sourceItemId: 'guid-jiang-iran',
      }),
    );
    expect(first.cacheHit).toBe(false);
    expect(runWhisper).toHaveBeenCalledTimes(1);
    const cached = await readAudioTranscriptCache({
      sourceItemId: 'guid-jiang-iran',
      audioUrl: 'https://creator.example/audio/iran.mp3',
      provider: 'faster-whisper',
      model: 'small',
      version: 'creator-notes-whisper-v1',
    }, cacheDir);
    expect(cached?.segments[0]?.text).toBe('Iran expands the exclusion zone.');

    const second = asAudioTranscriptionResult(
      await provider.transcribe({
        audioUrl: 'https://creator.example/audio/iran.mp3',
        sourceItemId: 'guid-jiang-iran',
      }),
    );
    expect(second.cacheHit).toBe(true);
    expect(runWhisper).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(second.segments[0]?.text).toBe('Iran expands the exclusion zone.');
  });

  it('treats a missing cache file as a miss', async () => {
    const cacheDir = tempDir('cn-cache-miss-');
    const missed = await readAudioTranscriptCache({
      sourceItemId: 'missing',
      audioUrl: 'https://creator.example/audio/missing.mp3',
      provider: 'faster-whisper',
      model: 'small',
      version: 'creator-notes-whisper-v1',
    }, cacheDir);
    expect(missed).toBeNull();
  });
});

describe('audio download and transcription failures', () => {
  it('maps a failed download to AUDIO_DOWNLOAD_FAILED', async () => {
    const dest = path.join(tempDir('cn-dl-'), 'ep.mp3');
    await expect(
      downloadPodcastAudio({
        audioUrl: 'https://creator.example/audio/iran.mp3',
        destPath: dest,
        fetchImpl: async () => {
          throw new Error('ECONNRESET');
        },
      }),
    ).rejects.toMatchObject({ status: 'AUDIO_DOWNLOAD_FAILED' });
  });

  it('maps an oversized enclosure to AUDIO_TOO_LARGE', async () => {
    const dest = path.join(tempDir('cn-big-'), 'ep.mp3');
    await expect(
      downloadPodcastAudio({
        audioUrl: 'https://creator.example/audio/iran.mp3',
        destPath: dest,
        maxBytes: 10,
        fetchImpl: async () =>
          new Response('not-that-big-but-header-says-so', {
            status: 200,
            headers: { 'content-type': 'audio/mpeg', 'content-length': '999999' },
          }),
      }),
    ).rejects.toMatchObject({ status: 'AUDIO_TOO_LARGE' });
  });

  it('maps transcode failure to AUDIO_TRANSCODE_FAILED', async () => {
    const audioTranscription = mockProvider();
    audioTranscription.transcribe.mockRejectedValueOnce(audioTranscodeFailedError('ffmpeg exited 1'));
    const resolved = await resolvePodcastTranscript(episode(), {
      transcribeAudio: true,
      audioTranscription,
      adapters: [],
    });
    expect(resolved.status).toBe('AUDIO_TRANSCODE_FAILED');
    expect(resolved.status).not.toBe('TRANSCRIPT_UNAVAILABLE');
  });

  it('maps Whisper failure to TRANSCRIPTION_FAILED without collapsing to UNAVAILABLE', async () => {
    const audioTranscription = mockProvider();
    audioTranscription.transcribe.mockRejectedValueOnce(new Error('whisper crashed'));
    const resolved = await resolvePodcastTranscript(episode(), {
      transcribeAudio: true,
      audioTranscription,
      adapters: [],
    });
    expect(resolved.status).toBe('TRANSCRIPTION_FAILED');
    expect(resolved.status).not.toBe('TRANSCRIPT_UNAVAILABLE');
  });

  it('maps empty Whisper output to TRANSCRIPTION_EMPTY', async () => {
    const audioTranscription = mockProvider({ segments: [] });
    const resolved = await resolvePodcastTranscript(episode(), {
      transcribeAudio: true,
      audioTranscription,
      adapters: [],
    });
    expect(resolved.status).toBe('TRANSCRIPTION_EMPTY');
  });
});

describe('temporary file cleanup', () => {
  it('removes the work directory after success', async () => {
    const workRoot = tempDir('cn-clean-');
    await withTemporaryAudioWorkspace(async ({ workDir }) => {
      writeFileSync(path.join(workDir, 'source.mp3'), 'audio');
      expect(existsSync(workDir)).toBe(true);
      return 'ok';
    }, { tmpRoot: workRoot });
    expect(readdirSync(workRoot)).toEqual([]);
  });

  it('removes the work directory after failure', async () => {
    const workRoot = tempDir('cn-clean-fail-');
    await expect(
      withTemporaryAudioWorkspace(async ({ workDir }) => {
        writeFileSync(path.join(workDir, 'source.mp3'), 'audio');
        throw new Error('boom');
      }, { tmpRoot: workRoot }),
    ).rejects.toThrow('boom');
    expect(readdirSync(workRoot)).toEqual([]);
  });

  it('does not persist whole audio in the transcript cache', async () => {
    const cacheDir = tempDir('cn-noaudio-');
    await writeAudioTranscriptCache({
      sourceItemId: 'guid-jiang-iran',
      audioUrl: 'https://creator.example/audio/iran.mp3',
      provider: 'faster-whisper',
      model: 'small',
      version: 'creator-notes-whisper-v1',
      language: 'en',
      segments: segments(),
      createdAt: NOW.toISOString(),
    }, cacheDir);
    const files = readdirSync(cacheDir);
    expect(files).toHaveLength(1);
    const raw = readFileSync(path.join(cacheDir, files[0]), 'utf8');
    expect(raw).not.toContain('audio-bytes');
    expect(JSON.parse(raw).segments[0].text).toBe('Iran expands the exclusion zone.');
  });
});

describe('dry-run persistence isolation', () => {
  it('extracts from a local audio transcript with zero creator-notes writes', async () => {
    const store = createMemoryCreatorNotesStore();
    const prepared = await preparePodcastCreatorNotesTranscript(
      parseCreatorNotesPodcastExtractArgs([
        '--source-item',
        'guid-jiang-iran',
        '--transcribe-audio',
        '--dry-run',
      ]),
      {
        listEpisodes: async () => [episode()],
        audioTranscription: mockProvider(),
      },
    );
    expect(prepared.transcript.transcriptSource).toBe('local_audio_transcription');
    const result = await runCreatorNoteExtraction(
      { transcript: prepared.transcript, dryRun: true },
      {
        store,
        extractChunk: mockExtractChunk([
          {
            kind: 'event',
            startSeconds: 1.2,
            endSeconds: 4.8,
            text: 'Iran expands the exclusion zone after a navy warning.',
            attribution: null,
            eventFeatures: {
              actors: ['Iran'],
              action: 'expands the exclusion zone',
              object: 'exclusion zone',
              institutions: [],
              locations: [],
              referencedDocuments: [],
            },
            exactQuote: 'Iran expands the exclusion zone.',
            sourceExcerpt: null,
            sourceSegmentIndexes: [0],
          },
        ]),
        aiConfig: TEST_AI,
        id: () => 'audio-dry',
        log: () => {},
      },
    );
    expect(store.writeCount()).toBe(0);
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.notes[0]?.sourceExcerpt).toContain('Iran expands the exclusion zone.');
  });
});

describe('Theme Memory isolation for local audio transcription', () => {
  it('keeps transcription files free of Theme Memory modules', () => {
    const dir = path.join(process.cwd(), 'lib/creatorNotes');
    for (const file of [
      'audioTranscription.ts',
      'audioDownload.ts',
      'audioTranscriptCache.ts',
      'whisperProvider.ts',
    ]) {
      const src = readFileSync(path.join(dir, file), 'utf8');
      expect(src).not.toMatch(/@\/lib\/themeMemory/);
      expect(src).not.toMatch(/theme_observations/);
      expect(src).not.toMatch(/upsertThemeObservations/);
      expect(src).not.toMatch(/themeMemory\/themesDb/);
    }
  });

  it('does not import Whisper from Atomic Notes extraction', () => {
    const extract = readFileSync(path.join(process.cwd(), 'lib/creatorNotes/extract.ts'), 'utf8');
    const run = readFileSync(path.join(process.cwd(), 'lib/creatorNotes/run.ts'), 'utf8');
    expect(extract).not.toMatch(/whisper/i);
    expect(extract).not.toMatch(/audioTranscription/);
    expect(run).not.toMatch(/whisper/i);
    expect(run).not.toMatch(/audioTranscription/);
  });
});
