import 'server-only';

import { unstable_cache } from 'next/cache';
import { createHash } from 'node:crypto';
import {
  fetchIntelSourcesRegistry,
  fetchRecentIngestRunsForAudit,
  fetchSourceItemSurfacingStatsAggregates,
  intelDbConfigured,
} from '@/lib/intel/db';
import { getSignalSources } from '@/lib/intel/signal-sources';
import type { IngestRunStatus } from '@/lib/intel/types';
import { INTEL_RELEVANCE_RULE_VERSION } from '@/lib/intel/relevanceVersion';
import { publicAuditPlacement } from '@/lib/feeds/intelSourcesAudit.display';
import {
  classifyIntelSourceAudit,
  isSuccessfulFetchRun,
  isSuccessfulParseRun,
  type SourceHealth,
  type SourceStatusBucket,
} from '@/lib/feeds/intelSourcesAudit.health';

export type { SourceHealth, SourceStatusBucket };

export type IntelSourceAuditRow = {
  id: string;
  slug: string;
  name: string;
  provenanceClass: string;
  fetchKind: string;
  deskLane: string;
  endpointDisplay: string;
  isEnabled: boolean;
  statusBucket: SourceStatusBucket;
  statusDetail: string | null;
  purpose: string | null;
  trustedFor: string | null;
  notTrustedFor: string | null;
  editorialNotes: string | null;
  isCoreSource: boolean;
  lastRunStatus: IngestRunStatus | null;
  lastRunFinishedAt: string | null;
  lastRunError: string | null;
  lastRunMeta: Record<string, unknown> | null;
  lastSuccessAt: string | null;
  /** Latest run that received an HTTP 2xx/3xx body, even if parsing failed. */
  lastSuccessfulFetchAt: string | null;
  /** Latest run whose body parsed, including a valid empty feed. */
  lastSuccessfulParseAt: string | null;
  /** Newest article publication time seen on a successful parse, when the run recorded one. */
  newestArticlePublishedAt: string | null;
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
  healthReason: string | null;
  noiseHint: string | null;
  relevanceNotes: string | null;
  noiseNotes: string | null;
  /** Current `isEnabled` in `signal-sources.ts` (version-controlled manifest). */
  manifestEnabled: boolean;
};

function stableManifestFingerprint(): string {
  const sources = getSignalSources()
    .map((s) => ({
      slug: s.slug,
      isEnabled: s.isEnabled,
      fetchKind: s.fetchKind,
      endpointUrl: s.endpointUrl,
      deskLane: s.deskLane,
      sourceFamily: s.sourceFamily,
      contentUseMode: s.contentUseMode,
      provenanceClass: s.provenanceClass,
      isCoreSource: s.isCoreSource,
      indicatorClass: s.indicatorClass ?? null,
      editorialControls: s.editorialControls ?? null,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const payload = JSON.stringify({
    schema: 'intel-sources-manifest-v1',
    ruleVersion: INTEL_RELEVANCE_RULE_VERSION,
    sources,
  });

  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

export type IntelSourcesBuildInfo = {
  manifestFingerprint: string;
  relevanceRuleVersion: string;
  gitCommitSha: string | null;
  deployment: string | null;
};

function buildInfo(): IntelSourcesBuildInfo {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null;
  const deployment = process.env.VERCEL_URL || process.env.VERCEL_DEPLOYMENT_ID || null;
  return {
    manifestFingerprint: stableManifestFingerprint(),
    relevanceRuleVersion: INTEL_RELEVANCE_RULE_VERSION,
    gitCommitSha: typeof sha === 'string' && sha.trim() ? sha.trim() : null,
    deployment: typeof deployment === 'string' && deployment.trim() ? deployment.trim() : null,
  };
}

function parseStaleMinutes(): number {
  const raw = process.env.INTEL_DESK_STALE_AFTER_MINUTES;
  if (raw == null || String(raw).trim() === '') return 90;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
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

async function buildIntelSourcesAudit(): Promise<{
  configured: boolean;
  staleThresholdMinutes: number;
  rows: IntelSourceAuditRow[];
  errorMessage: string | null;
  build: IntelSourcesBuildInfo;
}> {
  if (!intelDbConfigured()) {
    return {
      configured: false,
      staleThresholdMinutes: parseStaleMinutes(),
      rows: [],
      errorMessage: 'Supabase credentials not configured.',
      build: buildInfo(),
    };
  }

  const staleThresholdMinutes = parseStaleMinutes();

  const manifestBySlug = new Map(getSignalSources().map((c) => [c.slug, c.isEnabled]));

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
      build: buildInfo(),
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

  const latestRunBySource = new Map<
    string,
    { status: IngestRunStatus; finished_at: string; error_message: string | null; meta: Record<string, unknown> | null }
  >();
  const lastSuccessBySource = new Map<string, string>();
  const lastFetchBySource = new Map<string, string>();
  const newestPublishedBySource = new Map<string, string>();
  const seenSuccess = new Set<string>();

  for (const r of runs) {
    if (!r.source_id || !r.finished_at) continue;
    if (!latestRunBySource.has(r.source_id)) {
      latestRunBySource.set(r.source_id, {
        status: r.status,
        finished_at: r.finished_at,
        error_message: r.error_message ?? null,
        meta: r.meta ?? null,
      });
    }
    if (!lastFetchBySource.has(r.source_id) && isSuccessfulFetchRun(r.status, r.meta)) {
      lastFetchBySource.set(r.source_id, r.finished_at);
    }
    if (!seenSuccess.has(r.source_id) && isSuccessfulParseRun(r.status, r.meta, r.error_message)) {
      lastSuccessBySource.set(r.source_id, r.finished_at);
      const newest = r.meta && typeof r.meta.newestPublishedAt === 'string' ? r.meta.newestPublishedAt : null;
      if (newest) newestPublishedBySource.set(r.source_id, newest);
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
    const lastRunError = lr?.error_message ?? null;
    const lastRunMeta = lr?.meta ?? null;
    const lastSuccessAt = lastSuccessBySource.get(src.id) ?? null;
    const lastSuccessfulFetchAt = lastFetchBySource.get(src.id) ?? null;
    const newestArticlePublishedAt = newestPublishedBySource.get(src.id) ?? null;
    const manifestEnabled = manifestBySlug.get(src.slug) ?? false;

    const classified = classifyIntelSourceAudit({
      slug: src.slug,
      manifestEnabled,
      registryEnabled: src.is_enabled,
      fetchKind: src.fetch_kind,
      endpointUrl: src.endpoint_url,
      isCoreSource: src.is_core_source,
      staleThresholdMinutes,
      lastRunStatus,
      lastRunFinishedAt,
      lastRunError,
      lastRunMeta,
      lastSuccessAt,
      lastFetchAt: lastSuccessfulFetchAt,
      newestPublishedAt: newestArticlePublishedAt,
      itemTotal,
      items7d,
    });

    return {
      id: src.id,
      slug: src.slug,
      name: src.name,
      provenanceClass: src.provenance_class,
      fetchKind: src.fetch_kind,
      deskLane: src.desk_lane,
      endpointDisplay: endpointDisplay(src.slug, src.endpoint_url),
      isEnabled: src.is_enabled,
      statusBucket: classified.statusBucket,
      statusDetail: classified.statusDetail,
      manifestEnabled,
      purpose: src.purpose,
      trustedFor: src.trusted_for,
      notTrustedFor: src.not_trusted_for,
      editorialNotes: src.editorial_notes,
      isCoreSource: src.is_core_source,
      lastRunStatus,
      lastRunFinishedAt,
      lastRunError,
      lastRunMeta,
      lastSuccessAt,
      lastSuccessfulFetchAt,
      lastSuccessfulParseAt: lastSuccessAt,
      newestArticlePublishedAt,
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
      health: classified.health,
      healthReason: classified.healthReason,
      noiseHint: null,
      noiseNotes,
      relevanceNotes,
    };
  });

  const activeRows: IntelSourceAuditRow[] = [];
  for (const row of rows) {
    // Upserts do not delete old slugs. Hide registry rows that are no longer in the manifest,
    // plus retired desks and sources that are not enabled.
    if (!manifestBySlug.has(row.slug)) continue;
    const placement = publicAuditPlacement({
      slug: row.slug,
      deskLane: row.deskLane,
      manifestEnabled: row.manifestEnabled,
    });
    if (placement === 'active') activeRows.push(row);
  }

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

  for (const r of activeRows) {
    const hi = Math.max(80, medianPrimary24h * 3);
    if (r.isEnabled && r.items24h > hi && medianPrimary24h > 0) {
      r.noiseHint = `High volume: ${r.items24h} items in 24 hours, against a typical ${Math.round(medianPrimary24h)}.`;
    }
    if (r.isEnabled && r.itemTotal > 0 && r.suppressedTotal > r.surfacedTotal) {
      const hint = `More items were held back than shown (${r.suppressedTotal} held, ${r.surfacedTotal} shown).`;
      r.noiseHint = r.noiseHint ? `${r.noiseHint} · ${hint}` : hint;
    }
  }

  return {
    configured: true,
    staleThresholdMinutes,
    rows: activeRows,
    errorMessage: null,
    build: buildInfo(),
  };
}

export const getIntelSourcesAudit = unstable_cache(buildIntelSourcesAudit, ['intel-sources-audit-v6'], {
  revalidate: 90,
  tags: ['intel-sources'],
});