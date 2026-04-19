import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { dbEnv } from '@/lib/env/db';
import { computeRelevanceProfile, editorialControlsForDb } from '@/lib/intel/relevance';
import { INTEL_RELEVANCE_RULE_VERSION } from '@/lib/intel/relevanceVersion';
import type {
  DeskLane,
  IngestRunStatus,
  NormalizedItem,
  ProvenanceClass,
  SignalSourceConfig,
} from '@/lib/intel/types';

export function intelDbConfigured(): boolean {
  return Boolean(dbEnv.SUPABASE_URL && dbEnv.SUPABASE_SERVICE_ROLE_KEY);
}

function client() {
  return supabaseAdmin().schema('intel');
}

/**
 * Legacy `intel.source_items.desk_lane` CHECK historically allowed only `osint` | `voices`.
 * Manifest lanes `watchdogs` | `defense_ops` | `indicators` are stored as `osint` on the row;
 * routing uses `intel.sources.desk_lane` via `source_id` filters (see live fetches).
 */
export function denormalizedDeskLaneColumn(manifestLane: DeskLane): 'osint' | 'voices' {
  if (manifestLane === 'voices') return 'voices';
  return 'osint';
}

export async function fetchSourceIdsForDeskLane(deskLane: DeskLane): Promise<string[]> {
  const supabase = client();
  const { data, error } = await supabase.from('sources').select('id').eq('desk_lane', deskLane);
  if (error) throw new Error(`sources ids for desk lane: ${error.message}`);
  const ids: string[] = [];
  for (const row of data ?? []) {
    const id = (row as { id?: string }).id;
    if (typeof id === 'string' && id) ids.push(id);
  }
  return ids;
}

function mergeEditorialNotes(c: SignalSourceConfig): string | null {
  const parts = [c.editorialNotes, c.notes].filter((x): x is string => Boolean(x && String(x).trim()));
  const unique = [...new Set(parts.map((p) => p.trim()))];
  return unique.length ? unique.join(' ') : null;
}

function clampIngestIntervalMinutes(raw: number | undefined): number {
  const n = raw == null || !Number.isFinite(raw) ? 30 : Math.round(raw);
  return Math.min(1440, Math.max(5, n));
}

export async function syncIntelSourcesFromManifest(
  configs: SignalSourceConfig[],
): Promise<Map<string, string>> {
  const rows = configs.map((c) => ({
    slug: c.slug,
    name: c.name,
    provenance_class: c.provenanceClass,
    fetch_kind: c.fetchKind,
    desk_lane: c.deskLane,
    source_family: c.sourceFamily,
    content_use_mode: c.contentUseMode,
    ingest_interval_minutes: clampIngestIntervalMinutes(c.ingestIntervalMinutes),
    endpoint_url: c.endpointUrl,
    is_enabled: c.isEnabled,
    purpose: c.purpose,
    trusted_for: c.trustedFor,
    not_trusted_for: c.notTrustedFor,
    editorial_notes: mergeEditorialNotes(c),
    is_core_source: c.isCoreSource,
    trust_warning_mode: c.trustWarningMode,
    trust_warning_level: c.trustWarningLevel,
    requires_independent_verification: c.requiresIndependentVerification,
    hero_eligibility_mode: c.heroEligibilityMode,
    trust_warning_text: c.trustWarningText ?? null,
    editorial_controls: editorialControlsForDb(c),
    updated_at: new Date().toISOString(),
  }));

  const supabase = client();
  const { error } = await supabase.from('sources').upsert(rows, { onConflict: 'slug' });
  if (error) throw new Error(`intel.sources upsert: ${error.message}`);

  const slugs = configs.map((c) => c.slug);
  const { data, error: selErr } = await supabase
    .from('sources')
    .select('id, slug')
    .in('slug', slugs);
  if (selErr) throw new Error(`intel.sources select: ${selErr.message}`);

  const map = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.slug && r.id) map.set(r.slug, r.id);
  }
  return map;
}

export type SourceIngestScheduleRow = {
  id: string;
  slug: string;
  next_ingest_at: string | null;
  ingest_interval_minutes: number;
  last_ingest_content_fingerprint: string | null;
};

export async function fetchIngestSchedulesForSlugs(
  slugs: string[],
): Promise<Map<string, SourceIngestScheduleRow>> {
  if (slugs.length === 0) return new Map();
  const supabase = client();
  const { data, error } = await supabase
    .from('sources')
    .select('id, slug, next_ingest_at, ingest_interval_minutes, last_ingest_content_fingerprint')
    .in('slug', slugs);
  if (error) throw new Error(`intel.sources schedule select: ${error.message}`);
  const map = new Map<string, SourceIngestScheduleRow>();
  for (const r of data ?? []) {
    if (r.slug && r.id) {
      map.set(r.slug, r as SourceIngestScheduleRow);
    }
  }
  return map;
}

export async function updateSourceIngestSchedule(
  sourceId: string,
  patch: {
    next_ingest_at: string;
    last_ingest_content_fingerprint?: string | null;
  },
): Promise<void> {
  const supabase = client();
  const row: Record<string, unknown> = {
    next_ingest_at: patch.next_ingest_at,
    updated_at: new Date().toISOString(),
  };
  if (patch.last_ingest_content_fingerprint !== undefined) {
    row.last_ingest_content_fingerprint = patch.last_ingest_content_fingerprint;
  }
  const { error } = await supabase.from('sources').update(row).eq('id', sourceId);
  if (error) throw new Error(`intel.sources schedule update: ${error.message}`);
}

export async function startIngestRun(sourceId: string): Promise<string> {
  const supabase = client();
  const { data, error } = await supabase
    .from('ingest_runs')
    .insert({
      source_id: sourceId,
      status: 'running',
      items_upserted: 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(`ingest_runs insert: ${error.message}`);
  return data.id as string;
}

export async function finishIngestRun(
  runId: string,
  status: IngestRunStatus,
  itemsUpserted: number,
  errorMessage: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from('ingest_runs')
    .update({
      finished_at: new Date().toISOString(),
      status,
      items_upserted: itemsUpserted,
      error_message: errorMessage,
      meta,
    })
    .eq('id', runId);
  if (error) throw new Error(`ingest_runs update: ${error.message}`);
}

/**
 * Upserts in batches. Return value is the number of rows sent in upsert requests
 * (attempted touches), not Postgres "rows affected".
 */
export async function upsertSourceItems(
  sourceId: string,
  items: NormalizedItem[],
  sourceCfg: SignalSourceConfig,
): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = client();
  const now = new Date().toISOString();
  const rows = items.map((it) => {
    const rel = computeRelevanceProfile(it, sourceCfg);
    return {
      source_id: sourceId,
      external_id: it.externalId,
      canonical_url: it.canonicalUrl,
      title: it.title,
      summary: it.summary,
      published_at: it.publishedAt,
      image_url: it.imageUrl,
      fetched_at: now,
      content_hash: it.contentHash,
      structured: it.structured,
      cluster_keys: it.clusterKeys,
      state_change_type: it.stateChangeType,
      desk_lane: denormalizedDeskLaneColumn(sourceCfg.deskLane),
      content_use_mode: sourceCfg.contentUseMode,
      mission_tags: rel.mission_tags,
      branch_of_government: rel.branch_of_government,
      institutional_area: rel.institutional_area,
      relevance_score: rel.relevance_score,
      surface_state: rel.surface_state,
      suppression_reason: rel.suppression_reason,
      relevance_explanations: rel.relevance_explanations,
      relevance_computed_at: now,
      relevance_rule_version: INTEL_RELEVANCE_RULE_VERSION,
      indicator_class: sourceCfg.indicatorClass ?? null,
    };
  });

  const chunkSize = 40;
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('source_items').upsert(chunk, {
      onConflict: 'source_id,canonical_url',
    });
    if (error) throw new Error(`source_items upsert: ${error.message}`);
    total += chunk.length;
  }
  return total;
}

export type SourceItemRow = {
  id: string;
  title: string;
  summary: string | null;
  canonical_url: string;
  published_at: string | null;
  fetched_at: string;
  desk_lane: DeskLane;
  content_use_mode: string;
  cluster_keys: Record<string, string>;
  state_change_type: string;
  mission_tags: string[];
  branch_of_government: string;
  institutional_area: string;
  relevance_score: number;
  surface_state: string;
  suppression_reason: string | null;
  relevance_explanations: unknown;
  sources: {
    slug: string;
    name: string;
    provenance_class: ProvenanceClass;
    desk_lane?: DeskLane | null;
    source_family?: string | null;
    trust_warning_mode?: string | null;
    trust_warning_level?: string | null;
    requires_independent_verification?: boolean | null;
    hero_eligibility_mode?: string | null;
    trust_warning_text?: string | null;
  } | null;
  indicator_class?: string | null;
};

const SOURCE_ITEMS_LIVE_SELECT = `
      id,
      title,
      summary,
      canonical_url,
      image_url,
      published_at,
      fetched_at,
      desk_lane,
      content_use_mode,
      cluster_keys,
      state_change_type,
      mission_tags,
      branch_of_government,
      institutional_area,
      relevance_score,
      surface_state,
      suppression_reason,
      relevance_explanations,
      indicator_class,
      sources (
        slug,
        name,
        provenance_class,
        desk_lane,
        source_family,
        trust_warning_mode,
        trust_warning_level,
        requires_independent_verification,
        hero_eligibility_mode,
        trust_warning_text
      )
    `;

/** Surfaced rows only, newest first — avoids suppressed rows consuming the desk fetch budget. */
async function fetchSurfacedNewestForLive(limit: number, deskLane: DeskLane): Promise<SourceItemRow[]> {
  const supabase = client();
  const laneSourceIds = await fetchSourceIdsForDeskLane(deskLane);
  if (laneSourceIds.length === 0) return [];

  const { data, error } = await supabase
    .from('source_items')
    .select(SOURCE_ITEMS_LIVE_SELECT)
    .eq('surface_state', 'surfaced')
    .in('source_id', laneSourceIds)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`source_items surfaced select: ${error.message}`);
  return (data ?? []) as SourceItemRow[];
}

/** Surfaced rows ordered by ingest relevance score (widens ranking candidate pool vs recency-only). */
async function fetchSurfacedTopRelevanceForLive(limit: number, deskLane: DeskLane): Promise<SourceItemRow[]> {
  const supabase = client();
  const laneSourceIds = await fetchSourceIdsForDeskLane(deskLane);
  if (laneSourceIds.length === 0) return [];

  const { data, error } = await supabase
    .from('source_items')
    .select(SOURCE_ITEMS_LIVE_SELECT)
    .eq('surface_state', 'surfaced')
    .in('source_id', laneSourceIds)
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`source_items surfaced relevance select: ${error.message}`);
  return (data ?? []) as SourceItemRow[];
}

/**
 * Union of newest-first + highest-relevance surfaced rows (deduped by id) so desk ranking
 * is not limited to the most recent `limit` items only.
 */
export async function fetchSurfacedSourceItemsForLive(
  limit: number,
  deskLane: DeskLane,
): Promise<SourceItemRow[]> {
  const [newest, byRel] = await Promise.all([
    fetchSurfacedNewestForLive(limit, deskLane),
    fetchSurfacedTopRelevanceForLive(limit, deskLane),
  ]);
  const byId = new Map<string, SourceItemRow>();
  for (const r of newest) {
    byId.set(r.id, r);
  }
  for (const r of byRel) {
    byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

/** Small secondary pool for downranked items (still on default surface, sorted after surfaced). */
export async function fetchDownrankedSourceItemsForLive(
  limit: number,
  deskLane: DeskLane,
): Promise<SourceItemRow[]> {
  if (limit <= 0) return [];
  const supabase = client();
  const laneSourceIds = await fetchSourceIdsForDeskLane(deskLane);
  if (laneSourceIds.length === 0) return [];

  const { data, error } = await supabase
    .from('source_items')
    .select(SOURCE_ITEMS_LIVE_SELECT)
    .eq('surface_state', 'downranked')
    .in('source_id', laneSourceIds)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`source_items downranked select: ${error.message}`);
  return (data ?? []) as SourceItemRow[];
}

/** Suppressed-only fetch for the disclosure section (separate query, tight limit). */
export async function fetchSuppressedSourceItemsForLive(
  limit: number,
  deskLane: DeskLane,
): Promise<SourceItemRow[]> {
  const supabase = client();
  const laneSourceIds = await fetchSourceIdsForDeskLane(deskLane);
  if (laneSourceIds.length === 0) return [];

  const { data, error } = await supabase
    .from('source_items')
    .select(SOURCE_ITEMS_LIVE_SELECT)
    .eq('surface_state', 'suppressed')
    .in('source_id', laneSourceIds)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`source_items suppressed select: ${error.message}`);
  return (data ?? []) as SourceItemRow[];
}

export type IntelFreshness = {
  latestFetchedAt: string | null;
  latestSuccessfulIngestAt: string | null;
};

export async function fetchIntelFreshnessSnapshot(): Promise<IntelFreshness> {
  const supabase = client();

  const [itemsRes, runsRes] = await Promise.all([
    supabase.from('source_items').select('fetched_at').order('fetched_at', { ascending: false }).limit(1),
    supabase
      .from('ingest_runs')
      .select('finished_at')
      .eq('status', 'success')
      .order('finished_at', { ascending: false, nullsFirst: false })
      .limit(1),
  ]);

  if (itemsRes.error) {
    throw new Error(`source_items freshness select: ${itemsRes.error.message}`);
  }
  if (runsRes.error) {
    throw new Error(`ingest_runs freshness select: ${runsRes.error.message}`);
  }

  return {
    latestFetchedAt: (itemsRes.data?.[0]?.fetched_at as string) ?? null,
    latestSuccessfulIngestAt: (runsRes.data?.[0]?.finished_at as string) ?? null,
  };
}

/** Freshness scoped to one desk lane (items + ingest runs for sources in that lane). */
export async function fetchIntelFreshnessForDeskLane(deskLane: DeskLane): Promise<IntelFreshness> {
  const supabase = client();

  const { data: laneSources, error: srcErr } = await supabase
    .from('sources')
    .select('id')
    .eq('desk_lane', deskLane);
  if (srcErr) throw new Error(`sources lane select: ${srcErr.message}`);
  const ids: string[] = [];
  for (const row of laneSources ?? []) {
    const rec = row as { id?: string | null };
    if (typeof rec.id === 'string' && rec.id) ids.push(rec.id);
  }

  let itemRows: { fetched_at?: string }[] | null = null;
  let itemErr: { message: string } | null = null;
  if (ids.length > 0) {
    const res = await supabase
      .from('source_items')
      .select('fetched_at')
      .in('source_id', ids)
      .order('fetched_at', { ascending: false })
      .limit(1);
    itemRows = res.data;
    itemErr = res.error;
  }
  if (itemErr) throw new Error(`source_items lane freshness: ${itemErr.message}`);

  let latestSuccessfulIngestAt: string | null = null;
  if (ids.length > 0) {
    const { data: runRows, error: runErr } = await supabase
      .from('ingest_runs')
      .select('finished_at')
      .eq('status', 'success')
      .in('source_id', ids)
      .order('finished_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (runErr) throw new Error(`ingest_runs lane freshness: ${runErr.message}`);
    latestSuccessfulIngestAt = (runRows?.[0]?.finished_at as string) ?? null;
  }

  return {
    latestFetchedAt: (itemRows?.[0]?.fetched_at as string) ?? null,
    latestSuccessfulIngestAt,
  };
}


export type IntelFreshnessMeta = {
  thresholdMinutes: number;
  latestFetchedAgeMinutes: number | null;
  latestSuccessAgeMinutes: number | null;
  staleReason: string | null;
  deskState: 'fresh' | 'stale' | 'snapshot';
};

export type LiveDeskSnapshotPayload = {
  items: unknown[];
  preCapCandidates?: unknown[];
  suppressedItems?: unknown[];
  duplicateItems?: unknown[];
  leadItems?: unknown[];
  secondaryLeadItems?: unknown[];
  metadataOnlyItems?: unknown[];
  freshness: IntelFreshness | null;
  freshnessMeta?: IntelFreshnessMeta | null;
};

/** `1` OSINT, `2` Voices, `3` Watchdogs, `4` Defense ops, `5` Indicators, `6` Statements — see intel migrations. */
export type LiveDeskSnapshotId = 1 | 2 | 3 | 4 | 5 | 6;

export async function saveLiveDeskSnapshot(
  snapshotId: LiveDeskSnapshotId,
  payload: LiveDeskSnapshotPayload,
): Promise<void> {
  const supabase = client();
  const { error } = await supabase.from('live_desk_snapshot').upsert(
    {
      id: snapshotId,
      payload: JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`live_desk_snapshot upsert: ${error.message}`);
}

export async function loadLiveDeskSnapshot(
  snapshotId: LiveDeskSnapshotId,
): Promise<LiveDeskSnapshotPayload | null> {
  const supabase = client();
  const { data, error } = await supabase
    .from('live_desk_snapshot')
    .select('payload')
    .eq('id', snapshotId)
    .maybeSingle();
  if (error) throw new Error(`live_desk_snapshot select: ${error.message}`);
  const raw = data?.payload;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const items = Array.isArray(p.items) ? p.items : [];
  const preCapCandidates = Array.isArray(p.preCapCandidates) ? p.preCapCandidates : [];
  const suppressedItems = Array.isArray(p.suppressedItems) ? p.suppressedItems : [];
  const duplicateItems = Array.isArray(p.duplicateItems) ? p.duplicateItems : [];
  const leadItems = Array.isArray(p.leadItems) ? p.leadItems : [];
  const secondaryLeadItems = Array.isArray(p.secondaryLeadItems) ? p.secondaryLeadItems : [];
  const metadataOnlyItems = Array.isArray(p.metadataOnlyItems) ? p.metadataOnlyItems : [];
  const freshness =
    p.freshness && typeof p.freshness === 'object' && !Array.isArray(p.freshness)
      ? (p.freshness as IntelFreshness)
      : null;
  const freshnessMeta =
    p.freshnessMeta && typeof p.freshnessMeta === 'object' && !Array.isArray(p.freshnessMeta)
      ? (p.freshnessMeta as IntelFreshnessMeta)
      : null;
  return {
    items,
    preCapCandidates,
    suppressedItems,
    duplicateItems,
    leadItems,
    secondaryLeadItems,
    metadataOnlyItems,
    freshness,
    freshnessMeta,
  };
}

export type IntelSourceRegistryRow = {
  id: string;
  slug: string;
  name: string;
  provenance_class: string;
  fetch_kind: string;
  desk_lane: DeskLane;
  source_family?: string;
  content_use_mode: string;
  endpoint_url: string | null;
  is_enabled: boolean;
  purpose: string | null;
  trusted_for: string | null;
  not_trusted_for: string | null;
  editorial_notes: string | null;
  is_core_source: boolean;
  editorial_controls: Record<string, unknown> | null;
  trust_warning_mode?: string | null;
  trust_warning_level?: string | null;
  requires_independent_verification?: boolean | null;
  hero_eligibility_mode?: string | null;
  trust_warning_text?: string | null;
};

export async function fetchIntelSourcesRegistry(): Promise<IntelSourceRegistryRow[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from('sources')
    .select(
      'id, slug, name, provenance_class, fetch_kind, desk_lane, source_family, content_use_mode, endpoint_url, is_enabled, purpose, trusted_for, not_trusted_for, editorial_notes, is_core_source, editorial_controls, trust_warning_mode, trust_warning_level, requires_independent_verification, hero_eligibility_mode, trust_warning_text',
    )
    .order('slug');
  if (error) throw new Error(`intel.sources registry: ${error.message}`);
  return (data ?? []) as IntelSourceRegistryRow[];
}

export type SourceItemStatsRpcRow = {
  source_id: string;
  item_total: number;
  items_24h: number;
  items_7d: number;
  last_item_fetched_at: string | null;
};

export type SourceItemSurfacingStatsRpcRow = {
  source_id: string;
  item_total: number;
  items_24h: number;
  items_7d: number;
  last_item_fetched_at: string | null;
  surfaced_total: number;
  downranked_total: number;
  suppressed_total: number;
  surfaced_7d: number;
  downranked_7d: number;
  suppressed_7d: number;
  items_never_scored_total: number;
  items_rule_stale_total: number;
};

export async function fetchSourceItemStatsAggregates(): Promise<SourceItemStatsRpcRow[]> {
  const supabase = client();
  const { data, error } = await supabase.rpc('source_item_stats');
  if (error) {
    console.warn('[intel] source_item_stats RPC:', error.message);
    return [];
  }
  return (data ?? []) as SourceItemStatsRpcRow[];
}

export async function fetchSourceItemSurfacingStatsAggregates(): Promise<SourceItemSurfacingStatsRpcRow[]> {
  const supabase = client();
  const { data, error } = await supabase.rpc('source_item_surfacing_stats', {
    expected_rule_version: INTEL_RELEVANCE_RULE_VERSION,
  });
  if (error) {
    console.warn('[intel] source_item_surfacing_stats RPC:', error.message);
    return [];
  }
  return (data ?? []) as SourceItemSurfacingStatsRpcRow[];
}

export type IngestRunAuditRow = {
  source_id: string;
  status: IngestRunStatus;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  meta: Record<string, unknown> | null;
};

export async function fetchRecentIngestRunsForAudit(limit = 500): Promise<IngestRunAuditRow[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from('ingest_runs')
    .select('source_id, status, started_at, finished_at, error_message, meta')
    .not('source_id', 'is', null)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`ingest_runs audit: ${error.message}`);
  return (data ?? []) as IngestRunAuditRow[];
}
