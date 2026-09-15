import {
  THEME_MAX_HEADLINE_CHARS,
  THEME_MAX_LABEL_CHARS,
  THEME_MAX_REASON_CHARS,
  THEME_MAX_REASONS,
  THEME_MAX_SUMMARY_CHARS,
} from '@/lib/themeMemory/constants';
import { ThemeAIValidationError } from '@/lib/themeMemory/ai/types';
import type { ThemeLabelResult, ThemeMembershipDecision } from '@/lib/themeMemory/themeTypes';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function extractJsonObject(text: string): unknown {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new ThemeAIValidationError('empty_model_output');
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new ThemeAIValidationError('no_json_object');
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new ThemeAIValidationError('json_parse_failed');
  }
}

function boundedString(value: unknown, field: string, max: number, required = true): string {
  if (typeof value !== 'string') {
    throw new ThemeAIValidationError(`${field}_not_string`);
  }
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    if (required) throw new ThemeAIValidationError(`${field}_empty`);
    return '';
  }
  if (cleaned.length > max) {
    throw new ThemeAIValidationError(`${field}_too_long`);
  }
  return cleaned;
}

export function validateMembershipOutput(value: unknown): ThemeMembershipDecision {
  if (!isPlainObject(value)) {
    throw new ThemeAIValidationError('membership_not_object');
  }
  if (typeof value.belongs !== 'boolean') {
    throw new ThemeAIValidationError('belongs_not_boolean');
  }
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)) {
    throw new ThemeAIValidationError('confidence_not_number');
  }
  if (value.confidence < 0 || value.confidence > 1) {
    throw new ThemeAIValidationError('confidence_out_of_range');
  }
  if (!Array.isArray(value.reasons)) {
    throw new ThemeAIValidationError('reasons_not_array');
  }
  if (value.reasons.length > THEME_MAX_REASONS) {
    throw new ThemeAIValidationError('reasons_too_many');
  }
  const reasons: string[] = [];
  for (const reason of value.reasons) {
    if (typeof reason !== 'string') {
      throw new ThemeAIValidationError('reason_not_string');
    }
    const cleaned = reason.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    if (cleaned.length > THEME_MAX_REASON_CHARS) {
      throw new ThemeAIValidationError('reason_too_long');
    }
    reasons.push(cleaned);
  }
  return {
    belongs: value.belongs,
    confidence: Math.round(value.confidence * 1000) / 1000,
    reasons,
  };
}

export function validateThemeLabelOutput(value: unknown): ThemeLabelResult {
  if (!isPlainObject(value)) {
    throw new ThemeAIValidationError('label_not_object');
  }
  return {
    canonicalLabel: boundedString(value.canonicalLabel, 'canonicalLabel', THEME_MAX_LABEL_CHARS),
    headline: boundedString(value.headline, 'headline', THEME_MAX_HEADLINE_CHARS),
    summary: boundedString(value.summary, 'summary', THEME_MAX_SUMMARY_CHARS),
  };
}

export function parseMembershipOutput(text: string): ThemeMembershipDecision {
  return validateMembershipOutput(extractJsonObject(text));
}

export function parseThemeLabelOutput(text: string): ThemeLabelResult {
  return validateThemeLabelOutput(extractJsonObject(text));
}
