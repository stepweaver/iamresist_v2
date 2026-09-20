import 'server-only';

import {
  CREATOR_NOTES_DEFAULT_MODEL,
  CREATOR_NOTES_TRANSPORT_BACKOFF_MS,
  creatorNotesAiTimeoutMs,
} from '@/lib/creatorNotes/constants';
import { buildCreatorNoteBatchMessages, buildCreatorNoteMessages } from '@/lib/creatorNotes/prompt';
import { CREATOR_NOTES_BATCH_JSON_SCHEMA, CREATOR_NOTES_JSON_SCHEMA } from '@/lib/creatorNotes/schema';
import { emptyKindDiagnostics, parseCreatorNotesBatchOutput, parseCreatorNotesOutput } from '@/lib/creatorNotes/validate';
import type {
  CreatorNotesChunkExtractResult,
  CreatorNotesWindowBatchExtractResult,
  CreatorTranscriptChunk,
  CreatorTranscriptInput,
} from '@/lib/creatorNotes/types';
import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { OLLAMA_CHAT_KEEP_ALIVE, ollamaChatJson, probeOllama } from '@/lib/themeMemory/ai/ollama';
import { ThemeAIUnavailableError } from '@/lib/themeMemory/ai/types';

export type CreatorNotesAiConfig = {
  provider: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
};

export type CreatorNotesHealthCheckResult = {
  ok: boolean;
  reachable: boolean;
  error?: string;
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
  const cause =
    typeof error === 'object' && error && 'cause' in error
      ? error.cause instanceof Error
        ? error.cause.message
        : String((error as { cause?: unknown }).cause || '')
      : '';
  const haystack = `${code} ${message} ${cause}`;
  if (/ollama_http_/i.test(haystack)) return false;
  return (
    /^fetch failed$/i.test(message.trim()) ||
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|UND_ERR_CONNECT|UND_ERR_SOCKET|socket hang up/i.test(
      haystack,
    ) ||
    /server unavailable|connection refused|connect econnrefused/i.test(haystack)
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
  const reason = creatorNotesRecoveryReason(error);
  return reason === 'timeout' || reason === 'token_repeat';
}

export function isCreatorNotesTransportFailure(error: unknown): boolean {
  return creatorNotesRecoveryReason(error) === 'connection';
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

export async function healthCheckCreatorNotesOllama(
  config: CreatorNotesAiConfig = resolveCreatorNotesAiConfig(),
): Promise<CreatorNotesHealthCheckResult> {
  const baseUrl = (config.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reachable: true, error: `ollama_http_${res.status}` };
    }
    return { ok: true, reachable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reachable: false, error: message === 'The operation was aborted' ? 'ollama_timeout' : message };
  } finally {
    clearTimeout(timer);
  }
}

export function creatorNotesTransportBackoffMs(): number {
  return CREATOR_NOTES_TRANSPORT_BACKOFF_MS;
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
    keepAlive: OLLAMA_CHAT_KEEP_ALIVE,
  });

  return parseCreatorNotesOutput(content, {
    knownCreatorName: input.transcript.creatorName,
  });
}

export async function extractCreatorNotesWindowBatch(input: {
  transcript: CreatorTranscriptInput;
  windows: CreatorTranscriptChunk[];
  chunkCount: number;
  config?: CreatorNotesAiConfig;
}): Promise<CreatorNotesWindowBatchExtractResult> {
  const config = input.config || resolveCreatorNotesAiConfig();
  assertCreatorNotesAiConfigured(config);
  if (input.windows.length === 0) return { windows: [] };
  if (input.windows.length === 1) {
    const single = await extractCreatorNotesChunk({
      transcript: input.transcript,
      chunk: input.windows[0],
      chunkCount: input.chunkCount,
      config,
    });
    return {
      windows: [
        {
          windowId: input.windows[0].windowId,
          notes: single.notes,
          rejected: single.rejected,
          kindDiagnostics: single.kindDiagnostics || emptyKindDiagnostics(),
        },
      ],
    };
  }

  const expectedWindowIds = input.windows.map((window) => window.windowId);
  const { content } = await ollamaChatJson({
    messages: buildCreatorNoteBatchMessages({
      transcript: input.transcript,
      windows: input.windows,
      chunkCount: input.chunkCount,
    }),
    format: CREATOR_NOTES_BATCH_JSON_SCHEMA,
    timeoutMs: config.timeoutMs,
    baseUrl: config.baseUrl,
    model: config.model,
    retries: config.retries,
    logLabel: '[creator-notes-ai]',
    keepAlive: OLLAMA_CHAT_KEEP_ALIVE,
  });

  return parseCreatorNotesBatchOutput(content, {
    knownCreatorName: input.transcript.creatorName,
    expectedWindowIds,
  });
}
