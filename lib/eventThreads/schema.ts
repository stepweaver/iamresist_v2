import {
  EVENT_THREAD_CONFIDENCE_VALUES,
  EVENT_THREAD_ENTRY_KINDS,
  EVENT_THREAD_RESOLUTION_TYPES,
  EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS,
  EVENT_THREADS_TITLE_MAX_CHARS,
} from '@/lib/eventThreads/constants';

/**
 * Ollama format schema for one-note contextual resolution.
 * Application-side parse/validate remains the source of truth.
 */
export const EVENT_THREADS_RESOLVE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    resolvedText: {
      type: 'string',
      minLength: 1,
      maxLength: EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS,
    },
    resolutionType: { type: 'string' },
    entryKind: { type: 'string' },
    confidence: { type: 'string' },
    proposedThreadTitle: { type: 'string', maxLength: EVENT_THREADS_TITLE_MAX_CHARS },
  },
  required: ['resolvedText', 'resolutionType', 'entryKind', 'confidence'],
  additionalProperties: false,
} as const;

export const EVENT_THREADS_RESOLUTION_TYPE_SET = new Set<string>(EVENT_THREAD_RESOLUTION_TYPES);
export const EVENT_THREADS_ENTRY_KIND_SET = new Set<string>(EVENT_THREAD_ENTRY_KINDS);
export const EVENT_THREADS_CONFIDENCE_SET = new Set<string>(EVENT_THREAD_CONFIDENCE_VALUES);
