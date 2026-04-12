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

export type IngestSummary = {
  sourceSlug: string;
  status: IngestRunStatus;
  itemsUpserted: number;
  error?: string;
};

async function ingestOneSource(
  sourceId: string,
  cfg: {
    slug: string;
    fetchKind: 'rss' | 'json_api';
    endpointUrl: string;
    provenanceClass: string;
  },
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
    if (cfg.fetchKind === 'json_api') {
      const items =
        cfg.slug === 'fr-public-inspection'
          ? parseFederalRegisterPiJson(res.text)
          : parseFederalRegisterPublishedJson(res.text);
      return { items, status: 'success' };
    }

    const items = await parseRssXmlToItems(res.text, {
      sourceSlug: cfg.slug,
      provenanceClass: cfg.provenanceClass,
    });
    if (items.length === 0 && res.text.length > 50) {
      return {
        items: [],
        status: 'partial',
        error: 'RSS parse returned 0 items (body may not be a feed)',
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
export async function runIntelIngest(): Promise<{
  ok: boolean;
  skipped?: string;
  results: IngestSummary[];
}> {
  if (!intelDbConfigured()) {
    return { ok: false, skipped: 'Supabase not configured', results: [] };
  }

  const configs = getSignalSources();
  const slugToId = await syncIntelSourcesFromManifest(configs);
  const results: IngestSummary[] = [];

  for (const cfg of configs) {
    if (!cfg.isEnabled || !cfg.endpointUrl) {
      results.push({
        sourceSlug: cfg.slug,
        status: 'partial',
        itemsUpserted: 0,
        error: 'Skipped (disabled or missing endpoint URL)',
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

    const outcome = await ingestOneSource(sourceId, {
      slug: cfg.slug,
      fetchKind: cfg.fetchKind,
      endpointUrl: cfg.endpointUrl,
      provenanceClass: cfg.provenanceClass,
    });

    let upserted = 0;
    try {
      if (outcome.items.length > 0) {
        upserted = await upsertSourceItems(sourceId, outcome.items);
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

  return { ok: true, results };
}
