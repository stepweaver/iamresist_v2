import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { FormData as UndiciFormData, fetch as undiciFetch } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadPodcastAudio, ffmpegAudioChunkArgs, parseFfmpegDurationSeconds } from '@/lib/creatorNotes/audioDownload';
import {
  CREATOR_NOTES_GROQ_TRANSCRIPTION_MODEL_DEFAULT,
  CREATOR_NOTES_GROQ_BASE_URL,
  creatorNotesGroqTranscriptionModel,
  creatorNotesTranscriptionProvider,
} from '@/lib/creatorNotes/constants';
import { CreatorNotesTranscriptionError } from '@/lib/creatorNotes/errors';
import { formatCreatorNotesPodcastBatchReport } from '@/lib/creatorNotes/format';
import {
  GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES,
  createGroqAudioTranscriptionProvider,
  groqChunkDurationSeconds,
  groqDirectUploadCompatible,
  planGroqAudioChunks,
  segmentsFromGroqVerboseJson,
} from '@/lib/creatorNotes/groqTranscription';
import { runCreatorNotesPodcastBatch } from '@/lib/creatorNotes/podcastBatch';
import {
  createConfiguredAudioTranscriptionProvider,
  resolveCreatorNotesTranscriptionSelection,
} from '@/lib/creatorNotes/transcriptionProvider';
import type { CreatorNotesBatchArgs, CreatorTranscriptInput, PodcastEpisodeSource } from '@/lib/creatorNotes/types';
import { createFasterWhisperTranscriptionProvider } from '@/lib/creatorNotes/whisperProvider';
import { mockExtractChunk } from './helpers';

vi.mock('@/lib/creatorNotes/whisperProvider', () => ({
  createFasterWhisperTranscriptionProvider: vi.fn(() => {
    throw new Error('local whisper should not run');
  }),
}));

vi.mock('@/lib/creatorNotes/audioDownload', async () => {
  const actual = await vi.importActual<typeof import('@/lib/creatorNotes/audioDownload')>(
    '@/lib/creatorNotes/audioDownload',
  );
  return {
    ...actual,
    downloadPodcastAudio: vi.fn(async ({ destPath }: { destPath: string }) => {
      const { writeFileSync: writeFile } = await import('node:fs');
      writeFile(destPath, Buffer.alloc(64));
      return { destPath, bytes: 64, contentType: 'audio/mpeg', elapsedMs: 1 };
    }),
  };
});

const ENV_KEYS = [
  'CREATOR_NOTES_TRANSCRIPTION_PROVIDER',
  'CREATOR_NOTES_TRANSCRIPTION_MODEL',
  'CREATOR_NOTES_WHISPER_MODEL',
  'CREATOR_NOTES_TRANSCRIBE_LANGUAGE',
  'GROQ_API_KEY',
] as const;

const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
const infoLogs: string[] = [];
const NOW = new Date('2026-09-18T10:32:00.000Z');
const API_KEY = 'test-groq-key';
const CANONICAL = 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.';

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (value == null || value === '') delete process.env[key];
  else process.env[key] = value;
}

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function verboseBody(text = CANONICAL, start = 1.2, end = 4.8) {
  return {
    language: 'en',
    duration: end,
    text,
    segments: [{ id: 0, start, end, text: ` ${text}` }],
  };
}

function downloadBytes(bytes: number, contentType = 'audio/mpeg') {
  return vi.fn(async ({ destPath }: { destPath: string }) => {
    writeFileSync(destPath, Buffer.alloc(bytes));
    return { destPath, bytes, contentType, elapsedMs: 3 };
  });
}

function groqProvider(input: {
  fetchImpl: ReturnType<typeof vi.fn> | typeof undiciFetch;
  bytes?: number;
  maxUploadBytes?: number;
  cacheDir?: string;
  workRoot?: string;
  model?: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  download?: (input: { audioUrl: string; destPath: string }) => Promise<{
    destPath: string;
    bytes: number;
    contentType: string | null;
    elapsedMs: number;
  }>;
  probeDuration?: (inputPath: string) => Promise<number>;
  encodeChunk?: (chunk: {
    inputPath: string;
    outputPath: string;
    startSeconds: number;
    durationSeconds: number;
  }) => Promise<void>;
} ) {
  return createGroqAudioTranscriptionProvider({
    cacheDir: input.cacheDir || tempDir('cn-groq-cache-'),
    workRoot: input.workRoot || tempDir('cn-groq-work-'),
    model: input.model || CREATOR_NOTES_GROQ_TRANSCRIPTION_MODEL_DEFAULT,
    maxUploadBytes: input.maxUploadBytes,
    requestTimeoutMs: input.requestTimeoutMs,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl as never,
    download: input.download || downloadBytes(input.bytes ?? 128),
    probeDuration: input.probeDuration,
    encodeChunk: input.encodeChunk,
  });
}

function episode(id = 'guid-no-transcript'): PodcastEpisodeSource {
  return {
    sourceItemId: id,
    creatorId: 'brennan-center',
    creatorName: 'The Briefing',
    feedUrl: 'https://creator.example/feed.xml',
    guid: id,
    title: 'Episode Without Publisher Transcript',
    episodeUrl: `https://creator.example/episodes/${id}`,
    audioUrl: `https://creator.example/audio/${id}.mp3`,
    publishedAt: hoursAgo(2),
    transcriptCandidates: [],
  };
}

function batchArgs(transcribeAudio = true): CreatorNotesBatchArgs {
  return {
    limit: 1,
    dryRun: true,
    force: false,
    creator: null,
    sinceHours: 48,
    json: false,
    transcribeAudio,
    scanLimit: 10,
  };
}

function localTranscript(): CreatorTranscriptInput {
  return {
    sourceItemId: 'pending',
    creatorId: null,
    creatorName: null,
    sourceTitle: null,
    sourceUrl: null,
    publishedAt: null,
    sourceIdentityKey: null,
    segments: [{ index: 0, startSeconds: 1.2, endSeconds: 4.8, text: CANONICAL }],
    rawSegments: [{ index: 0, startSeconds: 1.2, endSeconds: 4.8, text: CANONICAL }],
    transcriptSource: 'local_audio_transcription',
    transcriptLanguage: 'en',
    transcriptionProvider: 'faster-whisper',
    transcriptionModel: 'small',
    transcriptionVersion: 'creator-notes-whisper-v1',
  };
}

describe('Creator Notes transcription providers', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) previousEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    infoLogs.length = 0;
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      infoLogs.push(args.map((part) => String(part)).join(' '));
    });
    vi.mocked(createFasterWhisperTranscriptionProvider).mockReset();
    vi.mocked(createFasterWhisperTranscriptionProvider).mockImplementation(() => {
      throw new Error('local whisper should not run');
    });
    vi.mocked(downloadPodcastAudio).mockClear();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previousEnv[key];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    vi.mocked(console.info).mockRestore();
  });

  it('selects groq and the configured transcription model', () => {
    setEnv('CREATOR_NOTES_TRANSCRIPTION_PROVIDER', 'Groq');
    setEnv('CREATOR_NOTES_TRANSCRIPTION_MODEL', 'whisper-large-v3');
    expect(creatorNotesTranscriptionProvider()).toBe('groq');
    expect(creatorNotesGroqTranscriptionModel()).toBe('whisper-large-v3');
    const selection = resolveCreatorNotesTranscriptionSelection();
    expect(selection).toMatchObject({
      provider: 'groq',
      implementation: 'groq',
      model: 'whisper-large-v3',
    });
    expect(JSON.stringify(selection)).not.toContain(API_KEY);
  });

  it('defaults the Groq model to whisper-large-v3-turbo', () => {
    setEnv('CREATOR_NOTES_TRANSCRIPTION_PROVIDER', 'groq');
    expect(creatorNotesGroqTranscriptionModel()).toBe(CREATOR_NOTES_GROQ_TRANSCRIPTION_MODEL_DEFAULT);
    expect(resolveCreatorNotesTranscriptionSelection().model).toBe('whisper-large-v3-turbo');
  });

  it('keeps local faster-whisper when the transcription provider is unset', () => {
    expect(creatorNotesTranscriptionProvider()).toBe('local');
    const selection = resolveCreatorNotesTranscriptionSelection();
    expect(selection).toMatchObject({
      provider: 'faster-whisper',
      implementation: 'local',
      model: 'small',
    });
  });

  it('treats whisper as an alias of the local provider and ignores the Groq model name', () => {
    setEnv('CREATOR_NOTES_TRANSCRIPTION_PROVIDER', 'whisper');
    setEnv('CREATOR_NOTES_TRANSCRIPTION_MODEL', 'whisper-large-v3-turbo');
    setEnv('CREATOR_NOTES_WHISPER_MODEL', 'medium');
    const selection = resolveCreatorNotesTranscriptionSelection();
    expect(selection.implementation).toBe('local');
    expect(selection.provider).toBe('faster-whisper');
    expect(selection.model).toBe('medium');
  });

  it('rejects an unknown provider without selecting local Whisper', () => {
    setEnv('CREATOR_NOTES_TRANSCRIPTION_PROVIDER', 'openai');
    expect(() => resolveCreatorNotesTranscriptionSelection()).toThrow(CreatorNotesTranscriptionError);
    expect(() => createConfiguredAudioTranscriptionProvider()).toThrowError(
      expect.objectContaining({ code: 'transcription_provider_unknown', provider: 'openai' }),
    );
    expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
  });

  it('rejects an explicit empty provider as not configured', () => {
    expect(() => resolveCreatorNotesTranscriptionSelection({ provider: ' ' })).toThrowError(
      expect.objectContaining({ code: 'transcription_provider_not_configured', provider: 'none' }),
    );
  });

  it('builds the local provider when local is selected', () => {
    setEnv('CREATOR_NOTES_TRANSCRIPTION_PROVIDER', 'local');
    setEnv('CREATOR_NOTES_TRANSCRIPTION_MODEL', 'whisper-large-v3-turbo');
    vi.mocked(createFasterWhisperTranscriptionProvider).mockReturnValue({ transcribe: vi.fn() });
    createConfiguredAudioTranscriptionProvider();
    expect(createFasterWhisperTranscriptionProvider).toHaveBeenCalledWith({ model: 'small' });
    expect(infoLogs.join('\n')).toContain('provider=faster-whisper model=small');
    expect(infoLogs.join('\n')).not.toContain('whisper-large-v3-turbo');
  });

  it('posts verbose_json audio to Groq and keeps segment timestamps', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const fetchImpl = vi.fn(async () => jsonResponse(verboseBody()));
    const provider = groqProvider({ fetchImpl });
    const transcript = await provider.transcribe({
      audioUrl: 'https://creator.example/audio/episode.mp3',
      sourceItemId: 'guid-episode',
    });
    expect(transcript.transcriptionProvider).toBe('groq');
    expect(transcript.transcriptionModel).toBe('whisper-large-v3-turbo');
    expect(transcript.segments[0]).toMatchObject({ startSeconds: 1.2, endSeconds: 4.8, text: CANONICAL });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers?: { Authorization?: string }; body?: UndiciFormData },
    ];
    expect(url).toBe(`${CREATOR_NOTES_GROQ_BASE_URL}/audio/transcriptions`);
    expect(init.headers?.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(Object.keys(init.headers ?? {}).map((key) => key.toLowerCase())).not.toContain('content-type');
    expect(init.body).toBeInstanceOf(UndiciFormData);
    expect(init.body instanceof globalThis.FormData).toBe(false);
    expect(init.body?.get('model')).toBe('whisper-large-v3-turbo');
    expect(init.body?.get('response_format')).toBe('verbose_json');
    expect(init.body?.get('timestamp_granularities[]')).toBe('segment');
    expect(init.body?.get('temperature')).toBe('0');
    expect(init.body?.get('language')).toBe('en');
    expect(init.body?.get('file')).toBeTruthy();
    expect(infoLogs.join('\n')).toContain('provider=groq model=whisper-large-v3-turbo');
    expect(infoLogs.join('\n')).not.toContain(API_KEY);
  });

  it('encodes the Groq upload as multipart/form-data through undici fetch', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const marker = 'groq-multipart-audio-marker';
    const captured: { contentType: string; body: string; authorization: string } = {
      contentType: '',
      body: '',
      authorization: '',
    };
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      captured.contentType = String(req.headers['content-type'] || '');
      captured.authorization = String(req.headers.authorization || '');
      captured.body = Buffer.concat(chunks).toString('latin1');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(verboseBody()));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('expected a tcp port');
    try {
      const provider = groqProvider({
        fetchImpl: undiciFetch,
        baseUrl: `http://127.0.0.1:${address.port}`,
        requestTimeoutMs: 10_000,
        download: async ({ destPath }) => {
          writeFileSync(destPath, marker);
          return { destPath, bytes: Buffer.byteLength(marker), contentType: 'audio/mpeg', elapsedMs: 1 };
        },
      });
      const transcript = await provider.transcribe({
        audioUrl: 'https://creator.example/audio/episode.mp3',
        sourceItemId: 'guid-multipart',
      });
      expect(transcript.transcriptionModel).toBe('whisper-large-v3-turbo');
      expect(captured.contentType.startsWith('multipart/form-data; boundary=')).toBe(true);
      const boundary = captured.contentType
        .slice('multipart/form-data; boundary='.length)
        .replace(/^"|"$/g, '')
        .trim();
      expect(boundary.length).toBeGreaterThan(8);
      expect(captured.body).toContain(`--${boundary}`);
      expect(captured.body).toContain('name="file"');
      expect(captured.body).toContain(marker);
      expect(captured.body).toContain('name="model"');
      expect(captured.body).toContain('whisper-large-v3-turbo');
      expect(captured.authorization).toBe(`Bearer ${API_KEY}`);
      expect(captured.body).not.toContain(API_KEY);
      expect(captured.contentType).not.toContain(API_KEY);
      expect(infoLogs.join('\n')).not.toContain(API_KEY);
      expect(infoLogs.join('\n')).not.toContain('Authorization');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('offsets chunk timestamps into episode time and covers the full duration', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const maxUploadBytes = 400_000;
    const chunkSeconds = groqChunkDurationSeconds(maxUploadBytes);
    expect(chunkSeconds).toBeGreaterThan(30);
    const duration = chunkSeconds * 2 + 24;
    const encoded: Array<{ startSeconds: number; durationSeconds: number; bytes: number }> = [];
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        language: 'en',
        segments: [{ start: 1, end: 2, text: CANONICAL }],
      }),
    );
    const workRoot = tempDir('cn-groq-span-');
    const provider = groqProvider({
      fetchImpl,
      bytes: maxUploadBytes + 50_000,
      maxUploadBytes,
      workRoot,
      probeDuration: async () => duration,
      encodeChunk: async (chunk) => {
        const oversized = chunk.durationSeconds >= chunkSeconds - 0.01;
        const bytes = oversized ? maxUploadBytes + 1_000 : 1_000;
        writeFileSync(chunk.outputPath, Buffer.alloc(bytes));
        encoded.push({ startSeconds: chunk.startSeconds, durationSeconds: chunk.durationSeconds, bytes });
      },
    });
    const transcript = await provider.transcribe({
      audioUrl: 'https://creator.example/audio/episode.mp3',
      sourceItemId: 'guid-chunked',
    });
    const uploaded = encoded.filter((chunk) => chunk.bytes <= maxUploadBytes);
    const covered = uploaded.reduce((sum, chunk) => sum + chunk.durationSeconds, 0);
    expect(covered).toBeCloseTo(duration, 3);
    expect(fetchImpl).toHaveBeenCalledTimes(uploaded.length);
    expect(transcript.segments.map((segment) => segment.startSeconds)).toEqual(
      uploaded.map((chunk) => Math.round((chunk.startSeconds + 1) * 1000) / 1000),
    );
    expect(readdirSync(workRoot)).toEqual([]);
    let cursor = 0;
    for (const chunk of uploaded) {
      expect(chunk.startSeconds).toBeCloseTo(cursor, 3);
      cursor += chunk.durationSeconds;
    }
    expect(cursor).toBeCloseTo(duration, 3);
  });

  it('fails an oversized minimum chunk instead of uploading or truncating it', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const fetchImpl = vi.fn();
    const workRoot = tempDir('cn-groq-oversize-');
    const provider = groqProvider({
      fetchImpl,
      bytes: 5_000,
      maxUploadBytes: 1_000,
      workRoot,
      probeDuration: async () => 10,
      encodeChunk: async (chunk) => {
        writeFileSync(chunk.outputPath, Buffer.alloc(1_500));
      },
    });
    await expect(
      provider.transcribe({
        audioUrl: 'https://creator.example/audio/episode.mp3',
        sourceItemId: 'guid-oversize',
      }),
    ).rejects.toMatchObject({ code: 'groq_audio_chunk_exceeds_upload_limit', provider: 'groq' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readdirSync(workRoot)).toEqual([]);
  });

  it('does not call Groq or local Whisper when GROQ_API_KEY is missing', async () => {
    const fetchImpl = vi.fn();
    const download = downloadBytes(128);
    const provider = createGroqAudioTranscriptionProvider({
      fetchImpl: fetchImpl as never,
      download,
      model: 'whisper-large-v3-turbo',
    });
    await expect(
      provider.transcribe({ audioUrl: 'https://creator.example/audio/episode.mp3', sourceItemId: 'guid' }),
    ).rejects.toMatchObject({ code: 'groq_api_key_missing', provider: 'groq' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
  });

  it('reports authentication failure without echoing the API key', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: `rejected ${API_KEY}` } }, { status: 401 }),
    );
    const provider = groqProvider({ fetchImpl });
    await expect(
      provider.transcribe({ audioUrl: 'https://creator.example/audio/episode.mp3', sourceItemId: 'guid' }),
    ).rejects.toMatchObject({ code: 'groq_auth_failed', httpStatus: 401, provider: 'groq' });
    try {
      await provider.transcribe({ audioUrl: 'https://creator.example/audio/episode.mp3', sourceItemId: 'guid-2' });
    } catch (error) {
      expect(error).toBeInstanceOf(CreatorNotesTranscriptionError);
      expect((error as Error).message).not.toContain(API_KEY);
      expect((error as Error).message).toContain('[redacted]');
    }
  });

  it('reports HTTP 500 as a Groq failure', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'backend down' } }, { status: 500 }));
    const workRoot = tempDir('cn-groq-500-');
    const provider = groqProvider({ fetchImpl, workRoot });
    await expect(
      provider.transcribe({ audioUrl: 'https://creator.example/audio/episode.mp3', sourceItemId: 'guid' }),
    ).rejects.toMatchObject({ code: 'groq_http_500', httpStatus: 500, provider: 'groq' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readdirSync(workRoot)).toEqual([]);
    expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
  });

  it('reports HTTP 429 with retry metadata and does not call local Whisper', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { message: 'slow down' } },
        {
          status: 429,
          headers: {
            'retry-after': '17',
            'x-ratelimit-limit-requests': '20',
            'x-ratelimit-remaining-requests': '0',
            'x-ratelimit-reset-requests': '17s',
          },
        },
      ),
    );
    const provider = groqProvider({ fetchImpl });
    await expect(
      provider.transcribe({ audioUrl: 'https://creator.example/audio/episode.mp3', sourceItemId: 'guid' }),
    ).rejects.toMatchObject({
      code: 'groq_http_429',
      httpStatus: 429,
      provider: 'groq',
      retryAfter: '17',
      rateLimit: { remainingRequests: '0', retryAfter: '17', limitRequests: '20' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
  });

  it('reports timeout and transport failures', async () => {
    setEnv('GROQ_API_KEY', API_KEY);
    const hanging = vi.fn(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const timed = groqProvider({ fetchImpl: hanging, requestTimeoutMs: 20 });
    await expect(
      timed.transcribe({ audioUrl: 'https://creator.example/audio/episode.mp3', sourceItemId: 'guid-timeout' }),
    ).rejects.toMatchObject({ code: 'transcription_timeout', provider: 'groq' });

    const transport = vi.fn(async () => {
      throw new TypeError(`fetch failed ${API_KEY}`);
    });
    const broken = groqProvider({ fetchImpl: transport });
    try {
      await broken.transcribe({ audioUrl: 'https://creator.example/audio/episode.mp3', sourceItemId: 'guid-transport' });
      throw new Error('expected transport failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'transcription_transport', provider: 'groq' });
      expect((error as Error).message).not.toContain(API_KEY);
    }
  });

  it('rejects a transcript body that has text but no segments', () => {
    expect(() => segmentsFromGroqVerboseJson({ text: 'hello without timestamps' }, { offsetSeconds: 0, durationSeconds: null })).toThrowError(
      expect.objectContaining({ code: 'transcription_response_invalid' }),
    );
  });

  it('clamps chunk segment times and preserves missing timestamps', () => {
    const segments = segmentsFromGroqVerboseJson(
      {
        segments: [
          { start: 1.25, end: 4.5, text: ' inside' },
          { start: 18, end: 24, text: ' tail' },
          { text: ' no times' },
          { start: 1, end: 2, text: '   ' },
        ],
      },
      { offsetSeconds: 30, durationSeconds: 19 },
    );
    expect(segments).toEqual([
      { start: 31.25, end: 34.5, text: ' inside' },
      { start: 48, end: 49, text: ' tail' },
      { start: null, end: null, text: ' no times' },
    ]);
  });

  it('plans gapless chunks and treats a supported file at the upload cap as one request', () => {
    const chunks = planGroqAudioChunks(100, 30);
    let cursor = 0;
    for (const chunk of chunks) {
      expect(chunk.startSeconds).toBeCloseTo(cursor, 5);
      cursor += chunk.durationSeconds;
    }
    expect(cursor).toBeCloseTo(100, 5);
    expect(chunks.map((chunk) => chunk.durationSeconds)).toEqual([30, 30, 30, 10]);
    expect(groqDirectUploadCompatible({ bytes: GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES, extension: 'mp3' })).toBe(true);
    expect(groqDirectUploadCompatible({ bytes: GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES + 1, extension: 'mp3' })).toBe(false);
    expect(groqDirectUploadCompatible({ bytes: 1000, extension: 'wav' })).toBe(true);
    expect(groqDirectUploadCompatible({ bytes: 1000, extension: 'bin' })).toBe(false);
    const seconds = groqChunkDurationSeconds();
    const estimated = seconds * (64_000 / 8) + 8_192;
    expect(estimated).toBeLessThanOrEqual(GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES * 0.8);
  });

  it('parses ffmpeg duration and cuts chunks after the input for exact boundaries', () => {
    expect(parseFfmpegDurationSeconds('Duration: 01:02:03.50, start: 0.000000')).toBeCloseTo(3723.5, 2);
    const args = ffmpegAudioChunkArgs({
      inputPath: 'source.mp3',
      outputPath: 'chunk.mp3',
      startSeconds: 19,
      durationSeconds: 19,
    });
    expect(args.indexOf('-ss')).toBeGreaterThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('19.000');
    expect(args[args.indexOf('-t') + 1]).toBe('19.000');
    expect(args).toContain('libmp3lame');
    expect(args).not.toContain('-shortest');
  });

  it('keeps the local Whisper provider functional', async () => {
    const actual = await vi.importActual<typeof import('@/lib/creatorNotes/whisperProvider')>(
      '@/lib/creatorNotes/whisperProvider',
    );
    const runWhisper = vi.fn(async () => ({
      language: 'en',
      segments: [{ start: 1.2, end: 4.8, text: CANONICAL }],
    }));
    const provider = actual.createFasterWhisperTranscriptionProvider({
      cacheDir: tempDir('cn-local-cache-'),
      workRoot: tempDir('cn-local-work-'),
      model: 'small',
      download: downloadBytes(32),
      transcode: vi.fn(async ({ outputPath }: { outputPath: string }) => {
        writeFileSync(outputPath, 'wav');
        return { destPath: outputPath, elapsedMs: 2 };
      }),
      runWhisper,
    });
    const transcript = await provider.transcribe({
      audioUrl: 'https://creator.example/audio/episode.mp3',
      sourceItemId: 'guid-local',
    });
    expect(runWhisper).toHaveBeenCalledTimes(1);
    expect(transcript.transcriptionProvider).toBe('faster-whisper');
    expect(transcript.transcriptionModel).toBe('small');
    expect(transcript.segments[0]).toMatchObject({ startSeconds: 1.2, endSeconds: 4.8, text: CANONICAL });
  });

  it('routes podcast batch --transcribe-audio through Groq when that provider is selected', async () => {
    setEnv('CREATOR_NOTES_TRANSCRIPTION_PROVIDER', 'groq');
    setEnv('CREATOR_NOTES_TRANSCRIPTION_MODEL', 'whisper-large-v3-turbo');
    setEnv('GROQ_API_KEY', API_KEY);
    const fetchMock = vi.fn(async (url: string) => jsonResponse(verboseBody()));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await runCreatorNotesPodcastBatch(batchArgs(true), {
        adapters: [],
        extractChunk: mockExtractChunk([]),
        skipLock: true,
        skipWarmup: true,
        aiConfig: { provider: 'test', model: 'test-model', baseUrl: 'http://127.0.0.1:9', timeoutMs: 1, retries: 0 },
        now: () => NOW,
        log: () => {},
        listEpisodes: async () => [episode(`guid-groq-route-${Date.now()}`)],
      });
      expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/audio/transcriptions');
      expect(result.items[0]?.transcriptStatus).toBe('TRANSCRIPT_AVAILABLE');
      expect(result.audioTranscription).toEqual({ provider: 'groq', model: 'whisper-large-v3-turbo' });
      expect(formatCreatorNotesPodcastBatchReport(result)).toContain(
        'Audio transcription: groq / whisper-large-v3-turbo',
      );
      expect(infoLogs.join('\n')).not.toContain(API_KEY);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not fall back to local Whisper when Groq returns HTTP 429', async () => {
    setEnv('CREATOR_NOTES_TRANSCRIPTION_PROVIDER', 'groq');
    setEnv('GROQ_API_KEY', API_KEY);
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: 'rate limited' } }, { status: 429, headers: { 'retry-after': '9' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await runCreatorNotesPodcastBatch(batchArgs(true), {
        adapters: [],
        extractChunk: mockExtractChunk([]),
        skipLock: true,
        skipWarmup: true,
        aiConfig: { provider: 'test', model: 'test-model', baseUrl: 'http://127.0.0.1:9', timeoutMs: 1, retries: 0 },
        now: () => NOW,
        log: () => {},
        listEpisodes: async () => [episode(`guid-groq-429-${Date.now()}`)],
      });
      expect(createFasterWhisperTranscriptionProvider).not.toHaveBeenCalled();
      expect(result.items[0]?.transcriptStatus).toBe('TRANSCRIPTION_FAILED');
      expect(result.items[0]?.error).toContain('groq_http_429');
      expect(result.items[0]?.error).toContain('retry-after=9');
      expect(result.items[0]?.error).not.toContain(API_KEY);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('routes podcast batch --transcribe-audio through local Whisper when the provider is unset', async () => {
    const transcribe = vi.fn(async () => localTranscript());
    vi.mocked(createFasterWhisperTranscriptionProvider).mockReturnValue({ transcribe });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await runCreatorNotesPodcastBatch(batchArgs(true), {
        adapters: [],
        extractChunk: mockExtractChunk([]),
        skipLock: true,
        skipWarmup: true,
        aiConfig: { provider: 'test', model: 'test-model', baseUrl: 'http://127.0.0.1:9', timeoutMs: 1, retries: 0 },
        now: () => NOW,
        log: () => {},
        listEpisodes: async () => [episode('guid-local-route')],
      });
      expect(createFasterWhisperTranscriptionProvider).toHaveBeenCalledTimes(1);
      expect(transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ audioUrl: 'https://creator.example/audio/guid-local-route.mp3' }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.items[0]?.transcriptSource).toBe('local_audio_transcription');
      expect(result.audioTranscription).toEqual({ provider: 'faster-whisper', model: 'small' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
