import 'server-only';

import { unstable_cache } from 'next/cache';
import { client, intelDbConfigured } from '@/lib/intel/db';

export type SourceHealth = 'healthy' | 'stale' | 'failing' | 'disabled' | 'unproven';

type SourceRow = {
  id: string;
  slug: string;
  name: string;
  provenance_class: string;
  fetch_kind: string | null;
  endpoint_url: string | null;
  is_enabled: boolean | null;
  purpose: string | null;
  trusted_for: string | null;
  not_trusted_for: string | null;
  editorial_notes: string | null;
  editorial_controls: Record<string, unknown> | null;
  is_core_source: boolean | null;
};

type IngestRunRow = {
  source_id: string | null;
  status: 'running' | 'success' | 'partial' | 'failed' | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  meta: Record<string, unknown> | null;
};

type SourceItemRow = {
  source_id: string | null;
  fetched_at: string | null;
  surface_state: string | null;
};

export type IntelSourceAuditRow = {
  id: string;
  slug: string;
  name: string;
  provenanceClass: string;
  fetchKind: string;
  endpointDisplay: string;
  isEnabled: boolean;
  purpose: string | null;
  trustedFor: string | null;
  notTrustedFor: string | null;
  editorialNotes: string | null;
  isCoreSource: boolean;
  editorialControls: Record<string, unknown> | null;

  lastRunStatus: 'running' | 'success' | 'partial' | 'failed' | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunError: string | null;
  lastRunMeta: Record<string, unknown> | null;

  lastSuccessAt: string | null;
  lastItemFetchedAt: string | null;

  itemTotal: number;
  items24h: number;
  items7d: number;

  surfacedTotal: number;
  downrankedTotal: number;
  suppressedTotal: number;

  surfaced7d: number;
  downranked7d: number;
  suppressed7d: number;

  health: SourceHealth;
  healthReason: string | null;
};

export type IntelSourcesAuditData = {
  configured: boolean;
  versionLabel: string;
  rows: IntelSourceAuditRow[];
  message: string | null;
};

const STALE_AFTER_MINUTES = Number.parseInt(
  process.env.INTEL_DESK_STALE_AFTER_MINUTES || '90',
  10,
);
const STALE_AFTER_MS = Number.isFinite(STALE_AFTER_MINUTES)
  ? STALE_AFTER_MINUTES * 60 * 1000
  : 90 * 60 * 1000;

function isOlderThan(iso: string | null, maxAgeMs: number): boolean {
  if (!iso) return true;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > maxAgeMs;
}

function endpointDisplay(url: string | null): string {
  if (!url) return '—';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

function healthFromRow(args: {
  isEnabled: boolean;
  lastRunStatus: IntelSourceAuditRow['lastRunStatus'];
  lastSuccessAt: string | null;
  lastItemFetchedAt: string | null;
  itemTotal: number;
  lastRunError: string | null;
}): { health: SourceHealth; healthReason: string | null } {
  const { isEnabled, lastRunStatus, lastSuccessAt, lastItemFetchedAt, itemTotal, lastRunError } =
    args;

  if (!isEnabled) {
    return { health: 'disabled', healthReason: 'Source is disabled in the manifest.' };
  }

  if (!lastRunStatus && itemTotal === 0) {
    return { health: 'unproven', healthReason: 'No ingest run or items yet.' };
  }

  if (lastRunStatus === 'failed' && !lastSuccessAt && itemTotal === 0) {
    return {
      health: 'failing',
      healthReason: lastRunError || 'Latest run failed and this source has never succeeded.',
    };
  }

  const successIsFresh = !isOlderThan(lastSuccessAt, STALE_AFTER_MS);
  const itemFetchIsFresh = !isOlderThan(lastItemFetchedAt, STALE_AFTER_MS);

  if (successIsFresh || itemFetchIsFresh) {
    if (lastRunStatus === 'failed') {
      return {
        health: 'stale',
        healthReason:
          lastRunError || 'Latest run failed, but the source still has relatively recent data.',
      };
    }

    return { health: 'healthy', healthReason: 'Recent success or recent fetched items detected.' };
  }

  if (lastRunStatus === 'failed') {
    return {
      health: 'failing',
      healthReason: lastRunError || 'Latest run failed and the source is stale.',
    };
  }

  return {
    health: 'stale',
    healthReason: `No recent success or fetched items within ${STALE_AFTER_MINUTES} minutes.`,
  };
}

async function buildIntelSourcesAudit(): Promise<IntelSourcesAuditData> {
  if (!intelDbConfigured()) {
    return {
      configured: false,
      versionLabel: process.env.NEXT_PUBLIC_INTEL_RELEVANCE_RULE_VERSION || '—',
      rows: [],
      message: 'Supabase credentials are not configured.',
    };
  }

  const supabase = client();

  const [sourcesRes, runsRes, itemsRes] = await Promise.all([
    supabase
      .from('sources')
      .select(
        'id, slug, name, provenance_class, fetch_kind, endpoint_url, is_enabled, purpose, trusted_for, not_trusted_for, editorial_notes, editorial_controls, is_core_source',
      )
      .order('name', { ascending: true }),
    supabase
      .from('ingest_runs')
      .select('source_id, status, started_at, finished_at, error_message, meta')
      .not('source_id', 'is', null)
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(2000),
    supabase
      .from('source_items')
      .select('source_id, fetched_at, surface_state')
      .order('fetched_at', { ascending: false, nullsFirst: false })
      .limit(10000),
  ]);

  if (sourcesRes.error) {
    throw new Error(`sources audit query failed: ${sourcesRes.error.message}`);
  }
  if (runsRes.error) {
    throw new Error(`ingest_runs audit query failed: ${runsRes.error.message}`);
  }
  if (itemsRes.error) {
    throw new Error(`source_items audit query failed: ${itemsRes.error.message}`);
  }

  const sources = (sourcesRes.data || []) as SourceRow[];
  const runs = (runsRes.data || []) as IngestRunRow[];
  const items = (itemsRes.data || []) as SourceItemRow[];

  const latestRunBySource = new Map<string, IngestRunRow>();
  const latestSuccessBySource = new Map<string, string>();
  const statsBySource = new Map<
    string,
    {
      itemTotal: number;
      items24h: number;
      items7d: number;
      surfacedTotal: number;
      downrankedTotal: number;
      suppressedTotal: number;
      surfaced7d: number;
      downranked7d: number;
      suppressed7d: number;
      lastItemFetchedAt: string | null;
    }
  >();

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;

  for (const run of runs) {
    if (!run.source_id) continue;

    if (!latestRunBySource.has(run.source_id)) {
      latestRunBySource.set(run.source_id, run);
    }

    if (run.status === 'success' && run.finished_at && !latestSuccessBySource.has(run.source_id)) {
      latestSuccessBySource.set(run.source_id, run.finished_at);
    }
  }

  for (const item of items) {
    if (!item.source_id) continue;

    const current =
      statsBySource.get(item.source_id) || {
        itemTotal: 0,
        items24h: 0,
        items7d: 0,
        surfacedTotal: 0,
        downrankedTotal: 0,
        suppressedTotal: 0,
        surfaced7d: 0,
        downranked7d: 0,
        suppressed7d: 0,
        lastItemFetchedAt: null,
      };

    current.itemTotal += 1;

    if (!current.lastItemFetchedAt && item.fetched_at) {
      current.lastItemFetchedAt = item.fetched_at;
    }

    const fetchedMs = item.fetched_at ? new Date(item.fetched_at).getTime() : NaN;
    const is24h = Number.isFinite(fetchedMs) ? now - fetchedMs <= dayMs : false;
    const is7d = Number.isFinite(fetchedMs) ? now - fetchedMs <= weekMs : false;

    if (is24h) current.items24h += 1;
    if (is7d) current.items7d += 1;

    if (item.surface_state === 'surfaced') {
      current.surfacedTotal += 1;
      if (is7d) current.surfaced7d += 1;
    } else if (item.surface_state === 'downranked') {
      current.downrankedTotal += 1;
      if (is7d) current.downranked7d += 1;
    } else if (item.surface_state === 'suppressed') {
      current.suppressedTotal += 1;
      if (is7d) current.suppressed7d += 1;
    }

    statsBySource.set(item.source_id, current);
  }

  const rows: IntelSourceAuditRow[] = sources.map((src) => {
    const latestRun = latestRunBySource.get(src.id) || null;
    const stats =
      statsBySource.get(src.id) || {
        itemTotal: 0,
        items24h: 0,
        items7d: 0,
        surfacedTotal: 0,
        downrankedTotal: 0,
        suppressedTotal: 0,
        surfaced7d: 0,
        downranked7d: 0,
        suppressed7d: 0,
        lastItemFetchedAt: null,
      };

    const lastSuccessAt = latestSuccessBySource.get(src.id) || null;

    const { health, healthReason } = healthFromRow({
      isEnabled: Boolean(src.is_enabled),
      lastRunStatus: latestRun?.status ?? null,
      lastSuccessAt,
      lastItemFetchedAt: stats.lastItemFetchedAt,
      itemTotal: stats.itemTotal,
      lastRunError: latestRun?.error_message ?? null,
    });

    return {
      id: src.id,
      slug: src.slug,
      name: src.name,
      provenanceClass: src.provenance_class,
      fetchKind: src.fetch_kind || 'unknown',
      endpointDisplay: endpointDisplay(src.endpoint_url),
      isEnabled: Boolean(src.is_enabled),
      purpose: src.purpose,
      trustedFor: src.trusted_for,
      notTrustedFor: src.not_trusted_for,
      editorialNotes: src.editorial_notes,
      isCoreSource: Boolean(src.is_core_source),
      editorialControls:
        src.editorial_controls &&
        typeof src.editorial_controls === 'object' &&
        !Array.isArray(src.editorial_controls)
          ? src.editorial_controls
          : null,

      lastRunStatus: latestRun?.status ?? null,
      lastRunStartedAt: latestRun?.started_at ?? null,
      lastRunFinishedAt: latestRun?.finished_at ?? null,
      lastRunError: latestRun?.error_message ?? null,
      lastRunMeta:
        latestRun?.meta && typeof latestRun.meta === 'object' && !Array.isArray(latestRun.meta)
          ? latestRun.meta
          : null,

      lastSuccessAt,
      lastItemFetchedAt: stats.lastItemFetchedAt,

      itemTotal: stats.itemTotal,
      items24h: stats.items24h,
      items7d: stats.items7d,

      surfacedTotal: stats.surfacedTotal,
      downrankedTotal: stats.downrankedTotal,
      suppressedTotal: stats.suppressedTotal,

      surfaced7d: stats.surfaced7d,
      downranked7d: stats.downranked7d,
      suppressed7d: stats.suppressed7d,

      health,
      healthReason,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    configured: true,
    versionLabel: process.env.NEXT_PUBLIC_INTEL_RELEVANCE_RULE_VERSION || '—',
    rows,
    message: null,
  };
}

export const getIntelSourcesAudit = unstable_cache(
  buildIntelSourcesAudit,
  ['intel-sources-audit-v2'],
  {
    revalidate: 60,
    tags: ['intel-sources'],
  },
);