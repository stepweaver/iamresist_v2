import 'server-only';

import type {
  CreatorNotesAiConfig,
  CreatorNotesChatJsonResult,
  CreatorNotesHealthCheckResult,
  CreatorNotesTextProvider,
} from '@/lib/creatorNotes/ai/types';
import { creatorNotesOllamaKeepAlive } from '@/lib/creatorNotes/constants';
import { ollamaChatJson } from '@/lib/themeMemory/ai/ollama';

export async function healthCheckCreatorNotesOllama(
  config: CreatorNotesAiConfig,
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

export function createOllamaCreatorNotesProvider(config: CreatorNotesAiConfig): CreatorNotesTextProvider {
  return {
    name: 'ollama',
    async chatJson(request): Promise<CreatorNotesChatJsonResult> {
      const { content, model } = await ollamaChatJson({
        messages: request.messages,
        format: request.schema,
        timeoutMs: request.timeoutMs,
        baseUrl: config.baseUrl,
        model: request.model || config.model,
        retries: config.retries,
        logLabel: request.logLabel,
        keepAlive: config.keepAlive || creatorNotesOllamaKeepAlive(),
      });
      return { content, model, usage: null, rateLimit: null };
    },
    healthCheck() {
      return healthCheckCreatorNotesOllama(config);
    },
  };
}
