/**
 * Creator Notes text-inference boundary.
 * Providers invoke a model and return its text. Schema validation, quote
 * checks, and the rest of the deterministic safeguards stay outside this file.
 */

export type CreatorNotesAiConfig = {
  provider: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  keepAlive?: string;
};

export type CreatorNotesHealthCheckResult = {
  ok: boolean;
  reachable: boolean;
  error?: string;
  /** Set when the probe itself was HTTP 429. Absence means the probe was not rate limited. */
  rateLimited?: boolean;
};

export type CreatorNotesChatMessage = {
  role: 'system' | 'user';
  content: string;
};

export const CREATOR_NOTES_SCHEMA_NAMES = {
  notes: 'creator_notes',
  batch: 'creator_notes_batch',
  entailment: 'creator_notes_entailment',
} as const;

export type CreatorNotesSchemaName = (typeof CREATOR_NOTES_SCHEMA_NAMES)[keyof typeof CREATOR_NOTES_SCHEMA_NAMES];

export type CreatorNotesTokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

/**
 * Rate-limit response headers when the provider sent them.
 * Every field stays null when that header is absent.
 */
export type CreatorNotesRateLimitSnapshot = {
  limitRequests: string | null;
  limitTokens: string | null;
  remainingRequests: string | null;
  remainingTokens: string | null;
  resetRequests: string | null;
  resetTokens: string | null;
  retryAfter: string | null;
};

export type CreatorNotesChatJsonRequest = {
  messages: CreatorNotesChatMessage[];
  schema: unknown;
  schemaName: CreatorNotesSchemaName;
  timeoutMs: number;
  model: string;
  logLabel?: string;
};

export type CreatorNotesChatJsonResult = {
  content: string;
  model: string;
  usage: CreatorNotesTokenUsage | null;
  rateLimit: CreatorNotesRateLimitSnapshot | null;
};

export interface CreatorNotesTextProvider {
  readonly name: 'groq' | 'ollama';
  chatJson(request: CreatorNotesChatJsonRequest): Promise<CreatorNotesChatJsonResult>;
  healthCheck(): Promise<CreatorNotesHealthCheckResult>;
}
