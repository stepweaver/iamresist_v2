import { ThemeAIUnavailableError, ThemeAIValidationError } from '@/lib/themeMemory/ai/types';

export const THEME_AI_FAILURE_CATEGORIES = ['validation', 'unavailable', 'unexpected'] as const;
export type ThemeAIFailureCategory = (typeof THEME_AI_FAILURE_CATEGORIES)[number];

export type ThemeAIFailureDiagnostic = {
  category: ThemeAIFailureCategory;
  reason: string;
};

export type ThemeAIFailureCounters = {
  aiFailures: number;
  aiFailureReasons: Record<string, number>;
  aiFailureCategories: Record<ThemeAIFailureCategory, number>;
};

const MAX_DISTINCT_FAILURE_REASONS = 24;
const SAFE_REASON_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function emptyThemeAIFailureCategories(): Record<ThemeAIFailureCategory, number> {
  return { validation: 0, unavailable: 0, unexpected: 0 };
}

function firstSafeToken(raw: string): string | null {
  const token = String(raw || '')
    .trim()
    .split(/[^a-zA-Z0-9_]/)[0];
  if (token && SAFE_REASON_RE.test(token)) return token;
  return null;
}

export function sanitizeThemeAIFailureReason(raw: string, fallback = 'unexpected_error'): string {
  return firstSafeToken(raw) || fallback;
}

function unavailableReason(error: ThemeAIUnavailableError): string {
  const fromCode = firstSafeToken(error.code);
  if (fromCode) return fromCode;
  const message = error.message;
  if (/timeout|abort/i.test(message)) return 'ollama_timeout';
  const http = message.match(/ollama_http_\d+/i);
  if (http) return http[0].toLowerCase();
  return sanitizeThemeAIFailureReason(message, 'ollama_unavailable');
}

function networkUnavailableReason(error: Error): string | null {
  if (error.name === 'AbortError' || /timeout|abort/i.test(error.message)) return 'ollama_timeout';
  if (/ECONNREFUSED/i.test(error.message)) return 'econnrefused';
  if (/ETIMEDOUT/i.test(error.message)) return 'etimedout';
  if (/ENOTFOUND/i.test(error.message)) return 'enotfound';
  if (/network|fetch failed/i.test(error.message)) return 'network_error';
  return null;
}

export function classifyThemeAIFailure(error: unknown): ThemeAIFailureDiagnostic {
  if (error instanceof ThemeAIValidationError) {
    return {
      category: 'validation',
      reason: sanitizeThemeAIFailureReason(error.code || error.message, 'validation_failed'),
    };
  }
  if (error instanceof ThemeAIUnavailableError) {
    return {
      category: 'unavailable',
      reason: unavailableReason(error),
    };
  }
  if (error instanceof Error) {
    const networkReason = networkUnavailableReason(error);
    if (networkReason) {
      return { category: 'unavailable', reason: networkReason };
    }
    return { category: 'unexpected', reason: 'unexpected_error' };
  }
  return { category: 'unexpected', reason: 'unexpected_error' };
}

function incrementReason(reasons: Record<string, number>, reason: string): void {
  if (reasons[reason] != null) {
    reasons[reason] += 1;
    return;
  }
  if (Object.keys(reasons).length >= MAX_DISTINCT_FAILURE_REASONS) {
    reasons.other = (reasons.other || 0) + 1;
    return;
  }
  reasons[reason] = 1;
}

export function recordThemeAIFailure(
  diagnostics: ThemeAIFailureCounters,
  error: unknown,
  logLabel: string,
): ThemeAIFailureDiagnostic {
  const classified = classifyThemeAIFailure(error);
  diagnostics.aiFailures += 1;
  incrementReason(diagnostics.aiFailureReasons, classified.reason);
  diagnostics.aiFailureCategories[classified.category] += 1;
  console.warn(logLabel, { category: classified.category, reason: classified.reason });
  return classified;
}
