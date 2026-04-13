import 'server-only';

import { fetchTextNoStore } from '@/lib/intel/fetchText';
import {
  parseFederalRegisterPiJson,
  parseFederalRegisterPublishedJson,
} from '@/lib/intel/frApi';
import { parseRssXmlToItems } from '@/lib/intel/parseRss';
import { getSignalSources } from '@/lib/intel/signal-sources';
import {
  finishIngestRun,
  intelDbConfigured,
  startIngestRun,
  syncIntelSourcesFromManifest,
  upsertSourceItems,
} from '@/lib/intel/db';
import type { IngestRunStatus, NormalizedItem } from '@/lib/intel/types';

const SKIP_MESSAGE = 'Skipped (disabled or missing endpoint URL)';
const MAX_PREVIEW_SUMMARY_LENGTH = 320;

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

type IngestSourceInput = {
  slug: string;
  fetchKind: 'rss' | 'json_api';
  endpointUrl: string;
  provenanceClass: string;

  /** Optional direct overrides for tests / future source-specific callers. */
  contentMode?: string | null;
  content_mode?: string | null;
  legalMode?: string | null;
  legal_mode?: string | null;
};

function readStringField(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!obj) return null;

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function resolveContentMode(cfg: IngestSourceInput): string | null {
  const direct =
    readStringField(cfg as unknown as Record<string, unknown>, 'contentMode', 'content_mode', 'legalMode', 'legal_mode');

  if (direct) return direct;

  const source = getSignalSources().find((s) => s.slug === cfg.slug);
  if (!source) return null;

  const sourceRecord = source as unknown as Record<string, unknown>;

  return readStringField(
    sourceRecord,
    'contentMode',
    'content_mode',
    'legalMode',
    'legal_mode',
    'contentUseMode',
    'content_use_mode',
  );
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function cleanPreviewText(input: string): string {
  return normalizeWhitespace(stripHtml(input));
}

function truncatePreview(input: string, maxLength = MAX_PREVIEW_SUMMARY_LENGTH): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function applyContentPolicy(items: NormalizedItem[], mode: string | null): NormalizedItem[] {
  if (!mode) return items;

  const normalizedMode = mode.trim().toLowerCase();

  if (normalizedMode === 'metadata_only' || normalizedMode === 'manual_review') {
    return items.map((item) => ({
      ...item,
      summary: null,
    }));
  }

  if (
    normalizedMode === 'preview_and_link' ||
    normalizedMode === 'feed_preview' ||
    normalizedMode === 'full_feed_item_only_if_already_exposed'
  ) {
    return items.map((item) => {
      if (!item.summary) return item;

      const cleaned = cleanPreviewText(item.summary);
      if (!cleaned) {
        return {
          ...item,
          summary: null,
        };
      }

      return {
        ...item,
        summary: truncatePreview(cleaned, MAX_PREVIEW_SUMMARY_LENGTH),
      };
    });
  }

  return items;
}

/** Exported for tests: derive overallStatus from per-source rows (non-skipped only). */
export function computeOverallIngestStatus(results: IngestSummary[]): IngestOverallStatus {
  const attempted = results.filter((r) => r.status !== 'skipped');
  if (attempted.length === 0) return 'partial';
  if (attempted.some((r) => r.status === 'failed')) return 'failed';
  if (attempted.some((r) => r.status === 'partial')) return 'partial';
  return 'success';
}

/** Exported for unit tests (fetch mocked). */
export async function ingestOneSource(
  cfg: IngestSourceInput,
): Promise<{ items: NormalizedItem[]; status: IngestRunStatus; error?: string }> {
  const res = await fetchTextNoStore(cfg.endpointUrl, { timeoutMs: 25000 });

  if (!res.ok) {
    return {
      items: [],
      status: 'failed',
      error: `HTTP ${res.status} ${cfg.endpointUrl}`,
    };
  }

  try {
    const contentMode = resolveContentMode(cfg);

    if (cfg.fetchKind === 'json_api') {
      const parsedItems =
        cfg.slug === 'fr-public-inspection'
          ? parseFederalRegisterPiJson(res.text)
          : parseFederalRegisterPublishedJson(res.text);

      const items = applyContentPolicy(parsedItems, contentMode);

      if (items.length === 0) {
        return {
          items: [],
          status: 'partial',
          error: 'JSON API parse returned 0 items',
        };
      }

      return { items, status: 'success' };
    }

    const parsedItems = await parseRssXmlToItems(res.text, {
      sourceSlug: cfg.slug,
      provenanceClass: cfg.provenanceClass,
    });

    const items = applyContentPolicy(parsedItems, contentMode);

    if (items.length === 0) {
      return {
        items: [],
        status: 'partial',
        error:
          'RSS parse returned 0 items (empty feed, non-feed body, HTML error page, or no valid entries)',
      };
    }

    return { items, status: 'success' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], status: 'failed', error: msg };
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
    if (!cfg.isEnabled || !cfg.endpointUrl) {
      results.push({
        sourceSlug: cfg.slug,
        status: 'skipped',
        itemsUpserted: 0,
        error: SKIP_MESSAGE,
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

    const outcome = await ingestOneSource({
      slug: cfg.slug,
      fetchKind: cfg.fetchKind,
      endpointUrl: cfg.endpointUrl,
      provenanceClass: cfg.provenanceClass,
      contentMode: (cfg as unknown as Record<string, unknown>).contentMode as string | null | undefined,
      content_mode: (cfg as unknown as Record<string, unknown>).content_mode as string | null | undefined,
      legalMode: (cfg as unknown as Record<string, unknown>).legalMode as string | null | undefined,
      legal_mode: (cfg as unknown as Record<string, unknown>).legal_mode as string | null | undefined,
    });

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