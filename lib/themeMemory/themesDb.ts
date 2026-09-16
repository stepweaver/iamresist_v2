import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { intelDbConfigured } from '@/lib/intel/db';
import { THEME_MATCH_LOOKBACK_DAYS } from '@/lib/themeMemory/constants';
import { themeItemKey, type ThemeStore } from '@/lib/themeMemory/store';
import type {
  ThemeDailySignalRecord,
  ThemeItemAnalysisRecord,
  ThemeLifecycle,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';
import type { ThemeSourceSystem } from '@/lib/themeMemory/types';
import { toUtcIso } from '@/lib/themeMemory/windows';

function client() {
  return supabaseAdmin().schema('intel');
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapTheme(row: Record<string, unknown>): ThemeRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    canonical_label: String(row.canonical_label),
    display_headline: row.display_headline == null ? null : String(row.display_headline),
    summary: row.summary == null ? null : String(row.summary),
    first_seen_at: String(row.first_seen_at),
    last_seen_at: String(row.last_seen_at),
    lifecycle_status: row.lifecycle_status as ThemeLifecycle,
    metadata: asObject(row.metadata),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapMembership(row: Record<string, unknown>): ThemeMembershipRecord {
  return {
    id: String(row.id),
    theme_id: String(row.theme_id),
    source_system: row.source_system as ThemeSourceSystem,
    source_slug: String(row.source_slug),
    source_name: String(row.source_name),
    identity_key: String(row.identity_key),
    canonical_url: String(row.canonical_url),
    title: String(row.title),
    summary: row.summary == null ? null : String(row.summary),
    published_at: row.published_at == null ? null : String(row.published_at),
    item_observed_at: String(row.item_observed_at),
    member_role: row.member_role as ThemeMembershipRecord['member_role'],
    membership_confidence: Number(row.membership_confidence),
    membership_method: row.membership_method as ThemeMembershipRecord['membership_method'],
    membership_reasons: asStringArray(row.membership_reasons),
    content_hash: String(row.content_hash),
    classification_version: String(row.classification_version),
    membership_prompt_version: row.membership_prompt_version == null ? null : String(row.membership_prompt_version),
    provenance_class: row.provenance_class == null ? null : String(row.provenance_class),
    desk_lane: row.desk_lane == null ? null : String(row.desk_lane),
    source_family: row.source_family == null ? null : String(row.source_family),
    first_assigned_at: String(row.first_assigned_at),
    last_confirmed_at: String(row.last_confirmed_at),
    metadata: asObject(row.metadata),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSignal(row: Record<string, unknown>): ThemeDailySignalRecord {
  return {
    theme_id: String(row.theme_id),
    signal_date: String(row.signal_date).slice(0, 10),
    creator_count: Number(row.creator_count) || 0,
    creator_item_count: Number(row.creator_item_count) || 0,
    newswire_source_count: Number(row.newswire_source_count) || 0,
    newswire_item_count: Number(row.newswire_item_count) || 0,
    intel_source_count: Number(row.intel_source_count) || 0,
    intel_item_count: Number(row.intel_item_count) || 0,
    primary_source_count: Number(row.primary_source_count) || 0,
    specialist_source_count: Number(row.specialist_source_count) || 0,
    creator_breadth: Number(row.creator_breadth) || 0,
    active_days_7: Number(row.active_days_7) || 0,
    active_days_14: Number(row.active_days_14) || 0,
    active_days_30: Number(row.active_days_30) || 0,
    creator_momentum: Number(row.creator_momentum) || 0,
    evidence_depth: Number(row.evidence_depth) || 0,
    metadata: asObject(row.metadata),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapAnalysis(row: Record<string, unknown>): ThemeItemAnalysisRecord {
  return {
    source_system: row.source_system as ThemeSourceSystem,
    source_slug: String(row.source_slug),
    identity_key: String(row.identity_key),
    content_hash: String(row.content_hash),
    classification_version: String(row.classification_version),
    theme_id: row.theme_id == null ? null : String(row.theme_id),
    decision: row.decision as ThemeItemAnalysisRecord['decision'],
    membership_method: (row.membership_method as ThemeMembershipRecord['membership_method']) ?? null,
    reasons: asStringArray(row.reasons),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const THEME_SELECT =
  'id, slug, canonical_label, display_headline, summary, first_seen_at, last_seen_at, lifecycle_status, metadata, created_at, updated_at';
const MEMBERSHIP_SELECT =
  'id, theme_id, source_system, source_slug, source_name, identity_key, canonical_url, title, summary, published_at, item_observed_at, member_role, membership_confidence, membership_method, membership_reasons, content_hash, classification_version, membership_prompt_version, provenance_class, desk_lane, source_family, first_assigned_at, last_confirmed_at, metadata, created_at, updated_at';
const SIGNAL_SELECT =
  'theme_id, signal_date, creator_count, creator_item_count, newswire_source_count, newswire_item_count, intel_source_count, intel_item_count, primary_source_count, specialist_source_count, creator_breadth, active_days_7, active_days_14, active_days_30, creator_momentum, evidence_depth, metadata, created_at, updated_at';
const ANALYSIS_SELECT =
  'source_system, source_slug, identity_key, content_hash, classification_version, theme_id, decision, membership_method, reasons, created_at, updated_at';

const IN_CHUNK = 100;
/** identity_key values are canonical URLs; PostgREST GET `.in()` must stay under proxy URL limits. */
export const THEME_IDENTITY_IN_CHUNK = 12;

async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => Promise<T[]>,
  chunkSize = IN_CHUNK,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const out: T[] = [];
  const size = Math.max(1, chunkSize);
  for (let i = 0; i < unique.length; i += size) {
    out.push(...(await run(unique.slice(i, i + size))));
  }
  return out;
}

export function createSupabaseThemeStore(opts: {
  lookbackDays?: number;
  now?: Date | string;
} = {}): ThemeStore {
  const lookbackDays = opts.lookbackDays ?? THEME_MATCH_LOOKBACK_DAYS;
  const now = opts.now ? new Date(opts.now) : new Date();
  const lookbackIso = new Date(now.getTime() - lookbackDays * 86400000).toISOString();

  return {
    async listThemes() {
      if (!intelDbConfigured()) return [];
      const { data, error } = await client()
        .from('themes')
        .select(THEME_SELECT)
        .gte('last_seen_at', lookbackIso)
        .order('last_seen_at', { ascending: false });
      if (error) throw new Error(`themes select: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => mapTheme(row));
    },
    async listThemesByIds(ids) {
      if (!intelDbConfigured() || ids.length === 0) return [];
      return selectInChunks(ids, async (chunk) => {
        const { data, error } = await client().from('themes').select(THEME_SELECT).in('id', chunk);
        if (error) throw new Error(`themes by id: ${error.message}`);
        return ((data ?? []) as Record<string, unknown>[]).map((row) => mapTheme(row));
      });
    },
    async upsertTheme(row) {
      if (!intelDbConfigured()) throw new Error('Supabase not configured');
      const { error } = await client().from('themes').upsert(row, { onConflict: 'id' });
      if (error) throw new Error(`themes upsert: ${error.message}`);
      return row;
    },
    async listMemberships(themeIds) {
      if (!intelDbConfigured()) return [];
      let query = client().from('theme_memberships').select(MEMBERSHIP_SELECT);
      if (themeIds && themeIds.length > 0) {
        query = query.in('theme_id', themeIds);
      } else {
        const themes = await this.listThemes();
        const ids = themes.map((theme) => theme.id);
        if (ids.length === 0) return [];
        query = query.in('theme_id', ids);
      }
      const { data, error } = await query.order('item_observed_at', { ascending: false });
      if (error) throw new Error(`theme_memberships select: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => mapMembership(row));
    },
    async getMembershipByItem(input) {
      if (!intelDbConfigured()) return null;
      const { data, error } = await client()
        .from('theme_memberships')
        .select(MEMBERSHIP_SELECT)
        .eq('source_system', input.source_system)
        .eq('source_slug', input.source_slug)
        .eq('identity_key', input.identity_key)
        .maybeSingle();
      if (error) throw new Error(`theme_memberships lookup: ${error.message}`);
      return data ? mapMembership(data as Record<string, unknown>) : null;
    },
    async getMembershipsByItems(items) {
      if (!intelDbConfigured() || items.length === 0) return [];
      const wanted = new Set(items.map((item) => themeItemKey(item)));
      const identityKeys = items.map((item) => item.identity_key).filter(Boolean);
      const rows = await selectInChunks(
        identityKeys,
        async (chunk) => {
          const { data, error } = await client()
            .from('theme_memberships')
            .select(MEMBERSHIP_SELECT)
            .in('identity_key', chunk);
          if (error) throw new Error(`theme_memberships batch lookup: ${error.message}`);
          return ((data ?? []) as Record<string, unknown>[]).map((row) => mapMembership(row));
        },
        THEME_IDENTITY_IN_CHUNK,
      );
      return rows.filter((row) => wanted.has(themeItemKey(row)));
    },
    async upsertMembership(row) {
      if (!intelDbConfigured()) throw new Error('Supabase not configured');
      const { error } = await client()
        .from('theme_memberships')
        .upsert(row, { onConflict: 'source_system,source_slug,identity_key' });
      if (error) throw new Error(`theme_memberships upsert: ${error.message}`);
      return row;
    },
    async listSignals(themeId) {
      if (!intelDbConfigured()) return [];
      let query = client().from('theme_daily_signals').select(SIGNAL_SELECT);
      if (themeId) query = query.eq('theme_id', themeId);
      const { data, error } = await query.order('signal_date', { ascending: false });
      if (error) throw new Error(`theme_daily_signals select: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => mapSignal(row));
    },
    async listSignalsByThemeIds(themeIds) {
      if (!intelDbConfigured() || themeIds.length === 0) return [];
      return selectInChunks(themeIds, async (chunk) => {
        const { data, error } = await client()
          .from('theme_daily_signals')
          .select(SIGNAL_SELECT)
          .in('theme_id', chunk)
          .order('signal_date', { ascending: false });
        if (error) throw new Error(`theme_daily_signals batch select: ${error.message}`);
        return ((data ?? []) as Record<string, unknown>[]).map((row) => mapSignal(row));
      });
    },
    async upsertSignal(row) {
      if (!intelDbConfigured()) throw new Error('Supabase not configured');
      const persistable = {
        theme_id: row.theme_id,
        signal_date: row.signal_date,
        creator_count: row.creator_count,
        creator_item_count: row.creator_item_count,
        newswire_source_count: row.newswire_source_count,
        newswire_item_count: row.newswire_item_count,
        intel_source_count: row.intel_source_count,
        intel_item_count: row.intel_item_count,
        primary_source_count: row.primary_source_count,
        specialist_source_count: row.specialist_source_count,
        creator_breadth: row.creator_breadth,
        active_days_7: row.active_days_7,
        active_days_14: row.active_days_14,
        active_days_30: row.active_days_30,
        creator_momentum: row.creator_momentum,
        evidence_depth: row.evidence_depth,
        metadata: row.metadata ?? {},
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      const { error } = await client()
        .from('theme_daily_signals')
        .upsert(persistable, { onConflict: 'theme_id,signal_date' });
      if (error) throw new Error(`theme_daily_signals upsert: ${error.message}`);
      return row;
    },
    async getAnalysis(input) {
      if (!intelDbConfigured()) return null;
      const { data, error } = await client()
        .from('theme_item_analyses')
        .select(ANALYSIS_SELECT)
        .eq('source_system', input.source_system)
        .eq('source_slug', input.source_slug)
        .eq('identity_key', input.identity_key)
        .maybeSingle();
      if (error) throw new Error(`theme_item_analyses lookup: ${error.message}`);
      return data ? mapAnalysis(data as Record<string, unknown>) : null;
    },
    async upsertAnalysis(row) {
      if (!intelDbConfigured()) throw new Error('Supabase not configured');
      const { error } = await client()
        .from('theme_item_analyses')
        .upsert(row, { onConflict: 'source_system,source_slug,identity_key' });
      if (error) throw new Error(`theme_item_analyses upsert: ${error.message}`);
      return row;
    },
  };
}

async function selectAllPages<T>(run: (from: number, to: number) => Promise<T[]>, pageSize = 500): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const rows = await run(from, from + pageSize - 1);
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/**
 * Unbounded read of persisted themes. Report-only tools should use this
 * instead of the lookback-limited store listing.
 */
export async function listAllThemeRecords(): Promise<ThemeRecord[]> {
  if (!intelDbConfigured()) return [];
  return selectAllPages(async (from, to) => {
    const { data, error } = await client()
      .from('themes')
      .select(THEME_SELECT)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(`themes select all: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => mapTheme(row));
  });
}

/**
 * Unbounded read of persisted memberships. Select-only.
 */
export async function listAllMembershipRecords(): Promise<ThemeMembershipRecord[]> {
  if (!intelDbConfigured()) return [];
  return selectAllPages(async (from, to) => {
    const { data, error } = await client()
      .from('theme_memberships')
      .select(MEMBERSHIP_SELECT)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(`theme_memberships select all: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => mapMembership(row));
  });
}

/**
 * Metadata-only membership update. Used by guarded reclassification apply so
 * identity, title, confidence, method, and historical reasons cannot change.
 */
export async function updateThemeMembershipMetadata(input: {
  id: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}): Promise<void> {
  if (!intelDbConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await client()
    .from('theme_memberships')
    .update({ metadata: input.metadata, updated_at: input.updatedAt })
    .eq('id', input.id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`theme_memberships metadata update: ${error.message}`);
  if (!data) throw new Error(`theme_memberships metadata update: no row ${input.id}`);
}

export function themeLookbackIso(now?: Date | string, days = THEME_MATCH_LOOKBACK_DAYS): string {
  const end = now ? new Date(now) : new Date();
  return toUtcIso(new Date(end.getTime() - days * 86400000)) || new Date().toISOString();
}

export async function pingThemeMemorySchema(): Promise<{ ok: boolean; error?: string }> {
  if (!intelDbConfigured()) {
    return { ok: false, error: 'Supabase not configured' };
  }
  try {
    const { error } = await client().from('themes').select('id').limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
