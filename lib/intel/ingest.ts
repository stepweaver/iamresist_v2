import 'server-only';

import { createHash } from 'node:crypto';
import pLimit from 'p-limit';

import { fetchTextNoStore } from '@/lib/intel/fetchText';
import {
  parseFederalRegisterPiJson,
  parseFederalRegisterPublishedJson,
} from '@/lib/intel/frApi';
import {
  parseDemocracyDocketNewsAlertsHtml,
  parseCentcomPressReleasesHtml,
  parseKyivIndependentNewsArchiveHtml,
  parse972MagazineHomepageHtml,
  parseOfacRecentActionsHtml,
  parseSameHostArticleLinksHtml,
  parseUsniNewsListingHtml,
} from '@/lib/intel/parseHtmlIndex';
import { enrichNormalizedItemsWithImages } from '@/lib/intel/enrichImages';
import { parseRssXmlToItems } from '@/lib/intel/parseRss';
import { getSignalSources } from '@/lib/intel/signal-sources';
import { applyContentUseModeToSummary, decodeIntelPlainText, stripHtmlToText } from '@/lib/intel/contentUse';
import {
  fetchIngestSchedulesForSlugs,
  finishIngestRun,
  intelDbConfigured,
  startIngestRun,
  syncIntelSourcesFromManifest,
  updateSourceIngestSchedule,
  upsertSourceItems,
} from '@/lib/intel/db';
import type { ContentUseMode, FetchKind, IngestRunStatus, NormalizedItem } from '@/lib/intel/types';

const SKIP_MESSAGE = 'Skipped (disabled or missing endpoint URL)';

const DEFAULT_INGEST_INTERVAL_MINUTES = 30;
const DEFAULT_MAX_ITEMS_PER_SOURCE = 60;

function maxItemsForSourceSlug(slug: string): number {
  if (slug === 'mag-972') return 30;
  if (slug === 'usni-fleet-tracker') return 25;
  if (slug === 'democracy-docket') return 40;
  if (slug === 'centcom-press') return 40;
  if (slug === 'ofac-recent-actions') return 50;
  return DEFAULT_MAX_ITEMS_PER_SOURCE;
}

function fetchTimeoutMsForSourceSlug(slug: string): number {
  if (slug === 'mag-972') return 18000;
  if (slug === 'usni-fleet-tracker') return 18000;
  return 25000;
}

function capItems(items: NormalizedItem[], max: number): { items: NormalizedItem[]; capped: boolean } {
  if (max <= 0) return { items: [], capped: items.length > 0 };
  if (items.length <= max) return { items, capped: false };
  return { items: items.slice(0, max), capped: true };
}

function clampIngestIntervalMinutes(raw: number | undefined): number {
  const n = raw == null || !Number.isFinite(raw) ? DEFAULT_INGEST_INTERVAL_MINUTES : Math.round(raw);
  return Math.min(1440, Math.max(5, n));
}

/** Stable fingerprint of parsed items; null when there is nothing to fingerprint. */
function fingerprintNormalizedItems(items: NormalizedItem[]): string | null {
  if (items.length === 0) return null;
  const sorted = [...items].map((i) => i.contentHash).sort();
  return createHash('sha256').update(sorted.join('\n')).digest('hex');
}

/** After an ingest attempt, when should this source be eligible again? */
function nextIngestAfterAttempt(finalStatus: IngestRunStatus, intervalMinutes: number): Date {
  const clamped = clampIngestIntervalMinutes(intervalMinutes);
  if (finalStatus === 'failed') {
    const retryMinutes = Math.min(15, clamped);
    return new Date(Date.now() + retryMinutes * 60_000);
  }
  return new Date(Date.now() + clamped * 60_000);
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
  /** True when at least one due source produced a new content fingerprint vs DB. */
  revalidateIntelCaches: boolean;
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
  fetchKind: FetchKind;
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
    readStringField(
      cfg as unknown as Record<string, unknown>,
      'contentMode',
      'content_mode',
      'legalMode',
      'legal_mode',
      'contentUseMode',
      'content_use_mode',
    );

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

const CONTENT_USE_MODES: ContentUseMode[] = [
  'metadata_only',
  'feed_summary',
  'preview_and_link',
  'full_text_if_feed_includes',
  'manual_review',
];

function coerceContentUseMode(mode: string | null): ContentUseMode {
  if (!mode) return 'feed_summary';
  const normalized = mode.trim().toLowerCase();
  return (CONTENT_USE_MODES as readonly string[]).includes(normalized)
    ? (normalized as ContentUseMode)
    : 'feed_summary';
}

function applyContentUseModeToItems(items: NormalizedItem[], mode: ContentUseMode): NormalizedItem[] {
  if (items.length === 0) return items;
  return items.map((it) => {
    const raw = it.summary;
    const plain =
      typeof raw === 'string'
        ? raw.includes('<')
          ? stripHtmlToText(raw)
          : decodeIntelPlainText(raw)
        : raw;
    return {
      ...it,
      summary: applyContentUseModeToSummary(plain, mode),
    };
  });
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
): Promise<{ items: NormalizedItem[]; status: IngestRunStatus; error?: string; meta?: Record<string, unknown> }> {
  let res;
  try {
    res = await fetchTextNoStore(cfg.endpointUrl, { timeoutMs: fetchTimeoutMsForSourceSlug(cfg.slug) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const redirects =
      e && typeof e === 'object' && 'redirects' in e && Array.isArray((e as { redirects?: unknown }).redirects)
        ? (e as { redirects: unknown[] }).redirects
        : null;
    return {
      items: [],
      status: 'failed',
      error: msg,
      meta: {
        httpStatus: 0,
        finalUrl: null,
        contentType: null,
        failureCategory: msg.toLowerCase().includes('redirect loop')
          ? 'redirect_loop'
          : msg.toLowerCase().includes('redirect count exceeded')
            ? 'redirect_count_exceeded'
            : 'fetch_error',
        ...(redirects ? { redirects } : {}),
      },
    };
  }

  if (!res.ok) {
    return {
      items: [],
      status: 'failed',
      error: `HTTP ${res.status} ${cfg.endpointUrl}`,
      meta: {
        httpStatus: res.status,
        finalUrl: res.finalUrl ?? null,
        contentType: res.contentType ?? null,
        failureCategory:
          res.status === 403
            ? 'http_403'
            : res.status === 404
              ? 'http_404'
              : res.status >= 500
                ? 'http_5xx'
                : 'http_error',
        ...(res.redirects?.length ? { redirects: res.redirects } : {}),
        bodySample: res.text.slice(0, 180),
      },
    };
  }

  try {
    const contentUseMode = coerceContentUseMode(resolveContentMode(cfg));
    const maxItems = maxItemsForSourceSlug(cfg.slug);

    if (cfg.fetchKind === 'json_api') {
      const parsedItems =
        cfg.slug === 'fr-public-inspection'
          ? parseFederalRegisterPiJson(res.text)
          : parseFederalRegisterPublishedJson(res.text);

      const { items: cappedRaw, capped } = capItems(parsedItems, maxItems);
      const items = applyContentUseModeToItems(cappedRaw, contentUseMode);

      if (items.length === 0) {
        return {
          items: [],
          status: 'partial',
          error: 'JSON API parse returned 0 items',
          meta: {
            httpStatus: res.status,
            finalUrl: res.finalUrl ?? null,
            contentType: res.contentType ?? null,
            itemsParsed: 0,
          },
        };
      }

      return {
        items,
        status: 'success',
        meta: {
          httpStatus: res.status,
          finalUrl: res.finalUrl ?? null,
          contentType: res.contentType ?? null,
          itemsParsed: items.length,
          ...(capped ? { itemsCapped: true, itemsCap: maxItems } : {}),
        },
      };
    }

    if (cfg.fetchKind === 'html_index') {
      let parsedItems: NormalizedItem[] = [];

      if (cfg.slug === 'democracy-docket') {
        parsedItems = parseDemocracyDocketNewsAlertsHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (getSignalSources().find((s) => s.slug === cfg.slug)?.deskLane as string | undefined) ?? null,
          sourceFamily:
            (getSignalSources().find((s) => s.slug === cfg.slug)?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
        });
      } else if (cfg.slug === 'bls-release-calendar') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        parsedItems = parseSameHostArticleLinksHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (getSignalSources().find((s) => s.slug === cfg.slug)?.deskLane as string | undefined) ?? null,
          sourceFamily:
            (getSignalSources().find((s) => s.slug === cfg.slug)?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          hostname: 'www.bls.gov',
          // Hub page links to monthly schedule HTML, not always to /news.release/ on the same document.
          pathIncludes: ['news.release', '_sched_list.htm', '_sched.htm'],
          baseUrl,
        });
      } else if (cfg.slug === 'bea-release-schedule') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        parsedItems = parseSameHostArticleLinksHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (getSignalSources().find((s) => s.slug === cfg.slug)?.deskLane as string | undefined) ?? null,
          sourceFamily:
            (getSignalSources().find((s) => s.slug === cfg.slug)?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          hostname: 'www.bea.gov',
          pathIncludes: '/news/',
          baseUrl,
        });
      } else if (cfg.slug === 'usni-fleet-tracker') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        parsedItems = parseUsniNewsListingHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (getSignalSources().find((s) => s.slug === cfg.slug)?.deskLane as string | undefined) ?? null,
          sourceFamily:
            (getSignalSources().find((s) => s.slug === cfg.slug)?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          baseUrl,
        });
      } else if (cfg.slug === 'centcom-press') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        const manifest = getSignalSources().find((s) => s.slug === cfg.slug) ?? null;
        parsedItems = parseCentcomPressReleasesHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (manifest?.deskLane as string | undefined) ?? null,
          sourceFamily: (manifest?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          baseUrl,
        });
      } else if (cfg.slug === 'kyiv-independent') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        const manifest = getSignalSources().find((s) => s.slug === cfg.slug) ?? null;
        parsedItems = parseKyivIndependentNewsArchiveHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (manifest?.deskLane as string | undefined) ?? null,
          sourceFamily: (manifest?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          baseUrl,
        });
      } else if (cfg.slug === 'mag-972') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        const manifest = getSignalSources().find((s) => s.slug === cfg.slug) ?? null;
        parsedItems = parse972MagazineHomepageHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (manifest?.deskLane as string | undefined) ?? null,
          sourceFamily: (manifest?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          baseUrl,
        });
      } else if (cfg.slug === 'ofac-recent-actions') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        const manifest = getSignalSources().find((s) => s.slug === cfg.slug) ?? null;
        parsedItems = parseOfacRecentActionsHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (manifest?.deskLane as string | undefined) ?? null,
          sourceFamily: (manifest?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          baseUrl,
        });
      } else if (cfg.slug === 'house-judiciary-press-gop') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        parsedItems = parseSameHostArticleLinksHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (getSignalSources().find((s) => s.slug === cfg.slug)?.deskLane as string | undefined) ?? null,
          sourceFamily:
            (getSignalSources().find((s) => s.slug === cfg.slug)?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          hostname: 'judiciary.house.gov',
          pathIncludes: '/media/press-releases',
          baseUrl,
        });
      } else if (cfg.slug === 'house-judiciary-press-dem') {
        const baseUrl = res.finalUrl?.trim() || cfg.endpointUrl?.trim() || null;
        parsedItems = parseSameHostArticleLinksHtml(res.text, {
          sourceSlug: cfg.slug,
          provenanceClass: cfg.provenanceClass,
          deskLane: (getSignalSources().find((s) => s.slug === cfg.slug)?.deskLane as string | undefined) ?? null,
          sourceFamily:
            (getSignalSources().find((s) => s.slug === cfg.slug)?.sourceFamily as string | undefined) ?? null,
          contentUseMode,
          fetchKind: cfg.fetchKind,
          hostname: 'democrats-judiciary.house.gov',
          pathIncludes: '/media-center/press-releases',
          baseUrl,
        });
      } else {
        return {
          items: [],
          status: 'failed',
          error: `html_index not implemented for slug: ${cfg.slug}`,
          meta: {
            httpStatus: res.status,
            finalUrl: res.finalUrl ?? null,
            contentType: res.contentType ?? null,
          },
        };
      }

      const { items: cappedRaw, capped } = capItems(parsedItems, maxItems);
      const items = applyContentUseModeToItems(cappedRaw, contentUseMode);

      if (items.length === 0) {
        return {
          items: [],
          status: 'partial',
          error:
            'HTML index parse returned 0 article links (blocked page, empty listing, or markup change)',
          meta: {
            httpStatus: res.status,
            finalUrl: res.finalUrl ?? null,
            contentType: res.contentType ?? null,
            itemsParsed: 0,
            failureCategory: 'parser_no_entries',
            ...(res.redirects?.length ? { redirects: res.redirects } : {}),
            bodySample: res.text.slice(0, 180),
          },
        };
      }

      const ogMax =
        cfg.slug === 'democracy-docket' ? 18 : cfg.slug === 'usni-fleet-tracker' ? 12 : 8;
      const itemsWithImages = await enrichNormalizedItemsWithImages(items, {
        max: ogMax,
        concurrency: 4,
      });

      return {
        items: itemsWithImages,
        status: 'success',
        meta: {
          httpStatus: res.status,
          finalUrl: res.finalUrl ?? null,
          contentType: res.contentType ?? null,
          itemsParsed: itemsWithImages.length,
          imagesResolved: itemsWithImages.filter((it) => Boolean(it.imageUrl)).length,
          ...(res.redirects?.length ? { redirects: res.redirects } : {}),
          ...(capped ? { itemsCapped: true, itemsCap: maxItems } : {}),
        },
      };
    }

    const isXmlFeed = cfg.fetchKind === 'rss' || cfg.fetchKind === 'podcast_rss';

    if (!isXmlFeed) {
      return {
        items: [],
        status: 'failed',
        error: `Unsupported fetchKind: ${cfg.fetchKind}`,
        meta: {
          httpStatus: res.status,
          finalUrl: res.finalUrl ?? null,
          contentType: res.contentType ?? null,
        },
      };
    }

    const manifest = getSignalSources().find((s) => s.slug === cfg.slug) ?? null;
    const parsedItems = await parseRssXmlToItems(res.text, {
      sourceSlug: cfg.slug,
      provenanceClass: cfg.provenanceClass,
      contentUseMode,
      fetchKind: cfg.fetchKind,
      deskLane: (manifest?.deskLane as string | undefined) ?? null,
      sourceFamily: (manifest?.sourceFamily as string | undefined) ?? null,
    });

    const { items: cappedParsed, capped } = capItems(parsedItems, maxItems);

    // RSS already extracts feed-native images; this only fills gaps.
    const items = await enrichNormalizedItemsWithImages(cappedParsed, {
      max: 8,
      concurrency: 4,
    });

    if (items.length === 0) {
      const ct = (res.contentType || '').toLowerCase();
      const text = (res.text || '').trim().toLowerCase();
      const looksHtml = text.startsWith('<!doctype') || text.startsWith('<html');
      const looksXml = res.text.includes('<rss') || res.text.includes('<feed');
      return {
        items: [],
        status: 'partial',
        error:
          'RSS parse returned 0 items (empty feed, non-feed body, HTML error page, or no valid entries)',
        meta: {
          httpStatus: res.status,
          finalUrl: res.finalUrl ?? null,
          contentType: res.contentType ?? null,
          itemsParsed: 0,
          failureCategory: looksHtml || ct.includes('text/html')
            ? 'feed_non_xml_body'
            : looksXml
              ? 'parser_no_entries'
              : 'feed_non_xml_body',
          ...(res.redirects?.length ? { redirects: res.redirects } : {}),
          bodySample: res.text.slice(0, 180),
        },
      };
    }

    return {
      items,
      status: 'success',
      meta: {
        httpStatus: res.status,
        finalUrl: res.finalUrl ?? null,
        contentType: res.contentType ?? null,
        itemsParsed: items.length,
        imagesResolved: items.filter((it) => Boolean(it.imageUrl)).length,
        ...(res.redirects?.length ? { redirects: res.redirects } : {}),
        ...(capped ? { itemsCapped: true, itemsCap: maxItems } : {}),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      items: [],
      status: 'failed',
      error: msg,
      meta: {
        httpStatus: res.status,
        finalUrl: res.finalUrl ?? null,
        contentType: res.contentType ?? null,
        failureCategory: 'parse_error',
        ...(res.redirects?.length ? { redirects: res.redirects } : {}),
        bodySample: res.text.slice(0, 180),
      },
    };
  }
}

/**
 * Full ingest pass: sync registry, then fetch each enabled source with a URL when due.
 */
export async function runIntelIngest(): Promise<IngestOutcome> {
  const finishedAt = new Date().toISOString();

  if (!intelDbConfigured()) {
    return {
      ok: false,
      overallStatus: 'failed',
      finishedAt,
      skipped: 'Supabase not configured',
      revalidateIntelCaches: false,
      summary: { total: 0, success: 0, partial: 0, failed: 0, skipped: 0 },
      results: [],
    };
  }

  const configs = getSignalSources();
  const slugToId = await syncIntelSourcesFromManifest(configs);
  const schedules = await fetchIngestSchedulesForSlugs(configs.map((c) => c.slug));
  const results: IngestSummary[] = [];
  let revalidateIntelCaches = false;

  const concurrencyRaw = process.env.INTEL_INGEST_CONCURRENCY;
  const concurrency = Math.min(
    4,
    Math.max(1, Number.isFinite(parseInt(String(concurrencyRaw ?? ''), 10)) ? parseInt(String(concurrencyRaw), 10) : 1),
  );
  const limit = pLimit(concurrency);

  async function ingestOneCfg(cfg: (typeof configs)[number]): Promise<{ summary: IngestSummary; contentChanged: boolean }> {
    if (!cfg.isEnabled || !cfg.endpointUrl) {
      return {
        summary: {
          sourceSlug: cfg.slug,
          status: 'skipped',
          itemsUpserted: 0,
          error: SKIP_MESSAGE,
        },
        contentChanged: false,
      };
    }

    const sourceId = slugToId.get(cfg.slug);
    if (!sourceId) {
      return {
        summary: {
          sourceSlug: cfg.slug,
          status: 'failed',
          itemsUpserted: 0,
          error: 'Source id missing after sync',
        },
        contentChanged: false,
      };
    }

    const sched = schedules.get(cfg.slug);
    const manifestInterval = clampIngestIntervalMinutes(cfg.ingestIntervalMinutes);
    const effectiveInterval =
      sched?.ingest_interval_minutes != null
        ? clampIngestIntervalMinutes(sched.ingest_interval_minutes)
        : manifestInterval;
    const priorFp = sched?.last_ingest_content_fingerprint ?? null;
    const nextAt = sched?.next_ingest_at ? new Date(sched.next_ingest_at) : null;

    if (nextAt && !Number.isNaN(nextAt.getTime()) && nextAt.getTime() > Date.now()) {
      return {
        summary: {
        sourceSlug: cfg.slug,
        status: 'skipped',
        itemsUpserted: 0,
        error: `Not due until ${nextAt.toISOString()}`,
        },
        contentChanged: false,
      };
    }

    let runId: string;
    try {
      runId = await startIngestRun(sourceId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        await updateSourceIngestSchedule(sourceId, {
          next_ingest_at: nextIngestAfterAttempt('failed', effectiveInterval).toISOString(),
        });
      } catch (schedErr) {
        console.warn('[ingest] schedule update after startIngestRun failure:', schedErr);
      }
      return {
        summary: { sourceSlug: cfg.slug, status: 'failed', itemsUpserted: 0, error: msg },
        contentChanged: false,
      };
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
      try {
        await finishIngestRun(runId, 'failed', 0, msg, { slug: cfg.slug });
      } catch (runErr) {
        console.warn('[ingest] finishIngestRun failed after upsert failure (continuing):', runErr);
      }
      try {
        await updateSourceIngestSchedule(sourceId, {
          next_ingest_at: nextIngestAfterAttempt('failed', effectiveInterval).toISOString(),
        });
      } catch (schedErr) {
        console.warn('[ingest] schedule update after upsert failure:', schedErr);
      }
      return {
        summary: { sourceSlug: cfg.slug, status: 'failed', itemsUpserted: 0, error: msg },
        contentChanged: false,
      };
    }

    const finalStatus: IngestRunStatus = outcome.status === 'failed' ? 'failed' : outcome.status;

    try {
      await finishIngestRun(runId, finalStatus, upserted, outcome.error ?? null, {
        slug: cfg.slug,
        ...(outcome.meta ?? {}),
        itemsParsed: outcome.meta?.itemsParsed ?? outcome.items.length,
        itemsUpserted: upserted,
      });
    } catch (runErr) {
      console.warn('[ingest] finishIngestRun failed (continuing):', runErr);
    }

    const newFp = fingerprintNormalizedItems(outcome.items);
    const contentChanged = newFp !== null && newFp !== priorFp;

    try {
      await updateSourceIngestSchedule(sourceId, {
        next_ingest_at: nextIngestAfterAttempt(finalStatus, effectiveInterval).toISOString(),
        ...(contentChanged ? { last_ingest_content_fingerprint: newFp } : {}),
      });
    } catch (schedErr) {
      console.warn('[ingest] schedule update after ingest:', schedErr);
    }

    return {
      summary: { sourceSlug: cfg.slug, status: finalStatus, itemsUpserted: upserted, error: outcome.error },
      contentChanged,
    };
  }

  const perCfg = await Promise.all(configs.map((cfg) => limit(() => ingestOneCfg(cfg))));
  for (const r of perCfg) {
    results.push(r.summary);
    if (r.contentChanged) revalidateIntelCaches = true;
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
    revalidateIntelCaches,
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