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

export type SourceHealth = 'healthy' | 'stale' | 'failing' | 'disabled' | 'unproven';

export type SourceStatusBucket =
  | 'enabled_healthy'
  | 'enabled_stale'
  | 'enabled_unproven'
  | 'enabled_failing'
  | 'enabled_blocked'
  | 'enabled_misconfigured'
  | 'enabled_quarantined'
  | 'enabled_parser_mismatch'
  | 'disabled_policy'
  | 'disabled_placeholder'
  | 'disabled_env_gated'
  | 'disabled_other';

export type IntelSourceAuditRow = {
  id: string;
  slug: string;
  name: string;
  provenanceClass: string;
  fetchKind: string;
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

function computeHealthReason(input: {
  health: SourceHealth;
  isCoreSource: boolean;
  staleThresholdMinutes: number;
  lastRunStatus: IngestRunStatus | null;
  lastRunFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastItemFetchedAt: string | null;
  itemTotal: number;
  items7d: number;
  lastRunError: string | null;
  manifestEnabled: boolean;
  registryEnabled: boolean;
  slug: string;
  fetchKind: string;
  endpointUrl: string | null;
}): string | null {
  if (input.health === 'disabled') {
    if (input.manifestEnabled && !input.registryEnabled) {
      return 'Registry out of date — manifest enables this source; run ingest to sync `sources.is_enabled`.';
    }
    if (!input.manifestEnabled) {
      const fk = String(input.fetchKind || '');
      if (fk === 'unsupported' || fk === 'manual') {
        return 'Disabled by policy/quarantine (non-automated source type).';
      }
      if (!input.endpointUrl) {
        if (input.slug === 'reuters-wire') return 'Env-gated: INTEL_REUTERS_RSS_URL not set.';
        if (input.slug === 'ap-wire') return 'Env-gated: INTEL_AP_RSS_URL not set.';
        return 'Placeholder/not wired (no endpoint URL).';
      }
      return 'Disabled in manifest (`isEnabled: false`); not ingested.';
    }
    return 'Not enabled for ingest (registry).';
  }

  if (input.health === 'failing') {
    if (input.lastRunError) return `Latest run failed: ${input.lastRunError}`;
    return 'Latest run failed';
  }

  if (input.health === 'unproven') {
    if (!input.lastRunFinishedAt) return 'No ingest runs recorded yet';
    if (input.lastRunStatus && input.lastRunStatus !== 'success') return 'No successful ingest runs yet';
    return 'No successful ingest runs yet';
  }

  if (input.health === 'stale') {
    if (input.isCoreSource && input.itemTotal > 0 && input.items7d === 0) {
      return 'Core source produced 0 items in the last 7d';
    }
    if (input.lastSuccessAt && isOlderThan(input.lastSuccessAt, input.staleThresholdMinutes * 60 * 1000)) {
      return `Latest successful ingest is older than ${input.staleThresholdMinutes}m`;
    }
    if (input.lastItemFetchedAt && isOlderThan(input.lastItemFetchedAt, input.staleThresholdMinutes * 60 * 1000)) {
      return `Latest item fetch is older than ${input.staleThresholdMinutes}m`;
    }
    return 'Stale (outside freshness threshold)';
  }

  return null;
}

function computeStatusBucket(input: {
  health: SourceHealth;
  slug: string;
  manifestEnabled: boolean;
  registryEnabled: boolean;
  fetchKind: string;
  endpointUrl: string | null;
  lastRunMeta: Record<string, unknown> | null;
}): { bucket: SourceStatusBucket; detail: string | null } {
  if (input.manifestEnabled && input.registryEnabled) {
    if (input.health === 'healthy') return { bucket: 'enabled_healthy', detail: null };
    if (input.health === 'stale') return { bucket: 'enabled_stale', detail: null };
    if (input.health === 'unproven') return { bucket: 'enabled_unproven', detail: null };
    if (input.health === 'failing') {
      const meta = input.lastRunMeta && typeof input.lastRunMeta === 'object' && !Array.isArray(input.lastRunMeta)
        ? input.lastRunMeta
        : null;
      const fc = meta && typeof (meta as any).failureCategory === 'string' ? String((meta as any).failureCategory) : '';
      if (fc === 'http_403') return { bucket: 'enabled_blocked', detail: 'Blocked by source (HTTP 403 / bot protection suspected)' };
      if (fc === 'http_404') return { bucket: 'enabled_misconfigured', detail: 'Endpoint not found (HTTP 404)' };
      if (fc === 'redirect_loop' || fc === 'redirect_count_exceeded') {
        return { bucket: 'enabled_quarantined', detail: 'Redirect instability (loop / excessive redirects)' };
      }
      if (fc === 'feed_non_xml_body') return { bucket: 'enabled_parser_mismatch', detail: 'Non-XML body returned for feed (likely HTML error/interstitial)' };
      if (fc === 'parser_no_entries') return { bucket: 'enabled_parser_mismatch', detail: 'Parser found 0 entries (markup/feed shape changed or empty)' };
      return { bucket: 'enabled_failing', detail: null };
    }
    return { bucket: 'enabled_failing', detail: null };
  }

  // Disabled cases (manifest is the policy truth; registry may lag).
  if (!input.manifestEnabled) {
    const fk = String(input.fetchKind || '');
    const policySlugs = new Set([
      'dvids-sandbox',
      'statements-public-import',
      'statements-rss-sandbox',
      'indicator-pentagon-pizza',
      'uncovering-epstein-network',
    ]);
    if (input.slug === 'reuters-wire') return { bucket: 'disabled_env_gated', detail: 'INTEL_REUTERS_RSS_URL not set' };
    if (input.slug === 'ap-wire') return { bucket: 'disabled_env_gated', detail: 'INTEL_AP_RSS_URL not set' };
    if (policySlugs.has(input.slug) || fk === 'manual') {
      return { bucket: 'disabled_policy', detail: 'Policy/quarantine: not auto-ingested' };
    }
    if (!input.endpointUrl || fk === 'unsupported') {
      return { bucket: 'disabled_placeholder', detail: 'Placeholder/not wired' };
    }
    return { bucket: 'disabled_other', detail: 'Disabled in manifest' };
  }

  if (input.manifestEnabled && !input.registryEnabled) {
    return { bucket: 'disabled_other', detail: 'Registry not yet synced (run ingest)' };
  }

  return { bucket: 'disabled_other', detail: 'Disabled' };
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
  const staleMs = staleThresholdMinutes * 60 * 1000;

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
    const lastRunError = lr?.error_message ?? null;
    const lastRunMeta = lr?.meta ?? null;
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

    const manifestEnabled = manifestBySlug.get(src.slug) ?? false;

    const statusBucket = computeStatusBucket({
      health,
      slug: src.slug,
      manifestEnabled,
      registryEnabled: src.is_enabled,
      fetchKind: src.fetch_kind,
      endpointUrl: src.endpoint_url,
      lastRunMeta,
    });

    const healthReason = computeHealthReason({
      health,
      isCoreSource: src.is_core_source,
      staleThresholdMinutes,
      lastRunStatus,
      lastRunFinishedAt,
      lastSuccessAt,
      lastItemFetchedAt,
      itemTotal,
      items7d,
      lastRunError,
      manifestEnabled,
      registryEnabled: src.is_enabled,
      slug: src.slug,
      fetchKind: src.fetch_kind,
      endpointUrl: src.endpoint_url,
    });

    return {
      id: src.id,
      slug: src.slug,
      name: src.name,
      provenanceClass: src.provenance_class,
      fetchKind: src.fetch_kind,
      endpointDisplay: endpointDisplay(src.slug, src.endpoint_url),
      isEnabled: src.is_enabled,
      statusBucket: statusBucket.bucket,
      statusDetail: statusBucket.detail,
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
      healthReason,
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
    build: buildInfo(),
  };
}

export const getIntelSourcesAudit = unstable_cache(buildIntelSourcesAudit, ['intel-sources-audit-v3'], {
  revalidate: 90,
  tags: ['intel-sources'],
});