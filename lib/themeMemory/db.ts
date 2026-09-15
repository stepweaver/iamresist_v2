import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { intelDbConfigured } from '@/lib/intel/db';
import {
  isPersistableObservationSystem,
} from '@/lib/themeMemory/normalize';
import type {
  ThemeCandidateItem,
  ThemeObservationRow,
} from '@/lib/themeMemory/types';
import { THEME_MEMORY_OBSERVATION_QUERY_LIMIT } from '@/lib/themeMemory/types';
import { toUtcIso } from '@/lib/themeMemory/windows';

function client() {
  return supabaseAdmin().schema('intel');
}

function observationToUpsertRow(item: ThemeCandidateItem, fetchedAt: string) {
  return {
    source_system: item.sourceSystem,
    source_slug: item.sourceSlug,
    source_name: item.sourceName,
    identity_key: item.identityKey,
    external_id: item.externalId,
    canonical_url: item.canonicalUrl,
    title: item.title,
    summary: item.summary,
    published_at: item.publishedAt,
    fetched_at: fetchedAt,
    content_hash: item.contentHash,
    role: item.role,
    metadata: item.metadata ?? {},
    updated_at: fetchedAt,
  };
}

/**
 * Idempotent upsert. Re-ingesting the same (system, source, identity) updates
 * title/summary/hash/metadata in place. No article-version history.
 *
 * Return value is rows sent, matching intel.source_items upsert semantics.
 */
export async function upsertThemeObservations(items: ThemeCandidateItem[]): Promise<number> {
  const persistable = items.filter((item) => isPersistableObservationSystem(item.sourceSystem));
  if (persistable.length === 0) return 0;
  if (!intelDbConfigured()) {
    throw new Error('Supabase not configured');
  }

  const now = new Date().toISOString();
  const rows = persistable.map((item) => observationToUpsertRow(item, now));
  const supabase = client();
  const chunkSize = 40;
  let total = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('theme_observations').upsert(chunk, {
      onConflict: 'source_system,source_slug,identity_key',
    });
    if (error) throw new Error(`theme_observations upsert: ${error.message}`);
    total += chunk.length;
  }

  return total;
}

export async function fetchThemeObservationsInWindow(input: {
  start: Date | string;
  end: Date | string;
  limit?: number;
}): Promise<ThemeObservationRow[]> {
  if (!intelDbConfigured()) return [];

  const startIso = toUtcIso(input.start);
  const endIso = toUtcIso(input.end);
  if (!startIso || !endIso) return [];

  const limit = Math.min(
    THEME_MEMORY_OBSERVATION_QUERY_LIMIT,
    Math.max(1, Number(input.limit) || THEME_MEMORY_OBSERVATION_QUERY_LIMIT),
  );

  const supabase = client();
  const pageSize = 500;
  const out: ThemeObservationRow[] = [];
  let from = 0;

  while (out.length < limit) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from('theme_observations')
      .select(
        'id, source_system, source_slug, source_name, identity_key, external_id, canonical_url, title, summary, published_at, fetched_at, content_hash, role, metadata, observed_at, created_at, updated_at',
      )
      .gte('observed_at', startIso)
      .lte('observed_at', endIso)
      .order('observed_at', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error) throw new Error(`theme_observations select: ${error.message}`);
    const rows = (data ?? []) as ThemeObservationRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return out.slice(0, limit);
}

export type ThemeIntelSourceItemRow = {
  id: string;
  external_id: string | null;
  canonical_url: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  fetched_at: string | null;
  content_hash: string | null;
  desk_lane: string | null;
  surface_state: string | null;
  state_change_type: string | null;
  mission_tags: string[] | null;
  cluster_keys: Record<string, string> | null;
  sources: {
    slug: string | null;
    name: string | null;
    provenance_class: string | null;
    desk_lane: string | null;
    source_family: string | null;
  } | null;
};

const INTEL_THEME_SELECT = `
  id,
  external_id,
  canonical_url,
  title,
  summary,
  published_at,
  fetched_at,
  content_hash,
  desk_lane,
  surface_state,
  state_change_type,
  mission_tags,
  cluster_keys,
  sources (
    slug,
    name,
    provenance_class,
    desk_lane,
    source_family
  )
`;

/**
 * Bounded Intel adapter. Time-windowed; does not scan the full source_items table.
 */
export async function fetchIntelSourceItemsForThemeWindow(input: {
  start: Date | string;
  end: Date | string;
  limit: number;
}): Promise<ThemeIntelSourceItemRow[]> {
  if (!intelDbConfigured()) return [];

  const startIso = toUtcIso(input.start);
  const endIso = toUtcIso(input.end);
  if (!startIso || !endIso) return [];

  const limit = Math.max(1, Math.min(1000, Number(input.limit) || 1000));
  const supabase = client();

  const [publishedRes, fetchedRes] = await Promise.all([
    supabase
      .from('source_items')
      .select(INTEL_THEME_SELECT)
      .gte('published_at', startIso)
      .lte('published_at', endIso)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit),
    supabase
      .from('source_items')
      .select(INTEL_THEME_SELECT)
      .is('published_at', null)
      .gte('fetched_at', startIso)
      .lte('fetched_at', endIso)
      .order('fetched_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(100, limit)),
  ]);

  if (publishedRes.error) throw new Error(`source_items theme select: ${publishedRes.error.message}`);
  if (fetchedRes.error) throw new Error(`source_items theme fetched select: ${fetchedRes.error.message}`);

  const byId = new Map<string, ThemeIntelSourceItemRow>();
  for (const row of [...(publishedRes.data ?? []), ...(fetchedRes.data ?? [])] as ThemeIntelSourceItemRow[]) {
    if (row?.id) byId.set(row.id, row);
  }
  return Array.from(byId.values()).slice(0, limit);
}

export type ThemeObservationStats = {
  total: number;
  oldestObservedAt: string | null;
  newestObservedAt: string | null;
  bySourceSystem: Record<string, number>;
  bySource: Array<{ sourceSystem: string; sourceSlug: string; count: number }>;
};

export async function fetchThemeObservationStats(): Promise<ThemeObservationStats> {
  if (!intelDbConfigured()) {
    return {
      total: 0,
      oldestObservedAt: null,
      newestObservedAt: null,
      bySourceSystem: {},
      bySource: [],
    };
  }

  const supabase = client();

  const [countRes, oldestRes, newestRes, breakdownRes] = await Promise.all([
    supabase.from('theme_observations').select('id', { count: 'exact', head: true }),
    supabase
      .from('theme_observations')
      .select('observed_at')
      .order('observed_at', { ascending: true, nullsFirst: false })
      .limit(1),
    supabase
      .from('theme_observations')
      .select('observed_at')
      .order('observed_at', { ascending: false, nullsFirst: false })
      .limit(1),
    supabase
      .from('theme_observations')
      .select('source_system, source_slug')
      .limit(5000),
  ]);

  if (countRes.error) throw new Error(`theme_observations count: ${countRes.error.message}`);
  if (oldestRes.error) throw new Error(`theme_observations oldest: ${oldestRes.error.message}`);
  if (newestRes.error) throw new Error(`theme_observations newest: ${newestRes.error.message}`);
  if (breakdownRes.error) {
    throw new Error(`theme_observations breakdown: ${breakdownRes.error.message}`);
  }

  const bySourceSystem: Record<string, number> = {};
  const bySourceMap = new Map<string, { sourceSystem: string; sourceSlug: string; count: number }>();

  for (const row of breakdownRes.data ?? []) {
    const sourceSystem = String((row as { source_system?: string }).source_system || 'unknown');
    const sourceSlug = String((row as { source_slug?: string }).source_slug || 'unknown');
    bySourceSystem[sourceSystem] = (bySourceSystem[sourceSystem] || 0) + 1;
    const key = `${sourceSystem}:${sourceSlug}`;
    const current = bySourceMap.get(key) || { sourceSystem, sourceSlug, count: 0 };
    current.count += 1;
    bySourceMap.set(key, current);
  }

  return {
    total: countRes.count ?? 0,
    oldestObservedAt: (oldestRes.data?.[0] as { observed_at?: string } | undefined)?.observed_at ?? null,
    newestObservedAt: (newestRes.data?.[0] as { observed_at?: string } | undefined)?.observed_at ?? null,
    bySourceSystem,
    bySource: Array.from(bySourceMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return `${a.sourceSystem}:${a.sourceSlug}`.localeCompare(`${b.sourceSystem}:${b.sourceSlug}`);
    }),
  };
}

export async function countThemeObservationsInWindow(input: {
  start: Date | string;
  end: Date | string;
}): Promise<number> {
  if (!intelDbConfigured()) return 0;
  const startIso = toUtcIso(input.start);
  const endIso = toUtcIso(input.end);
  if (!startIso || !endIso) return 0;

  const { count, error } = await client()
    .from('theme_observations')
    .select('id', { count: 'exact', head: true })
    .gte('observed_at', startIso)
    .lte('observed_at', endIso);

  if (error) throw new Error(`theme_observations window count: ${error.message}`);
  return count ?? 0;
}

export async function countIntelSourceItemsInWindow(input: {
  start: Date | string;
  end: Date | string;
}): Promise<number> {
  if (!intelDbConfigured()) return 0;
  const startIso = toUtcIso(input.start);
  const endIso = toUtcIso(input.end);
  if (!startIso || !endIso) return 0;

  const { count, error } = await client()
    .from('source_items')
    .select('id', { count: 'exact', head: true })
    .gte('published_at', startIso)
    .lte('published_at', endIso);

  if (error) throw new Error(`source_items window count: ${error.message}`);
  return count ?? 0;
}
