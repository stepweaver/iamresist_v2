import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION } from '@/lib/creatorNotes/constants';
import {
  canonicalizeTranscriptSegments,
  hashCanonicalTranscript,
  hashRawTranscription,
} from '@/lib/creatorNotes/identity';
import { parseRawWhisperSegments } from '@/lib/creatorNotes/audioTranscription';
import type { CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

export const DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR = path.join(
  process.cwd(),
  'tmp',
  'creator-notes-audio-transcripts',
);

export type AudioTranscriptCacheRecord = {
  sourceItemId: string;
  audioUrl: string;
  provider: string;
  model: string;
  version: string;
  language: string | null;
  rawSegments: CreatorTranscriptSegment[];
  segments: CreatorTranscriptSegment[];
  rawTranscriptionHash: string;
  canonicalTranscriptHash: string;
  normalizationVersion: string;
  createdAt: string;
};

export function audioTranscriptCacheKey(input: {
  sourceItemId: string;
  audioUrl: string;
  provider: string;
  model: string;
  version: string;
}): string {
  const payload = JSON.stringify({
    sourceItemId: String(input.sourceItemId || '').trim(),
    audioUrl: String(input.audioUrl || '').trim(),
    provider: String(input.provider || '').trim(),
    model: String(input.model || '').trim(),
    version: String(input.version || '').trim(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function audioTranscriptCachePath(
  keyInput: {
    sourceItemId: string;
    audioUrl: string;
    provider: string;
    model: string;
    version: string;
  },
  cacheDir = DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR,
): string {
  return path.join(cacheDir, `${audioTranscriptCacheKey(keyInput)}.json`);
}

function isSegment(value: unknown): value is CreatorTranscriptSegment {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.text === 'string';
}

function readSegmentList(value: unknown): CreatorTranscriptSegment[] | null {
  if (!Array.isArray(value) || !value.every(isSegment)) return null;
  return parseRawWhisperSegments(value);
}

function parseCacheRecord(raw: string): AudioTranscriptCacheRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AudioTranscriptCacheRecord> & {
      segments?: CreatorTranscriptSegment[];
      rawSegments?: CreatorTranscriptSegment[];
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.audioUrl !== 'string' || !parsed.audioUrl.trim()) return null;
    if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string' || typeof parsed.version !== 'string') {
      return null;
    }
    const rawSegments = readSegmentList(parsed.rawSegments) || readSegmentList(parsed.segments);
    if (!rawSegments?.length) return null;
    const normalizationVersion =
      typeof parsed.normalizationVersion === 'string' && parsed.normalizationVersion.trim()
        ? parsed.normalizationVersion.trim()
        : CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION;
    const segments = canonicalizeTranscriptSegments(rawSegments, normalizationVersion);
    if (!segments.length) return null;
    return {
      sourceItemId: String(parsed.sourceItemId || ''),
      audioUrl: parsed.audioUrl,
      provider: parsed.provider,
      model: parsed.model,
      version: parsed.version,
      language: parsed.language || null,
      rawSegments,
      segments,
      rawTranscriptionHash: hashRawTranscription(rawSegments),
      canonicalTranscriptHash: hashCanonicalTranscript(segments, normalizationVersion),
      normalizationVersion,
      createdAt: parsed.createdAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function readAudioTranscriptCache(
  keyInput: {
    sourceItemId: string;
    audioUrl: string;
    provider: string;
    model: string;
    version: string;
  },
  cacheDir = DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR,
): Promise<AudioTranscriptCacheRecord | null> {
  try {
    const raw = await readFile(audioTranscriptCachePath(keyInput, cacheDir), 'utf8');
    return parseCacheRecord(raw);
  } catch {
    return null;
  }
}

export async function writeAudioTranscriptCache(
  record: Omit<
    AudioTranscriptCacheRecord,
    'rawTranscriptionHash' | 'canonicalTranscriptHash' | 'segments' | 'normalizationVersion'
  > & {
    segments?: CreatorTranscriptSegment[];
    rawSegments?: CreatorTranscriptSegment[];
    rawTranscriptionHash?: string;
    canonicalTranscriptHash?: string;
    normalizationVersion?: string;
  },
  cacheDir = DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR,
): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  const dest = audioTranscriptCachePath(record, cacheDir);
  const rawSegments = record.rawSegments?.length
    ? parseRawWhisperSegments(record.rawSegments)
    : parseRawWhisperSegments(record.segments || []);
  const normalizationVersion = record.normalizationVersion || CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION;
  const segments = canonicalizeTranscriptSegments(rawSegments, normalizationVersion);
  const payload: AudioTranscriptCacheRecord = {
    sourceItemId: record.sourceItemId,
    audioUrl: record.audioUrl,
    provider: record.provider,
    model: record.model,
    version: record.version,
    language: record.language,
    rawSegments,
    segments,
    rawTranscriptionHash: hashRawTranscription(rawSegments),
    canonicalTranscriptHash: hashCanonicalTranscript(segments, normalizationVersion),
    normalizationVersion,
    createdAt: record.createdAt || new Date().toISOString(),
  };
  await writeFile(dest, `${JSON.stringify(payload)}\n`, 'utf8');
  return dest;
}
