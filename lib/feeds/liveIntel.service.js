import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  intelDbConfigured,
  fetchRecentSourceItemsForLive,
  fetchIntelFreshnessSnapshot,
  saveLiveDeskSnapshot,
  loadLiveDeskSnapshot,
} from '@/lib/intel/db';
import { compareLiveRows } from '@/lib/intel/rank';
import { whyItMattersStub } from '@/lib/intel/whyItMatters';

const STALE_AFTER_MS = 15 * 60 * 1000;

/** PostgREST returns this until `intel` is added under Supabase → Settings → API → Exposed schemas. */
function isIntelSchemaNotExposedError(msg) {
  return /invalid schema:\s*intel/i.test(String(msg));
}

function augmentLiveDeskErrorMessage(msg) {
  if (isIntelSchemaNotExposedError(msg)) {
    return `${msg} — In Supabase: Project Settings → API → Exposed schemas → add "intel". Also run both SQL files in supabase/migrations/ for this repo.`;
  }
  return msg;
}

function isOlderThan(isoString, maxAgeMs) {
  if (!isoString) return true;
  const ts = new Date(isoString).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > maxAgeMs;
}

function mapRowsToItems(rows) {
  return rows
    .filter((r) => r.sources)
    .map((r) => {
      const s = r.sources;
      const provenanceClass = s.provenance_class;
      const clusterKeys =
        r.cluster_keys && typeof r.cluster_keys === 'object' && !Array.isArray(r.cluster_keys)
          ? r.cluster_keys
          : {};
      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        canonicalUrl: r.canonical_url,
        publishedAt: r.published_at,
        fetchedAt: r.fetched_at,
        provenanceClass,
        sourceName: s.name,
        sourceSlug: s.slug,
        stateChangeType: r.state_change_type,
        clusterKeys,
        whyItMatters: whyItMattersStub(provenanceClass, r.state_change_type, clusterKeys),
      };
    });
}

async function buildLiveIntelDesk() {
  if (!intelDbConfigured()) {
    return {
      configured: false,
      stale: false,
      dataStale: false,
      snapshotFallback: false,
      liveReadOk: false,
      items: [],
      message: 'Supabase credentials not configured.',
      freshness: null,
    };
  }

  let freshness = { latestFetchedAt: null, latestSuccessfulIngestAt: null };
  try {
    freshness = await fetchIntelFreshnessSnapshot();
  } catch (e) {
    console.warn('[liveIntel] freshness query failed:', e);
  }

  let rows;
  try {
    rows = await fetchRecentSourceItemsForLive(220);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const snap = await loadLiveDeskSnapshot();
      if (snap?.items?.length) {
        return {
          configured: true,
          stale: true,
          dataStale: true,
          snapshotFallback: true,
          liveReadOk: false,
          items: snap.items,
          freshness: snap.freshness ?? freshness,
          message: `Live read failed; showing last saved desk (${augmentLiveDeskErrorMessage(msg)})`,
          intelSchemaMisconfigured: isIntelSchemaNotExposedError(msg),
        };
      }
    } catch (loadErr) {
      console.warn('[liveIntel] snapshot load failed:', loadErr);
    }
    return {
      configured: true,
      stale: true,
      dataStale: true,
      snapshotFallback: false,
      liveReadOk: false,
      intelSchemaMisconfigured: isIntelSchemaNotExposedError(msg),
      items: [],
      freshness,
      message: augmentLiveDeskErrorMessage(msg),
    };
  }

  const items = mapRowsToItems(rows);
  items.sort(compareLiveRows);

  const hasEverIngested = Boolean(
    freshness.latestFetchedAt || freshness.latestSuccessfulIngestAt,
  );
  const dataStale =
    hasEverIngested &&
    isOlderThan(freshness.latestFetchedAt, STALE_AFTER_MS) &&
    isOlderThan(freshness.latestSuccessfulIngestAt, STALE_AFTER_MS);

  try {
    await saveLiveDeskSnapshot({ items, freshness });
  } catch (e) {
    console.warn('[liveIntel] snapshot save failed:', e);
  }

  return {
    configured: true,
    stale: dataStale,
    dataStale,
    snapshotFallback: false,
    liveReadOk: true,
    items,
    freshness,
    message: dataStale
      ? 'Live desk data is older than the freshness threshold (ingest may be stalled).'
      : null,
  };
}

export const getLiveIntelDesk = unstable_cache(buildLiveIntelDesk, ['intel-live-desk-v1'], {
  revalidate: 45,
  tags: ['intel-live'],
});
