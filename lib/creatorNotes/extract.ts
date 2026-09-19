import 'server-only';

import {
  CREATOR_NOTES_DEFAULT_MODEL,
  creatorNotesAiTimeoutMs,
} from '@/lib/creatorNotes/constants';
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
    timeoutMs: creatorNotesAiTimeoutMs(),
    retries: 0,
  };
}

export function isCreatorNotesOllamaTimeout(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code || '') : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'ollama_timeout' || message === 'ollama_timeout' || /ollama_timeout/i.test(message);
}

export function isCreatorNotesTokenRepeatError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /token repeat limit/i.test(message) || /prediction aborted/i.test(message);
}

export function isCreatorNotesConnectionError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code || '') : '';
  const message = error instanceof Error ? error.message : String(error);
  if (/ollama_http_/i.test(code) || /ollama_http_/i.test(message)) return false;
  return (
    /^fetch failed$/i.test(message.trim()) ||
    /ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET|socket hang up/i.test(message)
  );
}

export type CreatorNotesRecoveryReason = 'timeout' | 'token_repeat' | 'connection';

export function creatorNotesRecoveryReason(error: unknown): CreatorNotesRecoveryReason | null {
  if (isCreatorNotesTokenRepeatError(error)) return 'token_repeat';
  if (isCreatorNotesOllamaTimeout(error)) return 'timeout';
  if (isCreatorNotesConnectionError(error)) return 'connection';
  return null;
}

export function isCreatorNotesRecoverableInferenceError(error: unknown): boolean {
  return creatorNotesRecoveryReason(error) != null;
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
  repair?: boolean;
  rejectedKinds?: string[];
}): Promise<CreatorNotesChunkExtractResult> {
  const config = input.config || resolveCreatorNotesAiConfig();
  assertCreatorNotesAiConfigured(config);

  const { content } = await ollamaChatJson({
    messages: buildCreatorNoteMessages({
      transcript: input.transcript,
      chunk: input.chunk,
      chunkCount: input.chunkCount,
      repair: Boolean(input.repair),
      rejectedKinds: input.rejectedKinds,
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
