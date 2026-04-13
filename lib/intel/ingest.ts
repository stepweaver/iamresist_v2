import 'server-only';

import { applyContentUseModeToSummary } from '@/lib/intel/contentUse';
import { fetchTextNoStore } from '@/lib/intel/fetchText';
import {
  parseFederalRegisterPiJson,
  parseFederalRegisterPublishedJson,
} from '@/lib/intel/frApi';
import { hashNormalizedItem } from '@/lib/intel/hash';
import { parseRssXmlToItems } from '@/lib/intel/parseRss';
import { getSignalSources } from '@/lib/intel/signal-sources';
import {
  finishIngestRun,
  intelDbConfigured,
  startIngestRun,
  syncIntelSourcesFromManifest,
  upsertSourceItems,
} from '@/lib/intel/db';
import type { FetchKind, IngestRunStatus, NormalizedItem, SignalSourceConfig } from '@/lib/intel/types';

const SKIP_DISABLED = 'Skipped (source disabled)';
const SKIP_NO_ENDPOINT = 'Skipped (missing endpoint URL)';
const NON_FETCH_KINDS: FetchKind[] = ['unsupported', 'manual', 'newsletter_only', 'scrape'];

function policySkipReason(cfg: SignalSourceConfig): string | null {
  if (NON_FETCH_KINDS.includes(cfg.fetchKind)) {
    return `Skipped (${cfg.fetchKind} — no automated fetch)`;
  }
  if (cfg.contentUseMode === 'manual_review') {
    return 'Skipped (manual_review — registry only)';
  }
  return null;
}

function normalizeItemsForContentUse(items: NormalizedItem[], cfg: SignalSourceConfig): NormalizedItem[] {
  return items.map((it) => {
    const summary = applyContentUseModeToSummary(it.summary, cfg.contentUseMode);
    const base = { ...it, summary };
    return { ...base, contentHash: hashNormalizedItem(base) };
  });
}

export type IngestSummaryStatus = IngestRunStatus | 'skipped';

export type IngestSummary = {
  sourceSlug: string;
  status: IngestSummaryStatus;
  /** Rows included in upsert batches (not necessarily changed in DB). */
  itemsUpserted: number;
  error?: string;
};

export type IngestOverallStatus = 'success' | 'partial' | 'failed';

export type IngestOutcome = {
  /** False only when the job could not run meaningfully (e.g. DB not configured). */
  ok: boolean;
  overallStatus: IngestOverallStatus;
  finishedAt: string;
  skipped?: string;
  summary: {
    total: number;
    success: number;
    partial: number;
    failed: number;
    skipped: number;
  };
  results: IngestSummary[];
};

/** Exported for tests: derive overallStatus from per-source rows (non-skipped only). */
export function computeOverallIngestStatus(results: IngestSummary[]): IngestOverallStatus {
  const attempted = results.filter((r) => r.status !== 'skipped');
  if (attempted.length === 0) return 'partial';
  if (attempted.some((r) => r.status === 'failed')) return 'failed';
  if (attempted.some((r) => r.status === 'partial')) return 'partial';
  return 'success';
}

/** Exported for unit tests (fetch mocked). Requires endpointUrl for fetch paths. */
export async function ingestOneSource(cfg: {
  slug: string;
  fetchKind: 'rss' | 'json_api';
  endpointUrl: string;
  provenanceClass: string;
}): Promise<{
  items: NormalizedItem[];
  status: IngestRunStatus;
  error?: string;
  httpStatus: number;
  finalUrl: string | null;
}> {
  const res = await fetchTextNoStore(cfg.endpointUrl, { timeoutMs: 25000 });

  if (!res.ok) {
    return {
      items: [],
      status: 'failed',
      error: `HTTP ${res.status} ${cfg.endpointUrl}`,
      httpStatus: res.status,
      finalUrl: res.finalUrl || cfg.endpointUrl,
    };
  }

  try {
    if (cfg.fetchKind === 'json_api') {
      const items =
        cfg.slug === 'fr-public-inspection'
          ? parseFederalRegisterPiJson(res.text)
          : parseFederalRegisterPublishedJson(res.text);

      if (items.length === 0) {
        return {
          items: [],
          status: 'partial',
          error: 'JSON API parse returned 0 items',
          httpStatus: res.status,
          finalUrl: res.finalUrl || cfg.endpointUrl,
        };
      }

      return {
        items,
        status: 'success',
        httpStatus: res.status,
        finalUrl: res.finalUrl || cfg.endpointUrl,
      };
    }

    const items = await parseRssXmlToItems(res.text, {
      sourceSlug: cfg.slug,
      provenanceClass: cfg.provenanceClass,
    });

    if (items.length === 0) {
      return {
        items: [],
        status: 'partial',
        error:
          'RSS parse returned 0 items (empty feed, non-feed body, HTML error page, or no valid entries)',
        httpStatus: res.status,
        finalUrl: res.finalUrl || cfg.endpointUrl,
      };
    }

    return {
      items,
      status: 'success',
      httpStatus: res.status,
      finalUrl: res.finalUrl || cfg.endpointUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      items: [],
      status: 'failed',
      error: msg,
      httpStatus: res.status,
      finalUrl: res.finalUrl || cfg.endpointUrl,
    };
  }
}

/**
 * Full ingest pass: sync registry, then fetch each enabled source with a URL.
 */
export async function runIntelIngest(): Promise<IngestOutcome> {
  const finishedAt = new Date().toISOString();

  if (!intelDbConfigured()) {
    return {
      ok: false,
      overallStatus: 'failed',
      finishedAt,
      skipped: 'Supabase not configured',
      summary: { total: 0, success: 0, partial: 0, failed: 0, skipped: 0 },
      results: [],
    };
  }

  const configs = getSignalSources();
  const slugToId = await syncIntelSourcesFromManifest(configs);
  const results: IngestSummary[] = [];

  for (const cfg of configs) {
    if (!cfg.isEnabled) {
      results.push({
        sourceSlug: cfg.slug,
        status: 'skipped',
        itemsUpserted: 0,
        error: SKIP_DISABLED,
      });
      continue;
    }

    const policy = policySkipReason(cfg);
    if (policy) {
      results.push({
        sourceSlug: cfg.slug,
        status: 'skipped',
        itemsUpserted: 0,
        error: policy,
      });
      continue;
    }

    if (!cfg.endpointUrl) {
      results.push({
        sourceSlug: cfg.slug,
        status: 'skipped',
        itemsUpserted: 0,
        error: SKIP_NO_ENDPOINT,
      });
      continue;
    }

    const sourceId = slugToId.get(cfg.slug);
    if (!sourceId) {
      results.push({
        sourceSlug: cfg.slug,
        status: 'failed',
        itemsUpserted: 0,
        error: 'Source id missing after sync',
      });
      continue;
    }

    let runId: string;
    try {
      runId = await startIngestRun(sourceId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ sourceSlug: cfg.slug, status: 'failed', itemsUpserted: 0, error: msg });
      continue;
    }

    const outcome = await ingestOneSource(cfg);

    let upserted = 0;
    try {
      if (outcome.items.length > 0) {
        upserted = await upsertSourceItems(sourceId, outcome.items, cfg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishIngestRun(runId, 'failed', 0, msg, { slug: cfg.slug });
      results.push({ sourceSlug: cfg.slug, status: 'failed', itemsUpserted: 0, error: msg });
      continue;
    }

    const finalStatus: IngestRunStatus = outcome.status === 'failed' ? 'failed' : outcome.status;
    await finishIngestRun(runId, finalStatus, upserted, outcome.error ?? null, {
      slug: cfg.slug,
    });

    results.push({
      sourceSlug: cfg.slug,
      status: finalStatus,
      itemsUpserted: upserted,
      error: outcome.error,
    });
  }

  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const attempted = results.filter((r) => r.status !== 'skipped');

  const successCount = attempted.filter((r) => r.status === 'success').length;
  const failedCount = attempted.filter((r) => r.status === 'failed').length;
  const partialCount = attempted.filter((r) => r.status === 'partial').length;

  const overallStatus = computeOverallIngestStatus(results);
  const ok = overallStatus !== 'failed';

  return {
    ok,
    overallStatus,
    finishedAt,
    summary: {
      total: results.length,
      success: successCount,
      partial: partialCount,
      failed: failedCount,
      skipped: skippedCount,
    },
    results,
  };
}
