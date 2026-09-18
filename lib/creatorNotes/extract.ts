import 'server-only';

import { CREATOR_NOTES_DEFAULT_MODEL } from '@/lib/creatorNotes/constants';
import { buildCreatorNoteMessages } from '@/lib/creatorNotes/prompt';
import { CREATOR_NOTES_JSON_SCHEMA } from '@/lib/creatorNotes/schema';
import { parseCreatorNotesOutput } from '@/lib/creatorNotes/validate';
import type {
  CreatorNotesChunkExtractResult,
  CreatorTranscriptChunk,
  CreatorTranscriptInput,
} from '@/lib/creatorNotes/types';
import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { ollamaChatJson, probeOllama } from '@/lib/themeMemory/ai/ollama';
import { ThemeAIUnavailableError } from '@/lib/themeMemory/ai/types';

export type CreatorNotesAiConfig = {
  provider: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
};

export function resolveCreatorNotesAiConfig(): CreatorNotesAiConfig {
  const provider = String(themeMemoryEnv.THEME_AI_PROVIDER || 'none').toLowerCase();
  const model = themeMemoryEnv.OLLAMA_MODEL || CREATOR_NOTES_DEFAULT_MODEL;
  return {
    provider,
    model,
    baseUrl: themeMemoryEnv.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    timeoutMs: themeMemoryEnv.THEME_AI_TIMEOUT_MS ?? 45000,
    retries: themeMemoryEnv.THEME_AI_MAX_RETRIES ?? 2,
  };
}

export function assertCreatorNotesAiConfigured(config: CreatorNotesAiConfig = resolveCreatorNotesAiConfig()): void {
  if (config.provider !== 'ollama') {
    throw new ThemeAIUnavailableError(
      'Creator notes extraction requires THEME_AI_PROVIDER=ollama',
      'provider_not_ollama',
    );
  }
  if (!config.model) {
    throw new ThemeAIUnavailableError('OLLAMA_MODEL is not configured', 'model_not_configured');
  }
}

export async function warmupCreatorNotesAi(
  config: CreatorNotesAiConfig = resolveCreatorNotesAiConfig(),
): Promise<void> {
  assertCreatorNotesAiConfigured(config);
  const probe = await probeOllama({
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
  if (!probe.ok) {
    throw new ThemeAIUnavailableError(
      `Ollama is not ready: ${probe.error || 'unknown error'}`,
      'ollama_not_ready',
    );
  }
}

export async function extractCreatorNotesChunk(input: {
  transcript: CreatorTranscriptInput;
  chunk: CreatorTranscriptChunk;
  chunkCount: number;
  config?: CreatorNotesAiConfig;
}): Promise<CreatorNotesChunkExtractResult> {
  const config = input.config || resolveCreatorNotesAiConfig();
  assertCreatorNotesAiConfigured(config);

  const { content } = await ollamaChatJson({
    messages: buildCreatorNoteMessages({
      transcript: input.transcript,
      chunk: input.chunk,
      chunkCount: input.chunkCount,
    }),
    format: CREATOR_NOTES_JSON_SCHEMA,
    timeoutMs: config.timeoutMs,
    baseUrl: config.baseUrl,
    model: config.model,
    retries: config.retries,
    logLabel: '[creator-notes-ai]',
  });

  return parseCreatorNotesOutput(content, {
    knownCreatorName: input.transcript.creatorName,
    segmentCount: input.transcript.segments.length,
  });
}
