import type { CreatorNotesRateLimitSnapshot } from '@/lib/creatorNotes/ai/types';

export class CreatorTranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreatorTranscriptError';
  }
}

export const AI_PROVIDER_UNAVAILABLE = 'AI_PROVIDER_UNAVAILABLE';

export class CreatorNotesProviderUnavailableError extends Error {
  readonly code = AI_PROVIDER_UNAVAILABLE;

  constructor(message = `${AI_PROVIDER_UNAVAILABLE}: transport failure`) {
    super(message);
    this.name = 'CreatorNotesProviderUnavailableError';
  }
}

export function isCreatorNotesProviderUnavailableError(error: unknown): boolean {
  if (error instanceof CreatorNotesProviderUnavailableError) return true;
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code: unknown }).code || '') : '';
  return code === AI_PROVIDER_UNAVAILABLE;
}

/** HTTP 429 from the selected Creator Notes text provider. Not an ordinary failure. */
export const CREATOR_NOTES_RATE_LIMITED = 'CREATOR_NOTES_RATE_LIMITED';

export class CreatorNotesInferenceError extends Error {
  readonly code: string;
  readonly provider: string;
  readonly status: number | null;

  constructor(
    message: string,
    code: string,
    details: { provider?: string; status?: number | null } = {},
  ) {
    super(message);
    this.name = 'CreatorNotesInferenceError';
    this.code = code;
    this.provider = details.provider || 'unknown';
    this.status = details.status ?? null;
  }
}

export class CreatorNotesRateLimitError extends Error {
  readonly code = CREATOR_NOTES_RATE_LIMITED;
  readonly status = 429;
  readonly provider: string;
  readonly retryAfter: string | null;
  readonly rateLimit: CreatorNotesRateLimitSnapshot | null;

  constructor(
    message: string,
    details: {
      provider: string;
      retryAfter?: string | null;
      rateLimit?: CreatorNotesRateLimitSnapshot | null;
    },
  ) {
    super(message.startsWith(CREATOR_NOTES_RATE_LIMITED) ? message : `${CREATOR_NOTES_RATE_LIMITED}: ${message}`);
    this.name = 'CreatorNotesRateLimitError';
    this.provider = details.provider;
    this.retryAfter = details.retryAfter ?? details.rateLimit?.retryAfter ?? null;
    this.rateLimit = details.rateLimit ?? null;
  }
}

export function isCreatorNotesRateLimitError(error: unknown): boolean {
  if (error instanceof CreatorNotesRateLimitError) return true;
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  if (code === CREATOR_NOTES_RATE_LIMITED) return true;
  const status = 'status' in error ? Number((error as { status?: unknown }).status) : NaN;
  return status === 429;
}

export function sourceItemNotFoundError(id: string): CreatorTranscriptError {
  return new CreatorTranscriptError(`source item not found: ${id}`);
}

export function sourceHasNoUrlError(): CreatorTranscriptError {
  return new CreatorTranscriptError('source has no URL');
}

export function unsupportedProviderError(provider: string): CreatorTranscriptError {
  return new CreatorTranscriptError(`Transcript retrieval is not supported for provider: ${provider}`);
}

export function malformedYouTubeUrlError(): CreatorTranscriptError {
  return new CreatorTranscriptError('malformed YouTube URL');
}

export function noCaptionTracksError(): CreatorTranscriptError {
  return new CreatorTranscriptError('no caption tracks available');
}

export function captionRequestFailedError(): CreatorTranscriptError {
  return new CreatorTranscriptError('caption request failed');
}

export function emptyTranscriptError(): CreatorTranscriptError {
  return new CreatorTranscriptError('empty transcript');
}

export function emptyNormalizedTranscriptError(): CreatorTranscriptError {
  return new CreatorTranscriptError('transcript normalization produced no usable segments');
}

export function malformedCaptionsError(): CreatorTranscriptError {
  return new CreatorTranscriptError('malformed captions');
}

export type PodcastTranscriptStatus =
  | 'TRANSCRIPT_AVAILABLE'
  | 'TRANSCRIPT_UNAVAILABLE'
  | 'TRANSCRIPT_FETCH_FAILED'
  | 'TRANSCRIPT_FORMAT_UNSUPPORTED'
  | 'TRANSCRIPT_PARSE_FAILED'
  | 'TRANSCRIPT_EMPTY'
  | 'AUDIO_DOWNLOAD_FAILED'
  | 'AUDIO_TOO_LARGE'
  | 'AUDIO_TRANSCODE_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'TRANSCRIPTION_EMPTY';

export class PodcastTranscriptError extends CreatorTranscriptError {
  readonly status: Exclude<PodcastTranscriptStatus, 'TRANSCRIPT_AVAILABLE'>;

  constructor(status: Exclude<PodcastTranscriptStatus, 'TRANSCRIPT_AVAILABLE'>, message?: string) {
    super(message || status);
    this.name = 'PodcastTranscriptError';
    this.status = status;
  }
}

export function podcastTranscriptUnavailableError(): PodcastTranscriptError {
  return new PodcastTranscriptError('TRANSCRIPT_UNAVAILABLE', 'TRANSCRIPT_UNAVAILABLE');
}

export function podcastTranscriptFetchFailedError(detail?: string): PodcastTranscriptError {
  return new PodcastTranscriptError(
    'TRANSCRIPT_FETCH_FAILED',
    detail ? `TRANSCRIPT_FETCH_FAILED: ${detail}` : 'TRANSCRIPT_FETCH_FAILED',
  );
}

export function podcastTranscriptFormatUnsupportedError(detail?: string): PodcastTranscriptError {
  return new PodcastTranscriptError(
    'TRANSCRIPT_FORMAT_UNSUPPORTED',
    detail ? `TRANSCRIPT_FORMAT_UNSUPPORTED: ${detail}` : 'TRANSCRIPT_FORMAT_UNSUPPORTED',
  );
}

export function podcastTranscriptParseFailedError(detail?: string): PodcastTranscriptError {
  return new PodcastTranscriptError(
    'TRANSCRIPT_PARSE_FAILED',
    detail ? `TRANSCRIPT_PARSE_FAILED: ${detail}` : 'TRANSCRIPT_PARSE_FAILED',
  );
}

export function podcastTranscriptEmptyError(): PodcastTranscriptError {
  return new PodcastTranscriptError('TRANSCRIPT_EMPTY', 'TRANSCRIPT_EMPTY');
}

export function audioDownloadFailedError(detail?: string): PodcastTranscriptError {
  return new PodcastTranscriptError(
    'AUDIO_DOWNLOAD_FAILED',
    detail ? `AUDIO_DOWNLOAD_FAILED: ${detail}` : 'AUDIO_DOWNLOAD_FAILED',
  );
}

export function audioTooLargeError(detail?: string): PodcastTranscriptError {
  return new PodcastTranscriptError(
    'AUDIO_TOO_LARGE',
    detail ? `AUDIO_TOO_LARGE: ${detail}` : 'AUDIO_TOO_LARGE',
  );
}

export function audioTranscodeFailedError(detail?: string): PodcastTranscriptError {
  return new PodcastTranscriptError(
    'AUDIO_TRANSCODE_FAILED',
    detail ? `AUDIO_TRANSCODE_FAILED: ${detail}` : 'AUDIO_TRANSCODE_FAILED',
  );
}

export function transcriptionFailedError(detail?: string): PodcastTranscriptError {
  return new PodcastTranscriptError(
    'TRANSCRIPTION_FAILED',
    detail ? `TRANSCRIPTION_FAILED: ${detail}` : 'TRANSCRIPTION_FAILED',
  );
}

export function transcriptionEmptyError(): PodcastTranscriptError {
  return new PodcastTranscriptError('TRANSCRIPTION_EMPTY', 'TRANSCRIPTION_EMPTY');
}
