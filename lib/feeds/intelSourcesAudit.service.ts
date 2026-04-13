import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  fetchIntelSourcesRegistry,
  fetchRecentIngestRunsForAudit,
  fetchSourceItemSurfacingStatsAggregates,
  intelDbConfigured,
} from '@/lib/intel/db';
import type { IngestRunStatus } from '@/lib/intel/types';

export type SourceHealth = 'healthy' | 'stale' | 'failing' | 'disabled' | 'unproven';

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
  lastRunStatus: IngestRunStatus | null;
  lastRunFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastItemFetchedAt: string | null;
  items24h: number;
  items7d: number;
  itemTotal: number;
  surfacedTotal: number;
  downrankedTotal: number;
  suppressedTotal: number;
  surfaced7d: number;
  downranked7d: number;
  suppressed7d: number;
  health: SourceHealth;
  noiseHint: string | null;
  relevanceNotes: string | null;
  noiseNotes: string | null;
};

function parseStaleMinutes(): number {
  const raw = process.env.INTEL_DESK_STALE_AFTER_MINUTES;
  if (raw == null || String(raw).trim() === '') return 90;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

function isOlderThan(iso: string | null, maxAgeMs: number): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > maxAgeMs;
}

function endpointDisplay(slug: string, url: string | null): string {
  if (!url) {
    if (slug === 'reuters-wire') return 'INTEL_REUTERS_RSS_URL (not set)';
    if (slug === 'ap-wire') return 'INTEL_AP_RSS_URL (not set)';
    return '—';
  }
  if (slug === 'reuters-wire' || slug === 'ap-wire') {
    try {
      const u = new URL(url);
      const path = u.pathname.length > 56 ? `${u.pathname.slice(0, 56)}…` : u.pathname;
      return `${u.protocol}//${u.host}${path}`;
    } catch {
      return 'Wire URL configured';
    }
  }
  return url;
}

function computeHealth(input: {
  isEnabled: boolean;
  lastRunStatus: IngestRunStatus | null;
  lastSuccessAt: string | null;
  lastItemFetchedAt: string | null;
  itemTotal: number;
  items7d: number;
  isCoreSource: boolean;
  staleMs: number;
}): SourceHealth {
  if (!input.isEnabled) return 'disabled';
  if (input.lastRunStatus === 'failed') return 'failing';
  if (!input.lastSuccessAt && input.itemTotal === 0) return 'unproven';
  if (input.isCoreSource && input.itemTotal > 0 && input.items7d === 0) return 'stale';
  if (isOlderThan(input.lastSuccessAt, input.staleMs)) return 'stale';
  if (isOlderThan(input.lastItemFetchedAt, input.staleMs)) return 'stale';
  return 'healthy';
}

async function buildIntelSourcesAudit(): Promise<{
  configured: boolean;
  staleThresholdMinutes: number;
  rows: IntelSourceAuditRow[];
  errorMessage: string | null;
}> {
  if (!intelDbConfigured()) {
    return {
      configured: false,
      staleThresholdMinutes: parseStaleMinutes(),
      rows: [],
      errorMessage: 'Supabase credentials not configured.',
    };
  }

  const staleThresholdMinutes = parseStaleMinutes();
  const staleMs = staleThresholdMinutes * 60 * 1000;

  let registry;
  try {
    registry = await fetchIntelSourcesRegistry();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      configured: true,
      staleThresholdMinutes,
      rows: [],
      errorMessage: msg,
    };
  }

  const [stats, runs] = await Promise.all([
    fetchSourceItemSurfacingStatsAggregates(),
    fetchRecentIngestRunsForAudit(500),
  ]);

  const statsBySource = new Map(
    stats.map((s) => [
      s.source_id,
      {
        itemTotal: Number(s.item_total),
        items24h: Number(s.items_24h),
        items7d: Number(s.items_7d),
        lastItemFetchedAt: s.last_item_fetched_at,
        surfacedTotal: Number(s.surfaced_total),
        downrankedTotal: Number(s.downranked_total),
        suppressedTotal: Number(s.suppressed_total),
        surfaced7d: Number(s.surfaced_7d),
        downranked7d: Number(s.downranked_7d),
        suppressed7d: Number(s.suppressed_7d),
      },
    ]),
  );

  const latestRunBySource = new Map<string, { status: IngestRunStatus; finished_at: string }>();
  const lastSuccessBySource = new Map<string, string>();
  const seenSuccess = new Set<string>();

  for (const r of runs) {
    if (!r.source_id || !r.finished_at) continue;
    if (!latestRunBySource.has(r.source_id)) {
      latestRunBySource.set(r.source_id, { status: r.status, finished_at: r.finished_at });
    }
    if (r.status === 'success' && !seenSuccess.has(r.source_id)) {
      lastSuccessBySource.set(r.source_id, r.finished_at);
      seenSuccess.add(r.source_id);
    }
  }

  const rows: IntelSourceAuditRow[] = registry.map((src) => {
    const st = statsBySource.get(src.id);
    const itemTotal = st?.itemTotal ?? 0;
    const items24h = st?.items24h ?? 0;
    const items7d = st?.items7d ?? 0;
    const lastItemFetchedAt = st?.lastItemFetchedAt ?? null;
    const surfacedTotal = st?.surfacedTotal ?? 0;
    const downrankedTotal = st?.downrankedTotal ?? 0;
    const suppressedTotal = st?.suppressedTotal ?? 0;
    const surfaced7d = st?.surfaced7d ?? 0;
    const downranked7d = st?.downranked7d ?? 0;
    const suppressed7d = st?.suppressed7d ?? 0;

    const ec = src.editorial_controls;
    const noiseNotes =
      ec && typeof ec === 'object' && !Array.isArray(ec) && typeof ec.noiseNotes === 'string'
        ? ec.noiseNotes
        : null;
    const relevanceNotes =
      ec && typeof ec === 'object' && !Array.isArray(ec) && typeof ec.relevanceNotes === 'string'
        ? ec.relevanceNotes
        : null;
    const lr = latestRunBySource.get(src.id);

    const lastRunStatus = lr?.status ?? null;
    const lastRunFinishedAt = lr?.finished_at ?? null;
    const lastSuccessAt = lastSuccessBySource.get(src.id) ?? null;

    const health = computeHealth({
      isEnabled: src.is_enabled,
      lastRunStatus,
      lastSuccessAt,
      lastItemFetchedAt,
      itemTotal,
      items7d,
      isCoreSource: src.is_core_source,
      staleMs,
    });

    return {
      id: src.id,
      slug: src.slug,
      name: src.name,
      provenanceClass: src.provenance_class,
      fetchKind: src.fetch_kind,
      endpointDisplay: endpointDisplay(src.slug, src.endpoint_url),
      isEnabled: src.is_enabled,
      purpose: src.purpose,
      trustedFor: src.trusted_for,
      notTrustedFor: src.not_trusted_for,
      editorialNotes: src.editorial_notes,
      isCoreSource: src.is_core_source,
      lastRunStatus,
      lastRunFinishedAt,
      lastSuccessAt,
      lastItemFetchedAt,
      items24h,
      items7d,
      itemTotal,
      surfacedTotal,
      downrankedTotal,
      suppressedTotal,
      surfaced7d,
      downranked7d,
      suppressed7d,
      health,
      noiseHint: null,
      noiseNotes,
      relevanceNotes,
    };
  });

  const primary24h = rows
    .filter((r) => r.provenanceClass === 'PRIMARY' && r.isEnabled)
    .map((r) => r.items24h)
    .sort((a, b) => a - b);
  const mid = Math.floor(primary24h.length / 2);
  const medianPrimary24h =
    primary24h.length === 0
      ? 0
      : primary24h.length % 2 === 1
        ? primary24h[mid]!
        : (primary24h[mid - 1]! + primary24h[mid]!) / 2;

  for (const r of rows) {
    const hi = Math.max(80, medianPrimary24h * 3);
    if (r.isEnabled && r.items24h > hi && medianPrimary24h > 0) {
      r.noiseHint = `High volume (${r.items24h} in 24h vs ~${Math.round(medianPrimary24h)} median for PRIMARY)`;
    }
    if (r.isEnabled && r.itemTotal > 0 && r.suppressedTotal > r.surfacedTotal) {
      const hint = `More suppressed than surfaced in DB (${r.suppressedTotal} vs ${r.surfacedTotal}); check block rules.`;
      r.noiseHint = r.noiseHint ? `${r.noiseHint} · ${hint}` : hint;
    }
  }

  return {
    configured: true,
    staleThresholdMinutes,
    rows,
    errorMessage: null,
  };
}

export const getIntelSourcesAudit = unstable_cache(buildIntelSourcesAudit, ['intel-sources-audit-v2'], {
  revalidate: 90,
  tags: ['intel-sources'],
});