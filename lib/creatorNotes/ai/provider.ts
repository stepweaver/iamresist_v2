import type { CreatorNotesAiConfig, CreatorNotesHealthCheckResult, CreatorNotesTextProvider } from '@/lib/creatorNotes/ai/types';
import { createGroqCreatorNotesProvider, healthCheckCreatorNotesGroq } from '@/lib/creatorNotes/ai/groq';
import { createOllamaCreatorNotesProvider, healthCheckCreatorNotesOllama } from '@/lib/creatorNotes/ai/ollama';
import { CreatorNotesInferenceError } from '@/lib/creatorNotes/errors';

export function createCreatorNotesTextProvider(config: CreatorNotesAiConfig): CreatorNotesTextProvider {
  const provider = String(config.provider || '').toLowerCase();
  if (provider === 'groq') return createGroqCreatorNotesProvider(config);
  if (provider === 'ollama') return createOllamaCreatorNotesProvider(config);
  throw new CreatorNotesInferenceError(
    provider ? `Unknown CREATOR_NOTES_AI_PROVIDER=${provider}` : 'CREATOR_NOTES_AI_PROVIDER is not configured',
    provider ? 'provider_unknown' : 'provider_not_configured',
    { provider: provider || 'none' },
  );
}

export async function healthCheckCreatorNotesAi(
  config: CreatorNotesAiConfig,
): Promise<CreatorNotesHealthCheckResult> {
  const provider = String(config.provider || '').toLowerCase();
  if (provider === 'groq') return healthCheckCreatorNotesGroq(config);
  if (provider === 'ollama') return healthCheckCreatorNotesOllama(config);
  return {
    ok: false,
    reachable: false,
    error: provider ? 'provider_unknown' : 'provider_not_configured',
  };
}
