import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { dbEnv } from '@/lib/env/db';
import type { IngestRunStatus, NormalizedItem, ProvenanceClass, SignalSourceConfig } from '@/lib/intel/types';

export function intelDbConfigured(): boolean {
  return Boolean(dbEnv.SUPABASE_URL && dbEnv.SUPABASE_SERVICE_ROLE_KEY);
}

function client() {
  return supabaseAdmin().schema('intel');
}

export async function syncIntelSourcesFromManifest(
  configs: SignalSourceConfig[],
): Promise<Map<string, string>> {
  const rows = configs.map((c) => ({
    slug: c.slug,
    name: c.name,
    provenance_class: c.provenanceClass,
    fetch_kind: c.fetchKind,
    endpoint_url: c.endpointUrl,
    is_enabled: c.isEnabled,
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
): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = client();
  const now = new Date().toISOString();
  const rows = items.map((it) => ({
    source_id: sourceId,
    external_id: it.externalId,
    canonical_url: it.canonicalUrl,
    title: it.title,
    summary: it.summary,
    published_at: it.publishedAt,
    fetched_at: now,
    content_hash: it.contentHash,
    structured: it.structured,
    cluster_keys: it.clusterKeys,
    state_change_type: it.stateChangeType,
  }));

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
  cluster_keys: Record<string, string>;
  state_change_type: string;
  sources: {
    slug: string;
    name: string;
    provenance_class: ProvenanceClass;
  } | null;
};

export async function fetchRecentSourceItemsForLive(limit = 200): Promise<SourceItemRow[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from('source_items')
    .select(
      `
      id,
      title,
      summary,
      canonical_url,
      published_at,
      fetched_at,
      cluster_keys,
      state_change_type,
      sources (
        slug,
        name,
        provenance_class
      )
    `,
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`source_items select: ${error.message}`);
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

export type LiveDeskSnapshotPayload = {
  items: unknown[];
  freshness: IntelFreshness | null;
};

export async function saveLiveDeskSnapshot(payload: LiveDeskSnapshotPayload): Promise<void> {
  const supabase = client();
  const { error } = await supabase.from('live_desk_snapshot').upsert(
    {
      id: 1,
      payload: JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`live_desk_snapshot upsert: ${error.message}`);
}

export async function loadLiveDeskSnapshot(): Promise<LiveDeskSnapshotPayload | null> {
  const supabase = client();
  const { data, error } = await supabase.from('live_desk_snapshot').select('payload').eq('id', 1).maybeSingle();
  if (error) throw new Error(`live_desk_snapshot select: ${error.message}`);
  const raw = data?.payload;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const items = Array.isArray(p.items) ? p.items : [];
  const freshness =
    p.freshness && typeof p.freshness === 'object' && !Array.isArray(p.freshness)
      ? (p.freshness as IntelFreshness)
      : null;
  return { items, freshness };
}
