import {
  THEME_MAX_HEADLINE_CHARS,
  THEME_MAX_LABEL_CHARS,
  THEME_MAX_REASON_CHARS,
  THEME_MAX_REASONS,
  THEME_MAX_SUMMARY_CHARS,
} from '@/lib/themeMemory/constants';

/** Structured-output temperature for membership and label generation. */
export const THEME_AI_STRUCTURED_TEMPERATURE = 0;

/**
 * Ollama `format` JSON Schema for membership classification.
 * Application-side parseMembershipOutput() remains the source of truth.
 */
export const THEME_MEMBERSHIP_JSON_SCHEMA = {
  type: 'object',
  properties: {
    belongs: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasons: {
      type: 'array',
      maxItems: THEME_MAX_REASONS,
      items: { type: 'string', maxLength: THEME_MAX_REASON_CHARS },
    },
  },
  required: ['belongs', 'confidence', 'reasons'],
  additionalProperties: false,
} as const;

/**
 * Ollama `format` JSON Schema for theme label generation.
 * Application-side parseThemeLabelOutput() remains the source of truth.
 */
export const THEME_LABEL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    canonicalLabel: { type: 'string', minLength: 1, maxLength: THEME_MAX_LABEL_CHARS },
    headline: { type: 'string', minLength: 1, maxLength: THEME_MAX_HEADLINE_CHARS },
    summary: { type: 'string', minLength: 1, maxLength: THEME_MAX_SUMMARY_CHARS },
  },
  required: ['canonicalLabel', 'headline', 'summary'],
  additionalProperties: false,
} as const;
