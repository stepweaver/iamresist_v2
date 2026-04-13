import 'server-only';

import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { computeRelevanceProfile } from '@/lib/intel/relevance';
import { INTEL_RELEVANCE_RULE_VERSION } from '@/lib/intel/relevanceVersion';
import { getSignalSources } from '@/lib/intel/signal-sources';
import type { NormalizedItem, StateChangeType } from '@/lib/intel/types';
import { fetchIntelSourcesRegistry } from '@/lib/intel/db';

function intel() {
  return supabaseAdmin().schema('intel');
}

type RescoreRow = {
  id: string;
  source_id: string;
  external_id: string | null;
  canonical_url: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  image_url: string | null;
  content_hash: string;
  structured: unknown;
  cluster_keys: unknown;
  state_change_type: string;
};

function rowToNormalized(row: RescoreRow): NormalizedItem {
  const structured =
    row.structured && typeof row.structured === 'object' && !Array.isArray(row.structured)
      ? (row.structured as Record<string, unknown>)
      : {};
  const clusterKeys =
    row.cluster_keys && typeof row.cluster_keys === 'object' && !Array.isArray(row.cluster_keys)
      ? (row.cluster_keys as Record<string, string>)
      : {};
  return {
    externalId: row.external_id,
    canonicalUrl: row.canonical_url,
    title: row.title,
    summary: row.summary,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
    contentHash: row.content_hash,
    structured,
    clusterKeys,
    stateChangeType: row.state_change_type as StateChangeType,
  };
}

export type RescoreIntelSourceItemsResult = {
  scanned: number;
  updated: number;
  skipped: number;
  lastId: string | null;
  done: boolean;
};

/**
 * Recompute persisted relevance for stored rows (after rule changes). Deterministic; bounded per call.
 */
export async function rescoreIntelSourceItems(options: {
  maxRows?: number;
  startAfterId?: string | null;
}): Promise<RescoreIntelSourceItemsResult> {
  const maxRows = Math.min(Math.max(options.maxRows ?? 200, 1), 2000);
  const startAfterId = options.startAfterId ?? null;

  const registry = await fetchIntelSourcesRegistry();
  const configs = getSignalSources();
  const idToSlug = new Map(registry.map((r) => [r.id, r.slug] as const));
  const slugToCfg = new Map(configs.map((c) => [c.slug, c] as const));

  const batchSize = Math.min(80, maxRows);
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let lastId: string | null = startAfterId;
  let done = false;

  const now = new Date().toISOString();

  while (scanned < maxRows) {
    const take = Math.min(batchSize, maxRows - scanned);
    let q = intel()
      .from('source_items')
      .select(
        'id, source_id, external_id, canonical_url, title, summary, published_at, image_url, content_hash, structured, cluster_keys, state_change_type',
      )
      .order('id', { ascending: true })
      .limit(take);

    if (lastId) {
      q = q.gt('id', lastId);
    }

    const { data, error } = await q;
    if (error) {
      throw new Error(`source_items rescore select: ${error.message}`);
    }
    const rows = (data ?? []) as RescoreRow[];
    if (rows.length === 0) {
      done = true;
      break;
    }

    for (const row of rows) {
      scanned += 1;
      lastId = row.id;
      const slug = idToSlug.get(row.source_id);
      const cfg = slug ? slugToCfg.get(slug) : undefined;
      if (!cfg) {
        skipped += 1;
        continue;
      }

      const item = rowToNormalized(row);
      const rel = computeRelevanceProfile(item, cfg);

      const { error: upErr } = await intel()
        .from('source_items')
        .update({
          mission_tags: rel.mission_tags,
          branch_of_government: rel.branch_of_government,
          institutional_area: rel.institutional_area,
          relevance_score: rel.relevance_score,
          surface_state: rel.surface_state,
          suppression_reason: rel.suppression_reason,
          relevance_explanations: rel.relevance_explanations,
          relevance_computed_at: now,
          relevance_rule_version: INTEL_RELEVANCE_RULE_VERSION,
        })
        .eq('id', row.id);

      if (upErr) {
        throw new Error(`source_items rescore update ${row.id}: ${upErr.message}`);
      }
      updated += 1;
    }

    if (rows.length < take) {
      done = true;
      break;
    }
  }

  return { scanned, updated, skipped, lastId, done };
}
