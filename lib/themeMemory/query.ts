import 'server-only';

import {
  countIntelSourceItemsAvailableForThemeWindow,
  fetchIntelSourceItemsForThemeWindow,
  fetchThemeObservationsInWindow,
} from '@/lib/themeMemory/db';
import { THEME_PROCESS_WINDOW_DAYS } from '@/lib/themeMemory/constants';
import {
  measureIntelCandidateSaturation,
  type ThemeIntelCandidateSaturation,
} from '@/lib/themeMemory/intelSaturation';
import {
  normalizeIntelThemeCandidate,
} from '@/lib/themeMemory/normalize';
import {
  THEME_MEMORY_INTEL_CANDIDATE_LIMIT,
  THEME_MEMORY_OBSERVATION_QUERY_LIMIT,
  THEME_MEMORY_WINDOW_DAYS,
  type ThemeCandidateItem,
  type ThemeMemoryWindowDays,
  type ThemeObservationRow,
  type ThemeSourceSystem,
} from '@/lib/themeMemory/types';
import {
  isTimestampInWindow,
  resolveThemeMemoryWindow,
  timestampMs,
  toUtcIso,
} from '@/lib/themeMemory/windows';

function observationToCandidate(row: ThemeObservationRow): ThemeCandidateItem {
  const sourceSystem = row.source_system;
  return {
    id: `${sourceSystem}:${row.source_slug}:${row.identity_key}`,
    sourceSystem,
    sourceSlug: row.source_slug,
    sourceName: row.source_name,
    title: row.title,
    summary: row.summary,
    canonicalUrl: row.canonical_url,
    externalId: row.external_id,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    role: row.role,
    provenanceClass: sourceSystem === 'voice' ? 'COMMENTARY' : null,
    deskLane: sourceSystem === 'voice' ? 'voices' : 'newswire',
    sourceFamily: 'general',
    contentHash: row.content_hash,
    identityKey: row.identity_key,
    metadata: row.metadata ?? {},
  };
}

function sortCandidates(items: ThemeCandidateItem[]): ThemeCandidateItem[] {
  return [...items].sort((a, b) => {
    const tb = timestampMs(b.publishedAt) ?? timestampMs(b.fetchedAt) ?? 0;
    const ta = timestampMs(a.publishedAt) ?? timestampMs(a.fetchedAt) ?? 0;
    if (tb !== ta) return tb - ta;
    return a.id.localeCompare(b.id);
  });
}

export function filterCandidatesByWindow(
  items: ThemeCandidateItem[],
  start: Date | string,
  end: Date | string,
): ThemeCandidateItem[] {
  return items.filter((item) =>
    isTimestampInWindow(item.publishedAt ?? item.fetchedAt, start, end),
  );
}

export async function getThemeCandidateItems(input: {
  start?: Date | string | number | null;
  end?: Date | string | number | null;
  days?: number;
  now?: Date | string | number | null;
  sourceSystems?: ThemeSourceSystem[];
  intelLimit?: number;
  observationLimit?: number;
} = {}): Promise<ThemeCandidateItem[]> {
  const window = resolveThemeMemoryWindow(input);
  const wanted = new Set(
    Array.isArray(input.sourceSystems) && input.sourceSystems.length > 0
      ? input.sourceSystems
      : (['voice', 'newswire', 'intel'] as ThemeSourceSystem[]),
  );

  const observationLimit = Math.min(
    THEME_MEMORY_OBSERVATION_QUERY_LIMIT,
    Math.max(1, Number(input.observationLimit) || THEME_MEMORY_OBSERVATION_QUERY_LIMIT),
  );
  const intelLimit = Math.min(
    THEME_MEMORY_INTEL_CANDIDATE_LIMIT,
    Math.max(1, Number(input.intelLimit) || THEME_MEMORY_INTEL_CANDIDATE_LIMIT),
  );

  const [observationRows, intelRows] = await Promise.all([
    wanted.has('voice') || wanted.has('newswire')
      ? fetchThemeObservationsInWindow({
          start: window.start,
          end: window.end,
          limit: observationLimit,
        })
      : Promise.resolve([]),
    wanted.has('intel')
      ? fetchIntelSourceItemsForThemeWindow({
          start: window.start,
          end: window.end,
          limit: intelLimit,
        })
      : Promise.resolve([]),
  ]);

  const fromObservations = observationRows
    .filter((row) => wanted.has(row.source_system))
    .map(observationToCandidate);

  const fromIntel = intelRows
    .map((row) => normalizeIntelThemeCandidate(row))
    .filter((item): item is ThemeCandidateItem => Boolean(item));

  return sortCandidates(
    filterCandidatesByWindow([...fromObservations, ...fromIntel], window.start, window.end),
  );
}

export async function getThemeCandidateItemsForDays(
  days: ThemeMemoryWindowDays,
  opts: Omit<Parameters<typeof getThemeCandidateItems>[0], 'days'> = {},
): Promise<ThemeCandidateItem[]> {
  return getThemeCandidateItems({ ...opts, days });
}

export async function getThemeCandidateItemsByWindows(opts: {
  now?: Date | string | number | null;
  sourceSystems?: ThemeSourceSystem[];
} = {}): Promise<Record<ThemeMemoryWindowDays, ThemeCandidateItem[]>> {
  const entries = await Promise.all(
    THEME_MEMORY_WINDOW_DAYS.map(async (days) => {
      const items = await getThemeCandidateItemsForDays(days, opts);
      return [days, items] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ThemeMemoryWindowDays, ThemeCandidateItem[]>;
}

export function describeThemeMemoryWindow(input: {
  days?: number;
  start?: Date | string | number | null;
  end?: Date | string | number | null;
  now?: Date | string | number | null;
}): { start: string; end: string; days: number | null } {
  const window = resolveThemeMemoryWindow(input);
  return {
    start: toUtcIso(window.start)!,
    end: toUtcIso(window.end)!,
    days: window.days,
  };
}

/**
 * Intel adapter saturation for the Theme Memory process window.
 * Counts available rows without raising the candidate cap or scanning
 * an unbounded table into processing.
 */
export async function getThemeIntelCandidateSaturation(input: {
  start?: Date | string | number | null;
  end?: Date | string | number | null;
  days?: number;
  now?: Date | string | number | null;
  intelLimit?: number;
} = {}): Promise<ThemeIntelCandidateSaturation> {
  const window = resolveThemeMemoryWindow({
    days: input.days ?? THEME_PROCESS_WINDOW_DAYS,
    start: input.start,
    end: input.end,
    now: input.now,
  });
  const intelLimit = Math.min(
    THEME_MEMORY_INTEL_CANDIDATE_LIMIT,
    Math.max(1, Number(input.intelLimit) || THEME_MEMORY_INTEL_CANDIDATE_LIMIT),
  );
  const [availableInWindow, intelRows] = await Promise.all([
    countIntelSourceItemsAvailableForThemeWindow({
      start: window.start,
      end: window.end,
    }),
    fetchIntelSourceItemsForThemeWindow({
      start: window.start,
      end: window.end,
      limit: intelLimit,
    }),
  ]);
  const selected = intelRows
    .map((row) => normalizeIntelThemeCandidate(row))
    .filter((item): item is ThemeCandidateItem => Boolean(item));
  const inWindow = filterCandidatesByWindow(selected, window.start, window.end);
  return measureIntelCandidateSaturation({
    availableInWindow,
    selected: inWindow,
    fetchedRaw: intelRows.length,
    candidateLimit: intelLimit,
    windowStart: window.start,
    windowEnd: window.end,
  });
}
