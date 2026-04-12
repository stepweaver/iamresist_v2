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

function parseStaleAfterMinutes() {
  const raw = process.env.INTEL_DESK_STALE_AFTER_MINUTES;
  if (raw == null || String(raw).trim() === '') return 90;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

function ageMinutesFromIso(isoString) {
  if (!isoString) return null;
  const ts = new Date(isoString).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.round((Date.now() - ts) / 60000);
}

function isOlderThan(isoString, maxAgeMs) {
  if (!isoString) return true;
  const t = new Date(isoString).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > maxAgeMs;
}

/** @param freshness {{ latestFetchedAt: string | null, latestSuccessfulIngestAt: string | null }} */
function buildFreshnessMeta(freshness, deskState) {
  const thresholdMinutes = parseStaleAfterMinutes();
  const latestFetchedAgeMinutes = freshness ? ageMinutesFromIso(freshness.latestFetchedAt) : null;
  const latestSuccessAgeMinutes = freshness
    ? ageMinutesFromIso(freshness.latestSuccessfulIngestAt)
    : null;

  let staleReason = null;
  if (deskState === 'snapshot') {
    staleReason =
      'Live database read failed; showing the last saved OSINT desk. Nothing weaker was substituted.';
  } else if (deskState === 'stale') {
    staleReason = `Latest item fetch and last successful ingest are both older than ${thresholdMinutes} minutes (override with INTEL_DESK_STALE_AFTER_MINUTES). Ingest may be stalled.`;
  }

  return {
    thresholdMinutes,
    latestFetchedAgeMinutes,
    latestSuccessAgeMinutes,
    staleReason,
    deskState,
  };
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
      freshnessMeta: null,
    };
  }

  let freshness = { latestFetchedAt: null, latestSuccessfulIngestAt: null };
  try {
    freshness = await fetchIntelFreshnessSnapshot();
  } catch (e) {
    console.warn('[liveIntel] freshness query failed:', e);
  }

  const staleAfterMs = parseStaleAfterMinutes() * 60 * 1000;

  let rows;
  try {
    rows = await fetchRecentSourceItemsForLive(220);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const snap = await loadLiveDeskSnapshot();
      if (snap?.items?.length) {
        const mergedFresh = snap.freshness ?? freshness;
        const freshnessMeta = buildFreshnessMeta(mergedFresh, 'snapshot');
        return {
          configured: true,
          stale: true,
          dataStale: true,
          snapshotFallback: true,
          liveReadOk: false,
          items: snap.items,
          freshness: mergedFresh,
          freshnessMeta,
          message: `OSINT read failed; showing last saved desk (${augmentLiveDeskErrorMessage(msg)})`,
          intelSchemaMisconfigured: isIntelSchemaNotExposedError(msg),
        };
      }
    } catch (loadErr) {
      console.warn('[liveIntel] snapshot load failed:', loadErr);
    }

    const deskState = 'stale';
    const freshnessMeta = buildFreshnessMeta(freshness, deskState);
    return {
      configured: true,
      stale: true,
      dataStale: true,
      snapshotFallback: false,
      liveReadOk: false,
      intelSchemaMisconfigured: isIntelSchemaNotExposedError(msg),
      items: [],
      freshness,
      freshnessMeta,
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
    isOlderThan(freshness.latestFetchedAt, staleAfterMs) &&
    isOlderThan(freshness.latestSuccessfulIngestAt, staleAfterMs);

  const deskState = dataStale ? 'stale' : 'fresh';
  const freshnessMeta = buildFreshnessMeta(freshness, deskState);

  try {
    await saveLiveDeskSnapshot({ items, freshness, freshnessMeta });
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
    freshnessMeta,
    message: dataStale ? freshnessMeta.staleReason : null,
  };
}

export const getLiveIntelDesk = unstable_cache(buildLiveIntelDesk, ['intel-live-desk-v2'], {
  revalidate: 45,
  tags: ['intel-live'],
});
