import {
  CREATOR_NOTES_ACTION_MAX,
  CREATOR_NOTES_ATTRIBUTION_MAX,
  CREATOR_NOTES_EVENT_FEATURE_STRING_MAX,
  CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS,
  CREATOR_NOTES_MAX_ACTORS,
  CREATOR_NOTES_MAX_INSTITUTIONS,
  CREATOR_NOTES_MAX_LOCATIONS,
  CREATOR_NOTES_MAX_REFERENCED_DOCUMENTS,
  CREATOR_NOTES_OBJECT_MAX,
  CREATOR_NOTES_TEXT_MAX_CHARS,
  CREATOR_NOTES_TEXT_MIN_CHARS,
  CREATOR_NOTES_MAX_NOTES_PER_CHUNK_DEFAULT,
} from '@/lib/creatorNotes/constants';

/**
 * Ollama `format` JSON Schema for atomic note extraction.
 * Application-side parseCreatorNotesOutput() remains the source of truth.
 * `kind` is a free string here on purpose: JSON Schema enums / left-to-right
 * GBNF alternations bias constrained decoding toward the first member
 * (`event`). CREATOR_NOTE_KINDS is enforced in application validation with
 * no default/coercion. The prompt lists exact kind strings and few-shot
 * examples instead. The model does not return global transcript segment
 * indexes; the application attaches the evidence window coordinates.
 */
export const CREATOR_NOTES_JSON_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      maxItems: CREATOR_NOTES_MAX_NOTES_PER_CHUNK_DEFAULT,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', minLength: 1, maxLength: 64 },
          startSeconds: { type: 'number', minimum: 0 },
          endSeconds: { type: 'number', minimum: 0 },
          text: {
            type: 'string',
            minLength: CREATOR_NOTES_TEXT_MIN_CHARS,
            maxLength: CREATOR_NOTES_TEXT_MAX_CHARS,
          },
          attribution: { type: 'string', maxLength: CREATOR_NOTES_ATTRIBUTION_MAX },
          referencedSource: { type: 'string', maxLength: CREATOR_NOTES_ATTRIBUTION_MAX },
          quotedSpeaker: { type: 'string', maxLength: CREATOR_NOTES_ATTRIBUTION_MAX },
          sourceQuote: { type: 'string', minLength: 1, maxLength: CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS },
          exactQuote: { type: 'string', maxLength: CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS },
          eventFeatures: {
            type: 'object',
            properties: {
              actors: {
                type: 'array',
                maxItems: CREATOR_NOTES_MAX_ACTORS,
                items: { type: 'string', maxLength: CREATOR_NOTES_EVENT_FEATURE_STRING_MAX },
              },
              action: { type: 'string', maxLength: CREATOR_NOTES_ACTION_MAX },
              object: { type: 'string', maxLength: CREATOR_NOTES_OBJECT_MAX },
              institutions: {
                type: 'array',
                maxItems: CREATOR_NOTES_MAX_INSTITUTIONS,
                items: { type: 'string', maxLength: CREATOR_NOTES_EVENT_FEATURE_STRING_MAX },
              },
              locations: {
                type: 'array',
                maxItems: CREATOR_NOTES_MAX_LOCATIONS,
                items: { type: 'string', maxLength: CREATOR_NOTES_EVENT_FEATURE_STRING_MAX },
              },
              referencedDocuments: {
                type: 'array',
                maxItems: CREATOR_NOTES_MAX_REFERENCED_DOCUMENTS,
                items: { type: 'string', maxLength: CREATOR_NOTES_EVENT_FEATURE_STRING_MAX },
              },
            },
            additionalProperties: false,
          },
        },
        required: ['kind', 'text', 'sourceQuote'],
        additionalProperties: false,
      },
    },
  },
  required: ['notes'],
  additionalProperties: false,
} as const;

const NOTE_ITEM_SCHEMA = CREATOR_NOTES_JSON_SCHEMA.properties.notes.items;

export const CREATOR_NOTES_BATCH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    windows: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          windowId: { type: 'string', minLength: 1, maxLength: 32 },
          notes: {
            type: 'array',
            maxItems: CREATOR_NOTES_MAX_NOTES_PER_CHUNK_DEFAULT,
            items: NOTE_ITEM_SCHEMA,
          },
        },
        required: ['windowId', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['windows'],
  additionalProperties: false,
} as const;
