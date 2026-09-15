import 'server-only';

import {
  countIntelSourceItemsInWindow,
  countThemeObservationsInWindow,
  fetchThemeObservationStats,
} from '@/lib/themeMemory/db';
import { THEME_MEMORY_WINDOW_DAYS, type ThemeMemoryWindowDays } from '@/lib/themeMemory/types';
import { windowForDays } from '@/lib/themeMemory/windows';

export type ThemeMemoryWindowCounts = {
  observations: number;
  intel: number;
  combined: number;
};

export type ThemeMemoryDiagnostics = {
  observations: {
    total: number;
    oldestObservedAt: string | null;
    newestObservedAt: string | null;
    bySourceSystem: Record<string, number>;
    bySource: Array<{ sourceSystem: string; sourceSlug: string; count: number }>;
  };
  windows: Record<ThemeMemoryWindowDays, ThemeMemoryWindowCounts>;
  generatedAt: string;
};

export async function getThemeMemoryDiagnostics(opts: {
  now?: Date | string | number | null;
} = {}): Promise<ThemeMemoryDiagnostics> {
  const generatedAt = new Date().toISOString();
  const stats = await fetchThemeObservationStats();

  const windows = {} as Record<ThemeMemoryWindowDays, ThemeMemoryWindowCounts>;
  for (const days of THEME_MEMORY_WINDOW_DAYS) {
    const window = windowForDays(days, opts.now);
    const [observations, intel] = await Promise.all([
      countThemeObservationsInWindow(window),
      countIntelSourceItemsInWindow(window),
    ]);
    windows[days] = {
      observations,
      intel,
      combined: observations + intel,
    };
  }

  return {
    observations: {
      total: stats.total,
      oldestObservedAt: stats.oldestObservedAt,
      newestObservedAt: stats.newestObservedAt,
      bySourceSystem: stats.bySourceSystem,
      bySource: stats.bySource,
    },
    windows,
    generatedAt,
  };
}
