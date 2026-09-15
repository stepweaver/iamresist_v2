import { THEME_MEMORY_WINDOW_DAYS, type ThemeMemoryWindow, type ThemeMemoryWindowDays } from '@/lib/themeMemory/types';

function asDate(value: Date | string | number): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function timestampMs(value: Date | string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const date = asDate(value);
  return date ? date.getTime() : null;
}

export function toUtcIso(value: Date | string | number | null | undefined): string | null {
  const date = value == null || value === '' ? null : asDate(value);
  return date ? date.toISOString() : null;
}

export function isTimestampInWindow(
  value: Date | string | number | null | undefined,
  start: Date | string | number,
  end: Date | string | number,
): boolean {
  const t = timestampMs(value);
  const startMs = timestampMs(start);
  const endMs = timestampMs(end);
  if (t == null || startMs == null || endMs == null) return false;
  return t >= startMs && t <= endMs;
}

export function isThemeMemoryWindowDays(value: unknown): value is ThemeMemoryWindowDays {
  return THEME_MEMORY_WINDOW_DAYS.includes(value as ThemeMemoryWindowDays);
}

/**
 * Rolling UTC windows. "7 days" means the last 7 * 24 hours from `now`, not a calendar week.
 */
export function resolveThemeMemoryWindow(input: {
  days?: number;
  start?: Date | string | number | null;
  end?: Date | string | number | null;
  now?: Date | string | number | null;
} = {}): ThemeMemoryWindow {
  const end = asDate(input.end ?? input.now ?? new Date()) ?? new Date();
  if (input.start != null && input.start !== '') {
    const start = asDate(input.start);
    if (!start) throw new Error('Invalid Theme Memory window start');
    return { start, end, days: null };
  }

  const daysRaw = Number(input.days ?? 7);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.round(daysRaw)) : 7;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end, days };
}

export function windowForDays(
  days: ThemeMemoryWindowDays,
  now?: Date | string | number | null,
): ThemeMemoryWindow {
  return resolveThemeMemoryWindow({ days, now });
}
