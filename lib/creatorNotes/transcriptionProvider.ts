import 'server-only';

import type { GroqAudioTranscriptionDeps } from '@/lib/creatorNotes/groqTranscription';
import { createGroqAudioTranscriptionProvider } from '@/lib/creatorNotes/groqTranscription';
import {
  CREATOR_NOTES_GROQ_TRANSCRIPTION_PROVIDER,
  CREATOR_NOTES_WHISPER_MODEL_DEFAULT,
  CREATOR_NOTES_WHISPER_PROVIDER,
} from '@/lib/creatorNotes/audioTranscription';
import type { AudioTranscriptionProvider } from '@/lib/creatorNotes/audioTranscription';
import {
  creatorNotesGroqTranscriptionModel,
  creatorNotesTranscriptionProvider,
} from '@/lib/creatorNotes/constants';
import { CreatorNotesTranscriptionError } from '@/lib/creatorNotes/errors';
import {
  createFasterWhisperTranscriptionProvider,
  type FasterWhisperProviderDeps,
} from '@/lib/creatorNotes/whisperProvider';

export type CreatorNotesTranscriptionSelection = {
  /** Value stored on the transcript: `groq` or `faster-whisper`. */
  provider: 'groq' | 'faster-whisper';
  /** Env selection: `groq` or `local`. */
  implementation: 'groq' | 'local';
  model: string;
};

function localWhisperModel(): string {
  const raw = process.env.CREATOR_NOTES_WHISPER_MODEL;
  const model = raw == null ? '' : String(raw).trim();
  return model || CREATOR_NOTES_WHISPER_MODEL_DEFAULT;
}

function selectionFromProviderName(name: string): CreatorNotesTranscriptionSelection {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) {
    throw new CreatorNotesTranscriptionError(
      'CREATOR_NOTES_TRANSCRIPTION_PROVIDER is not configured',
      'transcription_provider_not_configured',
      { provider: 'none' },
    );
  }
  if (normalized === 'groq') {
    return {
      provider: CREATOR_NOTES_GROQ_TRANSCRIPTION_PROVIDER,
      implementation: 'groq',
      model: creatorNotesGroqTranscriptionModel(),
    };
  }
  if (normalized === 'local' || normalized === 'whisper') {
    return {
      provider: CREATOR_NOTES_WHISPER_PROVIDER,
      implementation: 'local',
      model: localWhisperModel(),
    };
  }
  throw new CreatorNotesTranscriptionError(
    `Unknown CREATOR_NOTES_TRANSCRIPTION_PROVIDER=${normalized}`,
    'transcription_provider_unknown',
    { provider: normalized },
  );
}

/**
 * Resolve the podcast audio transcription provider.
 * When `override` is omitted, an unset CREATOR_NOTES_TRANSCRIPTION_PROVIDER selects local faster-whisper.
 * An explicit empty provider is `transcription_provider_not_configured` and does not select local Whisper.
 * An unknown name is `transcription_provider_unknown` and does not select local Whisper.
 */
export function resolveCreatorNotesTranscriptionSelection(override?: {
  provider?: string | null;
}): CreatorNotesTranscriptionSelection {
  if (override) return selectionFromProviderName(String(override.provider ?? ''));
  return selectionFromProviderName(creatorNotesTranscriptionProvider());
}

export function createConfiguredAudioTranscriptionProvider(deps?: {
  local?: FasterWhisperProviderDeps;
  groq?: GroqAudioTranscriptionDeps;
}): AudioTranscriptionProvider {
  const selection = resolveCreatorNotesTranscriptionSelection();
  console.info(
    `[creator-notes-transcription] provider=${selection.provider} model=${selection.model}`,
  );
  if (selection.implementation === 'groq') {
    return createGroqAudioTranscriptionProvider({
      ...deps?.groq,
      model: selection.model,
    });
  }
  return createFasterWhisperTranscriptionProvider({
    ...deps?.local,
    model: selection.model,
  });
}
