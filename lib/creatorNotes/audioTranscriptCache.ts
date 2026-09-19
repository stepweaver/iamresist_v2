import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CreatorTranscriptSegment } from '@/lib/creatorNotes/types';
import { normalizeWhisperSegments } from '@/lib/creatorNotes/audioTranscription';

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
  segments: CreatorTranscriptSegment[];
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
  return typeof row.index === 'number' && typeof row.text === 'string';
}

function parseCacheRecord(raw: string): AudioTranscriptCacheRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AudioTranscriptCacheRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.audioUrl !== 'string' || !parsed.audioUrl.trim()) return null;
    if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string' || typeof parsed.version !== 'string') {
      return null;
    }
    if (!Array.isArray(parsed.segments) || !parsed.segments.every(isSegment)) return null;
    const segments = normalizeWhisperSegments(parsed.segments);
    if (!segments.length) return null;
    return {
      sourceItemId: String(parsed.sourceItemId || ''),
      audioUrl: parsed.audioUrl,
      provider: parsed.provider,
      model: parsed.model,
      version: parsed.version,
      language: parsed.language || null,
      segments,
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
  record: AudioTranscriptCacheRecord,
  cacheDir = DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR,
): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  const dest = audioTranscriptCachePath(record, cacheDir);
  const payload: AudioTranscriptCacheRecord = {
    sourceItemId: record.sourceItemId,
    audioUrl: record.audioUrl,
    provider: record.provider,
    model: record.model,
    version: record.version,
    language: record.language,
    segments: record.segments,
    createdAt: record.createdAt || new Date().toISOString(),
  };
  await writeFile(dest, `${JSON.stringify(payload)}\n`, 'utf8');
  return dest;
}
