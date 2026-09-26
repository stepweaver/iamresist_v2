import 'server-only';

import { createCreatorNotesTextProvider, healthCheckCreatorNotesAi } from '@/lib/creatorNotes/ai/provider';
import {
  CREATOR_NOTES_SCHEMA_NAMES,
  type CreatorNotesAiConfig,
  type CreatorNotesChatMessage,
  type CreatorNotesSchemaName,
} from '@/lib/creatorNotes/ai/types';
import { creatorNotesGroqApiKey } from '@/lib/creatorNotes/ai/groq';
import {
  CREATOR_NOTES_GROQ_BASE_URL,
  CREATOR_NOTES_TRANSPORT_BACKOFF_MS,
  creatorNotesAiProvider,
  creatorNotesAiTimeoutMs,
  creatorNotesModelForProvider,
  creatorNotesOllamaKeepAlive,
} from '@/lib/creatorNotes/constants';
import {
  CreatorNotesInferenceError,
  CreatorNotesRateLimitError,
  isCreatorNotesRateLimitError,
} from '@/lib/creatorNotes/errors';
import { buildCreatorNoteBatchMessages, buildCreatorNoteMessages } from '@/lib/creatorNotes/prompt';
import { CREATOR_NOTES_BATCH_JSON_SCHEMA, CREATOR_NOTES_ENTAILMENT_JSON_SCHEMA, CREATOR_NOTES_JSON_SCHEMA } from '@/lib/creatorNotes/schema';
import {
  applyEntailmentItem,
  parseSemanticEntailmentContent,
  type SemanticFailureReason,
} from '@/lib/creatorNotes/semanticFidelity';
import { emptyKindDiagnostics, parseCreatorNotesBatchOutput, parseCreatorNotesOutput } from '@/lib/creatorNotes/validate';
import type {
  CreatorNotesChunkExtractResult,
  CreatorNotesWindowBatchExtractResult,
  CreatorTranscriptChunk,
  CreatorTranscriptInput,
  RawCreatorNote,
} from '@/lib/creatorNotes/types';
import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { probeOllama } from '@/lib/themeMemory/ai/ollama';

export type { CreatorNotesAiConfig, CreatorNotesHealthCheckResult } from '@/lib/creatorNotes/ai/types';
export { healthCheckCreatorNotesOllama } from '@/lib/creatorNotes/ai/ollama';
export { healthCheckCreatorNotesAi };

export function resolveCreatorNotesAiConfig(): CreatorNotesAiConfig {
  const provider = creatorNotesAiProvider(themeMemoryEnv.THEME_AI_PROVIDER);
  const model = creatorNotesModelForProvider(provider, themeMemoryEnv.OLLAMA_MODEL);
  const groq = provider === 'groq';
  return {
    provider,
    model,
    baseUrl: groq ? CREATOR_NOTES_GROQ_BASE_URL : themeMemoryEnv.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    timeoutMs: creatorNotesAiTimeoutMs(),
    retries: 0,
    keepAlive: groq ? undefined : creatorNotesOllamaKeepAlive(),
  };
}

export function isCreatorNotesInferenceTimeout(error: unknown): boolean {
  if (!error || isCreatorNotesRateLimitError(error)) return false;
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code || '') : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === 'ollama_timeout' ||
    code === 'inference_timeout' ||
    message === 'ollama_timeout' ||
    message === 'inference_timeout' ||
    /ollama_timeout|inference_timeout/i.test(message)
  );
}

/** @deprecated Prefer isCreatorNotesInferenceTimeout. Still matches Ollama and provider-neutral timeouts. */
export function isCreatorNotesOllamaTimeout(error: unknown): boolean {
  return isCreatorNotesInferenceTimeout(error);
}

export function isCreatorNotesTokenRepeatError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /token repeat limit/i.test(message) || /prediction aborted/i.test(message);
}

export function isCreatorNotesConnectionError(error: unknown): boolean {
  if (!error || isCreatorNotesRateLimitError(error)) return false;
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
  if (/ollama_http_|provider_http_|groq_http_|groq_auth_failed|groq_api_key_missing|inference_timeout/i.test(haystack)) {
    return false;
  }
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
  if (isCreatorNotesRateLimitError(error)) return null;
  if (isCreatorNotesTokenRepeatError(error)) return 'token_repeat';
  if (isCreatorNotesInferenceTimeout(error)) return 'timeout';
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
  const provider = String(config.provider || '').toLowerCase();
  if (provider !== 'groq' && provider !== 'ollama') {
    throw new CreatorNotesInferenceError(
      provider ? `Unknown CREATOR_NOTES_AI_PROVIDER=${provider}` : 'CREATOR_NOTES_AI_PROVIDER is not configured',
      provider ? 'provider_unknown' : 'provider_not_configured',
      { provider: provider || 'none' },
    );
  }
  if (!config.model) {
    throw new CreatorNotesInferenceError('CREATOR_NOTES_MODEL is not configured', 'model_not_configured', { provider });
  }
  if (provider === 'groq' && !creatorNotesGroqApiKey()) {
    throw new CreatorNotesInferenceError('GROQ_API_KEY is not configured', 'groq_api_key_missing', { provider: 'groq' });
  }
}

export async function warmupCreatorNotesAi(
  config: CreatorNotesAiConfig = resolveCreatorNotesAiConfig(),
): Promise<void> {
  assertCreatorNotesAiConfigured(config);
  if (config.provider === 'ollama') {
    const probe = await probeOllama({
      baseUrl: config.baseUrl,
      model: config.model,
    });
    if (!probe.ok) {
      throw new CreatorNotesInferenceError(
        `Ollama is not ready: ${probe.error || 'unknown error'}`,
        'ollama_not_ready',
        { provider: 'ollama' },
      );
    }
    return;
  }
  const probe = await healthCheckCreatorNotesAi(config);
  if (probe.rateLimited) {
    throw new CreatorNotesRateLimitError(probe.error || 'groq_http_429', { provider: config.provider });
  }
  if (!probe.ok) {
    throw new CreatorNotesInferenceError(
      `Creator Notes provider is not ready: ${probe.error || 'unknown error'}`,
      probe.error || 'provider_not_ready',
      { provider: config.provider },
    );
  }
}

async function invokeCreatorNotesModel(
  config: CreatorNotesAiConfig,
  input: {
    messages: CreatorNotesChatMessage[];
    schema: unknown;
    schemaName: CreatorNotesSchemaName;
    logLabel: string;
  },
): Promise<string> {
  const provider = createCreatorNotesTextProvider(config);
  const result = await provider.chatJson({
    messages: input.messages,
    schema: input.schema,
    schemaName: input.schemaName,
    timeoutMs: config.timeoutMs,
    model: config.model,
    logLabel: input.logLabel,
  });
  // Token usage stays on the provider result for a later telemetry pass. It is not persisted.
  return result.content;
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

  const content = await invokeCreatorNotesModel(config, {
    messages: buildCreatorNoteMessages({
      transcript: input.transcript,
      chunk: input.chunk,
      chunkCount: input.chunkCount,
      repair: Boolean(input.repair),
      rejectedKinds: input.rejectedKinds,
    }),
    schema: CREATOR_NOTES_JSON_SCHEMA,
    schemaName: CREATOR_NOTES_SCHEMA_NAMES.notes,
    logLabel: '[creator-notes-ai]',
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
  repair?: boolean;
}): Promise<CreatorNotesWindowBatchExtractResult> {
  const config = input.config || resolveCreatorNotesAiConfig();
  assertCreatorNotesAiConfigured(config);
  if (input.windows.length === 0) return { windows: [], diagnostics: undefined };
  if (input.windows.length === 1 && !input.repair) {
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
  const content = await invokeCreatorNotesModel(config, {
    messages: buildCreatorNoteBatchMessages({
      transcript: input.transcript,
      windows: input.windows,
      chunkCount: input.chunkCount,
      repair: Boolean(input.repair),
    }),
    schema: CREATOR_NOTES_BATCH_JSON_SCHEMA,
    schemaName: CREATOR_NOTES_SCHEMA_NAMES.batch,
    logLabel: '[creator-notes-ai]',
  });

  return parseCreatorNotesBatchOutput(content, {
    knownCreatorName: input.transcript.creatorName,
    expectedWindowIds,
  });
}

function entailmentMessages(evidenceText: string, notes: RawCreatorNote[]): Array<{ role: 'system' | 'user'; content: string }> {
  const lines = notes.map((note, index) => `${index}\t${note.text}`);
  return [
    {
      role: 'system',
      content: [
        'You check whether each atomic note is semantically entailed by the evidence.',
        'You did not write the notes. Do not defend them.',
        'entailed is true only when subject, object, actor, action, polarity, attribution, quantity, and modality are preserved.',
        'A shared vocabulary is not entailment. Reversed winners, swapped agents, strengthened could/might/may into will/did, and mis-assigned sources are entailed false.',
        'confidence is high only when the decision is unambiguous. Otherwise confidence is low and entailed is false.',
        'correctedNote only when one unambiguous repair is directly supported by the evidence. Otherwise omit it.',
        'Do not explain. Do not include reasoning.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Evidence:\n${evidenceText}\n\nNotes:\n${lines.join('\n')}\n\nReturn JSON {"results":[{"id":"0","entailed":false,"failureReason":"relation_reversed","confidence":"high"}]}`,
    },
  ];
}

export async function entailCreatorNotes(input: {
  evidenceText: string;
  notes: RawCreatorNote[];
  config?: CreatorNotesAiConfig;
}): Promise<{ notes: RawCreatorNote[]; rejections: SemanticFailureReason[] }> {
  const config = input.config || resolveCreatorNotesAiConfig();
  assertCreatorNotesAiConfigured(config);
  if (!input.notes.length) return { notes: [], rejections: [] };
  const content = await invokeCreatorNotesModel(config, {
    messages: entailmentMessages(input.evidenceText, input.notes),
    schema: CREATOR_NOTES_ENTAILMENT_JSON_SCHEMA,
    schemaName: CREATOR_NOTES_SCHEMA_NAMES.entailment,
    logLabel: '[creator-notes-entailment]',
  });
  const items = parseSemanticEntailmentContent(content);
  const notes: RawCreatorNote[] = [];
  const rejections: SemanticFailureReason[] = [];
  input.notes.forEach((note, index) => {
    const item = items?.find((row) => row.id === String(index));
    const applied = applyEntailmentItem(input.evidenceText, note.text, item, {
      quotedSpeaker: note.quotedSpeaker,
    });
    if (!applied.text) {
      rejections.push(applied.failureReason || 'other');
      return;
    }
    notes.push(applied.text === note.text ? note : { ...note, text: applied.text });
  });
  return { notes, rejections };
}
