export class CreatorTranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreatorTranscriptError';
  }
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
