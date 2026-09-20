import { describe, expect, it } from 'vitest';

import {
  CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
} from '@/lib/creatorNotes/constants';
import {
  canonicalizeTranscriptSegments,
  hashCanonicalTranscript,
  hashCreatorTranscript,
  hashRawTranscription,
  serializeTranscriptForHash,
} from '@/lib/creatorNotes/identity';
import { parseRawWhisperSegments } from '@/lib/creatorNotes/audioTranscription';
import { readAudioTranscriptCache, writeAudioTranscriptCache } from '@/lib/creatorNotes/audioTranscriptCache';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

function rawWhisperCue(): CreatorTranscriptSegment[] {
  return parseRawWhisperSegments([
    { start: 1.2, end: 4.8, text: '  Iran expands the exclusion zone.  ' },
    { start: 4.8, end: 9.1, text: 'The navy issued a new warning.' },
    { start: 12.0, end: 16.4, text: 'Lloyds of London published a war-risk bulletin.' },
  ]);
}

describe('transcript / hash stability', () => {
  it('canonicalizes the same raw transcription identically twice', () => {
    const raw = rawWhisperCue();
    const first = canonicalizeTranscriptSegments(raw);
    const second = canonicalizeTranscriptSegments(raw);
    expect(second).toEqual(first);
    expect(serializeTranscriptForHash(second)).toBe(serializeTranscriptForHash(first));
    expect(hashCreatorTranscript(second)).toBe(hashCreatorTranscript(first));
    expect(hashRawTranscription(raw)).toBe(hashRawTranscription(rawWhisperCue()));
  });

  it('is idempotent when canonicalization is applied twice', () => {
    const once = canonicalizeTranscriptSegments(rawWhisperCue());
    const twice = canonicalizeTranscriptSegments(once);
    expect(twice).toEqual(once);
    expect(hashCreatorTranscript(twice)).toBe(hashCreatorTranscript(once));
  });

  it('keeps raw transcription hash independent of the normalization version', () => {
    const raw = rawWhisperCue();
    const canonical = canonicalizeTranscriptSegments(raw, CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION);
    const rawHash = hashRawTranscription(raw);
    const v1 = hashCanonicalTranscript(canonical, 'transcript-norm-v1');
    const v2 = hashCanonicalTranscript(canonical, 'transcript-norm-v2');
    expect(rawHash).not.toBe(v1);
    expect(v1).not.toBe(v2);
    expect(hashRawTranscription(raw)).toBe(rawHash);
    expect(canonical.map((segment) => segment.text)).toEqual([
      'Iran expands the exclusion zone.',
      'The navy issued a new warning.',
      'Lloyds of London published a war-risk bulletin.',
    ]);
  });

  it('two reads of the same cached transcription produce identical canonical text, segments, timestamps, and hash', async () => {
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'cn-stable-'));
    const raw = rawWhisperCue();
    await writeAudioTranscriptCache(
      {
        sourceItemId: 'guid-jiang-iran',
        audioUrl: 'https://creator.example/audio/iran.mp3',
        provider: 'faster-whisper',
        model: 'small',
        version: 'creator-notes-whisper-v1',
        language: 'en',
        rawSegments: raw,
        createdAt: '2026-09-20T12:00:00.000Z',
      },
      cacheDir,
    );
    const key = {
      sourceItemId: 'guid-jiang-iran',
      audioUrl: 'https://creator.example/audio/iran.mp3',
      provider: 'faster-whisper',
      model: 'small',
      version: 'creator-notes-whisper-v1',
    };
    const first = await readAudioTranscriptCache(key, cacheDir);
    const second = await readAudioTranscriptCache(key, cacheDir);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.segments).toEqual(first?.segments);
    expect(second?.rawSegments).toEqual(first?.rawSegments);
    expect(second?.segments.map((segment) => [segment.startSeconds, segment.endSeconds, segment.text])).toEqual(
      first?.segments.map((segment) => [segment.startSeconds, segment.endSeconds, segment.text]),
    );
    expect(second?.canonicalTranscriptHash).toBe(first?.canonicalTranscriptHash);
    expect(second?.rawTranscriptionHash).toBe(first?.rawTranscriptionHash);
    expect(hashCreatorTranscript(second?.segments || [])).toBe(hashCreatorTranscript(first?.segments || []));
    expect(first?.normalizationVersion).toBe(CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION);
    expect(first?.rawTranscriptionHash).not.toBe(first?.canonicalTranscriptHash);
  });
});
