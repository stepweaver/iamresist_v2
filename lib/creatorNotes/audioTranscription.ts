import {
  canonicalizeTranscriptSegments,
  hashCanonicalTranscript,
  hashRawTranscription,
  transcriptCharCount,
} from '@/lib/creatorNotes/identity';
import { CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION } from '@/lib/creatorNotes/constants';
import { durationCoveredSeconds } from '@/lib/creatorNotes/normalizeCaptions';
import type {
  CreatorTranscriptInput,
  CreatorTranscriptSegment,
  PodcastEpisodeSource,
  TranscriptAcquisitionDiagnostics,
} from '@/lib/creatorNotes/types';

export const CREATOR_NOTES_WHISPER_PROVIDER = 'faster-whisper';
export const CREATOR_NOTES_WHISPER_MODEL_DEFAULT = 'small';
export const CREATOR_NOTES_WHISPER_VERSION = 'creator-notes-whisper-v1';
export const AUDIO_DOWNLOAD_TIMEOUT_MS = 180_000;
export const AUDIO_MAX_BYTES = 200 * 1024 * 1024;
export const AUDIO_TRANSCODE_TIMEOUT_MS = 180_000;
export const AUDIO_TRANSCRIBE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const AUDIO_SAMPLE_RATE = 16_000;
export const AUDIO_USER_AGENT = 'iamresist.org creator-notes podcast audio fetcher';
export const LOCAL_AUDIO_TRANSCRIPT_SOURCE = 'local_audio_transcription' as const;

export interface AudioTranscriptionProvider {
  transcribe(input: {
    audioUrl: string;
    language?: string;
    sourceItemId?: string;
  }): Promise<CreatorTranscriptInput>;
}

export type AudioTranscriptionResult = CreatorTranscriptInput & {
  cacheHit?: boolean;
  audioDownloadMs?: number | null;
  transcriptionMs?: number | null;
};

export type WhisperSegmentLike = {
  index?: number;
  start?: number | null;
  end?: number | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  text?: string | null;
};

function optionalFinite(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseRawWhisperSegments(raw: WhisperSegmentLike[] | null | undefined): CreatorTranscriptSegment[] {
  const segments: CreatorTranscriptSegment[] = [];
  for (const row of raw || []) {
    const text = String(row?.text || '');
    if (!String(text).trim()) continue;
    segments.push({
      index: segments.length,
      startSeconds: optionalFinite(row.startSeconds ?? row.start),
      endSeconds: optionalFinite(row.endSeconds ?? row.end),
      text,
    });
  }
  return segments;
}

export function normalizeWhisperSegments(raw: WhisperSegmentLike[] | null | undefined): CreatorTranscriptSegment[] {
  return canonicalizeTranscriptSegments(parseRawWhisperSegments(raw));
}

export function applyEpisodeIdentityToTranscript(
  transcript: CreatorTranscriptInput,
  episode: PodcastEpisodeSource,
): CreatorTranscriptInput {
  return {
    sourceItemId: episode.sourceItemId,
    creatorId: episode.creatorId,
    creatorName: episode.creatorName,
    sourceTitle: episode.title,
    sourceUrl: episode.episodeUrl,
    publishedAt: episode.publishedAt,
    sourceIdentityKey: episode.episodeUrl || episode.audioUrl || episode.guid,
    segments: transcript.segments,
    rawSegments: transcript.rawSegments || transcript.segments,
    rawTranscriptionHash: transcript.rawTranscriptionHash || hashRawTranscription(transcript.rawSegments || transcript.segments),
    normalizationVersion: transcript.normalizationVersion || CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
    audioUrl: episode.audioUrl,
    transcriptSource: LOCAL_AUDIO_TRANSCRIPT_SOURCE,
    transcriptUrl: null,
    transcriptMimeType: null,
    transcriptLanguage: transcript.transcriptLanguage || null,
    transcriptionProvider: transcript.transcriptionProvider || null,
    transcriptionModel: transcript.transcriptionModel || null,
    transcriptionVersion: transcript.transcriptionVersion || null,
  };
}

export function acquisitionFromLocalTranscription(
  transcript: CreatorTranscriptInput,
  extras: {
    rawSegments: number;
    cacheHit?: boolean | null;
    audioDownloadMs?: number | null;
    transcriptionMs?: number | null;
  },
): TranscriptAcquisitionDiagnostics {
  return {
    source: LOCAL_AUDIO_TRANSCRIPT_SOURCE,
    language: transcript.transcriptLanguage || null,
    generated: 'yes',
    rawSegments: extras.rawSegments,
    normalizedSegments: transcript.segments.length,
    durationCoveredSeconds: durationCoveredSeconds(transcript.segments),
    characters: transcriptCharCount(transcript.segments),
    transcriptUrl: null,
    transcriptMimeType: null,
    transcriptLanguage: transcript.transcriptLanguage || null,
    audioUrl: transcript.audioUrl || null,
    transcriptionProvider: transcript.transcriptionProvider || null,
    transcriptionModel: transcript.transcriptionModel || null,
    transcriptionVersion: transcript.transcriptionVersion || null,
    rawTranscriptionHash:
      transcript.rawTranscriptionHash ||
      hashRawTranscription(transcript.rawSegments || transcript.segments),
    canonicalTranscriptHash: hashCanonicalTranscript(transcript.segments),
    normalizationVersion: transcript.normalizationVersion || CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
    cacheHit: extras.cacheHit ?? null,
    timings: {
      audioDownloadMs: extras.audioDownloadMs ?? null,
      transcriptionMs: extras.transcriptionMs ?? null,
      extractionMs: null,
      totalMs: null,
      cacheHit: extras.cacheHit ?? null,
    },
  };
}

export function asAudioTranscriptionResult(transcript: CreatorTranscriptInput): AudioTranscriptionResult {
  return transcript as AudioTranscriptionResult;
}
