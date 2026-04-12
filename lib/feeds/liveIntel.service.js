import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  intelDbConfigured,
  fetchRecentSourceItemsForLive,
  fetchIntelFreshnessSnapshot,
  saveLiveDeskSnapshot,
  loadLiveDeskSnapshot,
} from '@/lib/intel/db';
import { applyDuplicateClusterOverlay, compareDeskItems } from '@/lib/intel/rank';
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

function parseRelevanceExplanations(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const ruleId = e.ruleId;
    const message = e.message;
    if (typeof ruleId === 'string' && typeof message === 'string') {
      out.push({ ruleId, message });
    }
  }
  return out;
}

function mapRowsToDeskItems(rows) {
  return rows
    .filter((r) => r.sources)
    .map((r) => {
      const s = r.sources;
      const provenanceClass = s.provenance_class;
      const clusterKeys =
        r.cluster_keys && typeof r.cluster_keys === 'object' && !Array.isArray(r.cluster_keys)
          ? r.cluster_keys
          : {};
      const missionTags = Array.isArray(r.mission_tags) ? r.mission_tags : [];
      const surfaceState =
        r.surface_state === 'downranked' || r.surface_state === 'suppressed'
          ? r.surface_state
          : 'surfaced';
      const relevanceScore =
        typeof r.relevance_score === 'number' && Number.isFinite(r.relevance_score)
          ? r.relevance_score
          : 50;

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
        relevanceScore,
        surfaceState,
        suppressionReason: r.suppression_reason ?? null,
        missionTags,
        branchOfGovernment: typeof r.branch_of_government === 'string' ? r.branch_of_government : 'unknown',
        institutionalArea: typeof r.institutional_area === 'string' ? r.institutional_area : 'unknown',
        relevanceExplanations: parseRelevanceExplanations(r.relevance_explanations),
        isDuplicateLoser: false,
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
      suppressedItems: [],
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
    rows = await fetchRecentSourceItemsForLive(360);
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
          suppressedItems: snap.suppressedItems ?? [],
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
      suppressedItems: [],
      freshness,
      freshnessMeta,
      message: augmentLiveDeskErrorMessage(msg),
    };
  }

  const mapped = mapRowsToDeskItems(rows);
  const withDup = applyDuplicateClusterOverlay(mapped);
  const suppressedItems = withDup
    .filter((r) => r.surfaceState === 'suppressed')
    .sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });
  const visible = withDup.filter((r) => r.surfaceState !== 'suppressed');
  visible.sort(compareDeskItems);

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
    await saveLiveDeskSnapshot({
      items: visible,
      suppressedItems,
      freshness,
      freshnessMeta,
    });
  } catch (e) {
    console.warn('[liveIntel] snapshot save failed:', e);
  }

  return {
    configured: true,
    stale: dataStale,
    dataStale,
    snapshotFallback: false,
    liveReadOk: true,
    items: visible,
    suppressedItems,
    freshness,
    freshnessMeta,
    message: dataStale ? freshnessMeta.staleReason : null,
  };
}

export const getLiveIntelDesk = unstable_cache(buildLiveIntelDesk, ['intel-live-desk-v3'], {
  revalidate: 45,
  tags: ['intel-live'],
});
