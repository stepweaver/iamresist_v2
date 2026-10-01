import 'server-only';

import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { Agent, FormData, fetch as undiciFetch } from 'undici';

import { creatorNotesGroqApiKey, readCreatorNotesRateLimitHeaders } from '@/lib/creatorNotes/ai/groq';
import type { CreatorNotesRateLimitSnapshot } from '@/lib/creatorNotes/ai/types';
import {
  audioFileExtension,
  downloadPodcastAudio,
  encodeAudioChunk,
  probeAudioDurationSeconds,
  withTemporaryAudioWorkspace,
} from '@/lib/creatorNotes/audioDownload';
import {
  DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR,
  readAudioTranscriptCache,
  writeAudioTranscriptCache,
} from '@/lib/creatorNotes/audioTranscriptCache';
import {
  CREATOR_NOTES_GROQ_TRANSCRIPTION_PROVIDER,
  CREATOR_NOTES_GROQ_TRANSCRIPTION_VERSION,
  parseRawWhisperSegments,
  type AudioTranscriptionProvider,
  type AudioTranscriptionResult,
  type WhisperSegmentLike,
} from '@/lib/creatorNotes/audioTranscription';
import {
  CREATOR_NOTES_GROQ_BASE_URL,
  CREATOR_NOTES_GROQ_TRANSCRIPTION_MODEL_DEFAULT,
  CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
} from '@/lib/creatorNotes/constants';
import { CreatorNotesTranscriptionError, transcriptionEmptyError } from '@/lib/creatorNotes/errors';
import { canonicalizeTranscriptSegments, hashRawTranscription } from '@/lib/creatorNotes/identity';

/**
 * Groq's speech-to-text direct file upload cap.
 * Free-tier requests accept 25 MB. The larger dev-tier cap applies when the file is
 * supplied by URL, which this provider does not do. Chunk targets sit under this cap.
 */
export const GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES = 25_000_000;
export const GROQ_TRANSCRIPTION_UPLOAD_SAFETY_RATIO = 0.8;
/** 64 kbps CBR mono MP3. Matches the ffmpeg chunk encoder. */
export const GROQ_TRANSCRIPTION_CHUNK_BITRATE = 64_000;
export const GROQ_TRANSCRIPTION_CHUNK_HEADER_BYTES = 8_192;
export const GROQ_TRANSCRIPTION_MIN_CHUNK_SECONDS = 30;
export const GROQ_TRANSCRIPTION_MAX_CHUNKS = 512;
export const GROQ_TRANSCRIPTION_REQUEST_TIMEOUT_MS = 180_000;
const GROQ_CONNECT_TIMEOUT_MS = 30_000;

const GROQ_AUDIO_EXTENSIONS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm']);

const AUDIO_MIME: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  mpga: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

type HeaderSource = { get(name: string): string | null };

type TranscriptionResponse = {
  ok: boolean;
  status: number;
  headers: HeaderSource;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type TranscriptionFetch = (
  url: string,
  init: Omit<RequestInit, 'body'> & {
    body?: RequestInit['body'] | FormData;
    dispatcher?: Agent;
  },
) => Promise<TranscriptionResponse>;

export type GroqVerboseSegmentBounds = {
  offsetSeconds: number;
  /** When set, segment times are clamped into this chunk before the offset is applied. */
  durationSeconds: number | null;
};

export type GroqAudioChunkPlan = {
  startSeconds: number;
  durationSeconds: number;
};

export type GroqAudioTranscriptionDeps = {
  cacheDir?: string;
  workRoot?: string;
  model?: string;
  version?: string;
  providerName?: string;
  language?: string;
  fetchImpl?: TranscriptionFetch;
  maxUploadBytes?: number;
  requestTimeoutMs?: number;
  baseUrl?: string;
  download?: typeof downloadPodcastAudio;
  probeDuration?: (inputPath: string) => Promise<number>;
  encodeChunk?: (input: {
    inputPath: string;
    outputPath: string;
    startSeconds: number;
    durationSeconds: number;
  }) => Promise<void>;
  ffmpegBin?: string;
};

function groqRuntimeFetch(): TranscriptionFetch {
  if (process.env.NODE_ENV === 'test' && typeof globalThis.fetch === 'function') {
    return globalThis.fetch as unknown as TranscriptionFetch;
  }
  return undiciFetch as unknown as TranscriptionFetch;
}

function groqFetchTimeoutMs(timeoutMs: number): number {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : GROQ_TRANSCRIPTION_REQUEST_TIMEOUT_MS;
  return timeout + 5_000;
}

function createGroqDispatcher(timeoutMs: number): Agent {
  const wait = groqFetchTimeoutMs(timeoutMs);
  return new Agent({
    headersTimeout: wait,
    bodyTimeout: wait,
    connectTimeout: GROQ_CONNECT_TIMEOUT_MS,
  });
}

function clipDetail(value: string, secret: string): string {
  let text = String(value || '');
  if (secret) text = text.split(secret).join('[redacted]');
  return text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function defaultLanguage(): string {
  const raw = process.env.CREATOR_NOTES_TRANSCRIBE_LANGUAGE;
  const language = raw == null ? '' : String(raw).trim();
  return language || 'en';
}

export function groqDirectUploadCompatible(input: {
  bytes: number;
  extension: string;
  maxBytes?: number;
}): boolean {
  const maxBytes = input.maxBytes ?? GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES;
  const extension = String(input.extension || '').toLowerCase();
  return input.bytes > 0 && input.bytes <= maxBytes && GROQ_AUDIO_EXTENSIONS.has(extension);
}

export function groqChunkDurationSeconds(maxBytes: number = GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES): number {
  const target = Math.floor(maxBytes * GROQ_TRANSCRIPTION_UPLOAD_SAFETY_RATIO);
  const payload = target - GROQ_TRANSCRIPTION_CHUNK_HEADER_BYTES;
  const bytesPerSecond = GROQ_TRANSCRIPTION_CHUNK_BITRATE / 8;
  if (payload <= 0 || bytesPerSecond <= 0) return GROQ_TRANSCRIPTION_MIN_CHUNK_SECONDS;
  const seconds = Math.floor(payload / bytesPerSecond);
  return Math.max(GROQ_TRANSCRIPTION_MIN_CHUNK_SECONDS, seconds);
}

/** Gapless, non-overlapping spans that cover durationSeconds exactly. */
export function planGroqAudioChunks(durationSeconds: number, chunkSeconds: number): GroqAudioChunkPlan[] {
  const totalMs = Math.round(durationSeconds * 1000);
  const chunkMs = Math.max(1, Math.round(chunkSeconds * 1000));
  if (totalMs <= 0) return [];
  const chunks: GroqAudioChunkPlan[] = [];
  for (let start = 0; start < totalMs; start += chunkMs) {
    const len = Math.min(chunkMs, totalMs - start);
    chunks.push({ startSeconds: start / 1000, durationSeconds: len / 1000 });
    if (chunks.length > GROQ_TRANSCRIPTION_MAX_CHUNKS) {
      throw new CreatorNotesTranscriptionError(
        `groq_audio_chunk_plan_exceeded: ${chunks.length} chunks`,
        'groq_audio_chunk_plan_exceeded',
        { provider: 'groq' },
      );
    }
  }
  return chunks;
}

export function groqVerboseLanguage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const language = (body as { language?: unknown }).language;
  return typeof language === 'string' && language.trim() ? language.trim() : null;
}

/**
 * Map Groq verbose_json segments onto the same start/end/text shape local Whisper returns.
 * Missing timestamps stay null. Times are not invented from the top-level text field.
 */
export function segmentsFromGroqVerboseJson(body: unknown, bounds: GroqVerboseSegmentBounds): WhisperSegmentLike[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CreatorNotesTranscriptionError(
      'transcription_response_invalid: response was not an object',
      'transcription_response_invalid',
      { provider: 'groq' },
    );
  }
  const segments = (body as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) {
    throw new CreatorNotesTranscriptionError(
      'transcription_response_invalid: verbose_json segments missing',
      'transcription_response_invalid',
      { provider: 'groq' },
    );
  }
  const duration = bounds.durationSeconds;
  const offset = Number.isFinite(bounds.offsetSeconds) ? bounds.offsetSeconds : 0;
  const out: WhisperSegmentLike[] = [];
  for (const row of segments) {
    if (!row || typeof row !== 'object') {
      throw new CreatorNotesTranscriptionError(
        'transcription_response_invalid: segment was not an object',
        'transcription_response_invalid',
        { provider: 'groq' },
      );
    }
    const text = String((row as { text?: unknown }).text ?? '');
    if (!text.trim()) continue;
    let start = finiteNumber((row as { start?: unknown }).start);
    let end = finiteNumber((row as { end?: unknown }).end);
    if (duration != null && duration > 0) {
      if (start != null) start = Math.min(duration, Math.max(0, start));
      if (end != null) end = Math.min(duration, Math.max(0, end));
      if (start != null && start >= duration && (end == null || end >= duration)) continue;
    }
    if (start != null && end != null && end < start) {
      start = null;
      end = null;
    }
    out.push({
      start: start == null ? null : roundSeconds(start + offset),
      end: end == null ? null : roundSeconds(end + offset),
      text,
    });
  }
  return out;
}

function requireGroqApiKey(): string {
  const apiKey = creatorNotesGroqApiKey();
  if (!apiKey) {
    throw new CreatorNotesTranscriptionError('GROQ_API_KEY is not configured', 'groq_api_key_missing', {
      provider: 'groq',
    });
  }
  return apiKey;
}

function rateLimitMessage(code: string, retryAfter: string | null, rateLimit: CreatorNotesRateLimitSnapshot | null): string {
  const parts = [code];
  if (retryAfter) parts.push(`retry-after=${retryAfter}`);
  if (rateLimit?.remainingRequests) parts.push(`remaining-requests=${rateLimit.remainingRequests}`);
  if (rateLimit?.resetRequests) parts.push(`reset-requests=${rateLimit.resetRequests}`);
  return parts.join(' ');
}

async function readGroqErrorDetail(res: TranscriptionResponse, secret: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const message = (body as { error?: { message?: unknown } }).error?.message;
      if (typeof message === 'string' && message.trim()) return clipDetail(message, secret);
    }
  } catch {
    try {
      const text = await res.text();
      if (text.trim()) return clipDetail(text, secret);
    } catch {
      return '';
    }
  }
  return '';
}

function responseHeaders(headers: unknown): HeaderSource {
  if (headers && typeof headers === 'object' && 'get' in headers && typeof (headers as HeaderSource).get === 'function') {
    return headers as HeaderSource;
  }
  return { get: () => null };
}

function uploadExtension(destPath: string, audioUrl: string, contentType: string | null): string {
  const fromPath = path.extname(destPath).replace(/^\./, '').toLowerCase();
  if (GROQ_AUDIO_EXTENSIONS.has(fromPath)) return fromPath;
  return audioFileExtension(audioUrl, contentType);
}

function audioMime(extension: string): string {
  return AUDIO_MIME[extension.toLowerCase()] || 'application/octet-stream';
}

function transcriptFromGroq(input: {
  sourceItemId: string;
  audioUrl: string;
  language: string | null;
  rawSegments: ReturnType<typeof parseRawWhisperSegments>;
  segments: ReturnType<typeof canonicalizeTranscriptSegments>;
  provider: string;
  model: string;
  version: string;
  cacheHit: boolean;
  audioDownloadMs: number | null;
  transcriptionMs: number | null;
}): AudioTranscriptionResult {
  const transcript: AudioTranscriptionResult = {
    sourceItemId: input.sourceItemId,
    creatorId: null,
    creatorName: null,
    sourceTitle: null,
    sourceUrl: null,
    publishedAt: null,
    sourceIdentityKey: input.audioUrl,
    rawSegments: input.rawSegments,
    segments: input.segments,
    rawTranscriptionHash: hashRawTranscription(input.rawSegments),
    normalizationVersion: CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
    audioUrl: input.audioUrl,
    transcriptSource: 'local_audio_transcription',
    transcriptUrl: null,
    transcriptMimeType: null,
    transcriptLanguage: input.language,
    transcriptionProvider: input.provider,
    transcriptionModel: input.model,
    transcriptionVersion: input.version,
    cacheHit: input.cacheHit,
    audioDownloadMs: input.audioDownloadMs,
    transcriptionMs: input.transcriptionMs,
  };
  return transcript;
}

async function postGroqTranscription(input: {
  fetchImpl: TranscriptionFetch;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: string;
  timeoutMs: number;
  filePath: string;
  filename: string;
  mime: string;
}): Promise<unknown> {
  const bytes = await readFile(input.filePath);
  const form = new FormData();
  const payload = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  form.append('file', new Blob([payload], { type: input.mime }), input.filename);
  form.append('model', input.model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('temperature', '0');
  if (input.language) form.append('language', input.language);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const dispatcher = createGroqDispatcher(input.timeoutMs);
  try {
    const res = await input.fetchImpl(`${input.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      // Undici adds multipart/form-data and the matching boundary when the body is its FormData.
      // A hand-written Content-Type header would not include that boundary.
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      dispatcher,
    });
    const rateLimit = readCreatorNotesRateLimitHeaders(responseHeaders(res.headers));
    if (res.status === 429) {
      const retryAfter = rateLimit?.retryAfter ?? null;
      throw new CreatorNotesTranscriptionError(
        rateLimitMessage('groq_http_429', retryAfter, rateLimit),
        'groq_http_429',
        { provider: 'groq', httpStatus: 429, retryAfter, rateLimit },
      );
    }
    if (res.status === 401 || res.status === 403) {
      const detail = await readGroqErrorDetail(res, input.apiKey);
      throw new CreatorNotesTranscriptionError(
        detail ? `groq_auth_failed: ${detail}` : 'groq_auth_failed',
        'groq_auth_failed',
        { provider: 'groq', httpStatus: res.status },
      );
    }
    if (!res.ok) {
      const detail = await readGroqErrorDetail(res, input.apiKey);
      throw new CreatorNotesTranscriptionError(
        detail ? `groq_http_${res.status}: ${detail}` : `groq_http_${res.status}`,
        `groq_http_${res.status}`,
        { provider: 'groq', httpStatus: res.status },
      );
    }
    try {
      return await res.json();
    } catch {
      throw new CreatorNotesTranscriptionError(
        'transcription_response_invalid: response was not JSON',
        'transcription_response_invalid',
        { provider: 'groq', httpStatus: res.status },
      );
    }
  } catch (error) {
    if (error instanceof CreatorNotesTranscriptionError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message === 'The operation was aborted')) {
      throw new CreatorNotesTranscriptionError('transcription_timeout', 'transcription_timeout', { provider: 'groq' });
    }
    const detail = error instanceof Error ? error.message : 'network error';
    throw new CreatorNotesTranscriptionError(
      detail ? `transcription_transport: ${clipDetail(detail, input.apiKey)}` : 'transcription_transport',
      'transcription_transport',
      { provider: 'groq' },
    );
  } finally {
    clearTimeout(timer);
    try {
      await dispatcher.close();
    } catch {
      // ignore
    }
  }
}

export function createGroqAudioTranscriptionProvider(deps: GroqAudioTranscriptionDeps = {}): AudioTranscriptionProvider {
  const cacheDir = deps.cacheDir || DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR;
  const providerName = deps.providerName || CREATOR_NOTES_GROQ_TRANSCRIPTION_PROVIDER;
  const model = deps.model || '';
  const version = deps.version || CREATOR_NOTES_GROQ_TRANSCRIPTION_VERSION;
  const maxUploadBytes = deps.maxUploadBytes ?? GROQ_TRANSCRIPTION_MAX_UPLOAD_BYTES;
  const timeoutMs = deps.requestTimeoutMs ?? GROQ_TRANSCRIPTION_REQUEST_TIMEOUT_MS;
  const baseUrl = deps.baseUrl || CREATOR_NOTES_GROQ_BASE_URL;
  const download = deps.download || downloadPodcastAudio;
  const probeDuration = deps.probeDuration || ((inputPath: string) => probeAudioDurationSeconds({
    inputPath,
    ffmpegBin: deps.ffmpegBin,
  }));
  const encodeChunk = deps.encodeChunk || ((input) => encodeAudioChunk({ ...input, ffmpegBin: deps.ffmpegBin }));
  const fetchImpl = deps.fetchImpl || groqRuntimeFetch();

  return {
    async transcribe(request) {
      const apiKey = requireGroqApiKey();
      const resolvedModel = model || CREATOR_NOTES_GROQ_TRANSCRIPTION_MODEL_DEFAULT;
      const audioUrl = String(request.audioUrl || '').trim();
      if (!audioUrl) {
        throw new CreatorNotesTranscriptionError('transcription_failed: missing audioUrl', 'transcription_failed', {
          provider: 'groq',
        });
      }
      const sourceItemId = String(request.sourceItemId || audioUrl).trim();
      const language = request.language || defaultLanguage();
      const cacheKey = { sourceItemId, audioUrl, provider: providerName, model: resolvedModel, version };
      const cached = await readAudioTranscriptCache(cacheKey, cacheDir);
      if (cached) {
        console.info(
          `[creator-notes-transcription] provider=${providerName} model=${resolvedModel} cache=hit`,
        );
        return transcriptFromGroq({
          sourceItemId,
          audioUrl,
          language: cached.language || language,
          rawSegments: cached.rawSegments,
          segments: cached.segments,
          provider: cached.provider || providerName,
          model: cached.model || resolvedModel,
          version: cached.version || version,
          cacheHit: true,
          audioDownloadMs: 0,
          transcriptionMs: 0,
        });
      }

      return withTemporaryAudioWorkspace(async ({ workDir }) => {
        const started = Date.now();
        const rawPath = path.join(workDir, `source.${audioFileExtension(audioUrl, null)}`);
        const downloaded = await download({ audioUrl, destPath: rawPath });
        const extension = uploadExtension(downloaded.destPath, audioUrl, downloaded.contentType);
        const fileStat = await stat(downloaded.destPath);
        const bytes = Math.max(downloaded.bytes, fileStat.size);
        const uploadSource = groqDirectUploadCompatible({ bytes, extension, maxBytes: maxUploadBytes });
        console.info(
          `[creator-notes-transcription] provider=${providerName} model=${resolvedModel} bytes=${bytes} upload=${uploadSource ? 'source' : 'chunked'}`,
        );
        const pieces = uploadSource
          ? await transcribeSourceFile({
              fetchImpl,
              baseUrl,
              apiKey,
              model: resolvedModel,
              language,
              timeoutMs,
              filePath: downloaded.destPath,
              extension,
            })
          : await transcribeChunkedSource({
              fetchImpl,
              baseUrl,
              apiKey,
              model: resolvedModel,
              language,
              timeoutMs,
              workDir,
              sourcePath: downloaded.destPath,
              maxUploadBytes,
              probeDuration,
              encodeChunk,
              providerName,
            });
        const rawSegments = parseRawWhisperSegments(pieces.segments);
        const segments = canonicalizeTranscriptSegments(rawSegments);
        if (!segments.length) throw transcriptionEmptyError();
        await writeAudioTranscriptCache(
          {
            sourceItemId,
            audioUrl,
            provider: providerName,
            model: resolvedModel,
            version,
            language: pieces.language || language,
            rawSegments,
            segments,
            normalizationVersion: CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
            createdAt: new Date().toISOString(),
          },
          cacheDir,
        );
        return transcriptFromGroq({
          sourceItemId,
          audioUrl,
          language: pieces.language || language,
          rawSegments,
          segments,
          provider: providerName,
          model: resolvedModel,
          version,
          cacheHit: false,
          audioDownloadMs: downloaded.elapsedMs,
          transcriptionMs: Date.now() - started,
        });
      }, { tmpRoot: deps.workRoot });
    },
  };
}

async function transcribeSourceFile(input: {
  fetchImpl: TranscriptionFetch;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: string;
  timeoutMs: number;
  filePath: string;
  extension: string;
}): Promise<{ segments: WhisperSegmentLike[]; language: string | null }> {
  const body = await postGroqTranscription({
    ...input,
    filename: `source.${input.extension || 'audio'}`,
    mime: audioMime(input.extension),
  });
  return {
    segments: segmentsFromGroqVerboseJson(body, { offsetSeconds: 0, durationSeconds: null }),
    language: groqVerboseLanguage(body),
  };
}

async function transcribeChunkedSource(input: {
  fetchImpl: TranscriptionFetch;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: string;
  timeoutMs: number;
  workDir: string;
  sourcePath: string;
  maxUploadBytes: number;
  probeDuration: (inputPath: string) => Promise<number>;
  encodeChunk: (chunk: {
    inputPath: string;
    outputPath: string;
    startSeconds: number;
    durationSeconds: number;
  }) => Promise<void>;
  providerName: string;
}): Promise<{ segments: WhisperSegmentLike[]; language: string | null }> {
  const durationSeconds = await input.probeDuration(input.sourcePath);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new CreatorNotesTranscriptionError(
      'transcription_audio_duration_unavailable',
      'transcription_audio_duration_unavailable',
      { provider: 'groq' },
    );
  }
  const chunkSeconds = groqChunkDurationSeconds(input.maxUploadBytes);
  const plan = planGroqAudioChunks(durationSeconds, chunkSeconds);
  if (!plan.length) {
    throw new CreatorNotesTranscriptionError(
      'transcription_audio_duration_unavailable',
      'transcription_audio_duration_unavailable',
      { provider: 'groq' },
    );
  }
  console.info(
    `[creator-notes-transcription] provider=${input.providerName} model=${input.model} chunks=${plan.length} chunkSeconds=${chunkSeconds}`,
  );
  let language: string | null = null;
  const segments: WhisperSegmentLike[] = [];
  for (const chunk of plan) {
    const piece = await transcribeSpan({
      ...input,
      startMs: Math.round(chunk.startSeconds * 1000),
      durationMs: Math.round(chunk.durationSeconds * 1000),
    });
    if (!language && piece.language) language = piece.language;
    segments.push(...piece.segments);
  }
  return { segments, language };
}

async function transcribeSpan(input: {
  fetchImpl: TranscriptionFetch;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: string;
  timeoutMs: number;
  workDir: string;
  sourcePath: string;
  maxUploadBytes: number;
  encodeChunk: (chunk: {
    inputPath: string;
    outputPath: string;
    startSeconds: number;
    durationSeconds: number;
  }) => Promise<void>;
  providerName: string;
  startMs: number;
  durationMs: number;
}): Promise<{ segments: WhisperSegmentLike[]; language: string | null }> {
  if (input.durationMs <= 0) return { segments: [], language: null };
  const outputPath = path.join(input.workDir, `chunk-${input.startMs}-${input.durationMs}.mp3`);
  const startSeconds = input.startMs / 1000;
  const durationSeconds = input.durationMs / 1000;
  await input.encodeChunk({
    inputPath: input.sourcePath,
    outputPath,
    startSeconds,
    durationSeconds,
  });
  let size = 0;
  try {
    size = (await stat(outputPath)).size;
  } catch {
    throw new CreatorNotesTranscriptionError(
      'transcription_chunk_failed: encoded chunk missing',
      'transcription_chunk_failed',
      { provider: 'groq' },
    );
  }
  if (size <= 0 || size > input.maxUploadBytes) {
    await rm(outputPath, { force: true });
    const minMs = GROQ_TRANSCRIPTION_MIN_CHUNK_SECONDS * 1000;
    if (size <= 0 || input.durationMs <= minMs) {
      throw new CreatorNotesTranscriptionError(
        `groq_audio_chunk_exceeds_upload_limit: ${size} bytes for ${input.durationMs}ms at ${input.startMs}ms`,
        'groq_audio_chunk_exceeds_upload_limit',
        { provider: 'groq' },
      );
    }
    const left = Math.floor(input.durationMs / 2);
    const right = input.durationMs - left;
    if (left <= 0 || right <= 0) {
      throw new CreatorNotesTranscriptionError(
        `groq_audio_chunk_exceeds_upload_limit: ${size} bytes for ${input.durationMs}ms at ${input.startMs}ms`,
        'groq_audio_chunk_exceeds_upload_limit',
        { provider: 'groq' },
      );
    }
    const first = await transcribeSpan({ ...input, startMs: input.startMs, durationMs: left });
    const second = await transcribeSpan({ ...input, startMs: input.startMs + left, durationMs: right });
    return {
      segments: [...first.segments, ...second.segments],
      language: first.language || second.language,
    };
  }
  try {
    console.info(
      `[creator-notes-transcription] provider=${input.providerName} model=${input.model} upload=chunk startSeconds=${startSeconds} durationSeconds=${durationSeconds} bytes=${size}`,
    );
    const body = await postGroqTranscription({
      fetchImpl: input.fetchImpl,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      language: input.language,
      timeoutMs: input.timeoutMs,
      filePath: outputPath,
      filename: 'chunk.mp3',
      mime: 'audio/mpeg',
    });
    return {
      segments: segmentsFromGroqVerboseJson(body, { offsetSeconds: startSeconds, durationSeconds }),
      language: groqVerboseLanguage(body),
    };
  } finally {
    await rm(outputPath, { force: true });
  }
}
