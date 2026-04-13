import 'server-only';

import pLimit from 'p-limit';

import { fetchOgImageUncached } from '@/lib/feeds/ogImage.js';
import { intelPlaceholderImagePathForSourceSlug } from '@/lib/intel/sourcePlaceholders';
import {
  intelDbConfigured,
  fetchSurfacedSourceItemsForLive,
  fetchDownrankedSourceItemsForLive,
  fetchSuppressedSourceItemsForLive,
  fetchIntelFreshnessForDeskLane,
  saveLiveDeskSnapshot,
  loadLiveDeskSnapshot,
} from '@/lib/intel/db';
import {
  parseDeskDownrankedFetchLimit,
  parseDeskMaxVisibleItems,
  parseDeskSuppressedFetchLimit,
  parseDeskSurfacedFetchLimit,
} from '@/lib/intel/deskLimits';
import { applyDuplicateClusterOverlay, compareDeskItems } from '@/lib/intel/rank';
import { computeDisplayPriority } from '@/lib/intel/displayPriority';
import { computeTrustWarnings } from '@/lib/intel/trustWarnings';
import { whyItMattersStub } from '@/lib/intel/whyItMatters';
import {
  applyAnecdotalIndicatorClassCaps,
  applyWatchdogLeadCorroborationRules,
} from '@/lib/intel/watchdogDeskPromotion';
import { unstable_cache } from 'next/cache';

/**
 * Desk composition (Milestone 1.8):
 * 1) Fetch surfaced rows only (newest first) — suppressed do not consume this budget.
 * 2) Fetch a small downranked pool second.
 * 3) Merge → deterministic duplicate_cluster overlay → split losers into duplicateItems.
 * 4) Sort remainder provenance-first (compareDeskItems) → cap to INTEL_DESK_MAX_VISIBLE_ITEMS.
 * 5) Suppressed: separate query, disclosure only.
 */

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

function snapshotIdForLane(deskLane) {
  if (deskLane === 'voices') return 2;
  if (deskLane === 'watchdogs') return 3;
  if (deskLane === 'defense_ops') return 4;
  if (deskLane === 'indicators') return 5;
  return 1;
}

/**
 * @param {string | undefined} deskLane
 * @returns {'osint' | 'voices' | 'watchdogs' | 'defense_ops' | 'indicators'}
 */
function normalizeDeskLane(deskLane) {
  if (
    deskLane === 'voices' ||
    deskLane === 'watchdogs' ||
    deskLane === 'defense_ops' ||
    deskLane === 'indicators' ||
    deskLane === 'osint'
  ) {
    return deskLane;
  }
  return 'osint';
}

function deskLabelForLane(deskLane) {
  if (deskLane === 'voices') return 'Voices';
  if (deskLane === 'watchdogs') return 'Watchdogs';
  if (deskLane === 'defense_ops') return 'Defense';
  if (deskLane === 'indicators') return 'Indicators';
  return 'OSINT';
}

/** @param freshness {{ latestFetchedAt: string | null, latestSuccessfulIngestAt: string | null }} */
function buildFreshnessMeta(freshness, deskState, deskLane) {
  const thresholdMinutes = parseStaleAfterMinutes();
  const latestFetchedAgeMinutes = freshness ? ageMinutesFromIso(freshness.latestFetchedAt) : null;
  const latestSuccessAgeMinutes = freshness
    ? ageMinutesFromIso(freshness.latestSuccessfulIngestAt)
    : null;

  let staleReason = null;
  if (deskState === 'snapshot') {
    const label = deskLabelForLane(deskLane);
    staleReason = `Live database read failed; showing the last saved ${label} desk. Nothing weaker was substituted.`;
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

      const trust = computeTrustWarnings({
        source: {
          trustWarningMode: s.trust_warning_mode || 'none',
          trustWarningLevel: s.trust_warning_level || 'info',
          requiresIndependentVerification: Boolean(s.requires_independent_verification),
          heroEligibilityMode: s.hero_eligibility_mode || 'normal',
          trustWarningText: typeof s.trust_warning_text === 'string' ? s.trust_warning_text : null,
        },
        item: {
          title: r.title,
          summary: r.summary,
          sourceSlug: s.slug,
          institutionalArea: typeof r.institutional_area === 'string' ? r.institutional_area : 'unknown',
          missionTags,
          clusterKeys,
        },
      });

      const relevanceExplanations = [
        ...parseRelevanceExplanations(r.relevance_explanations),
        ...(Array.isArray(trust.trustRuleExplanations) ? trust.trustRuleExplanations : []),
      ];

      const placeholderThumb = intelPlaceholderImagePathForSourceSlug(s.slug);

      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        canonicalUrl: r.canonical_url,
        imageUrl: placeholderThumb ?? (r.image_url ?? null),
        publishedAt: r.published_at,
        fetchedAt: r.fetched_at,
        provenanceClass,
        sourceName: s.name,
        sourceSlug: s.slug,
        trustWarningMode: s.trust_warning_mode || 'none',
        trustWarningLevel: s.trust_warning_level || 'info',
        requiresIndependentVerification: Boolean(s.requires_independent_verification),
        heroEligibilityMode: s.hero_eligibility_mode || 'normal',
        trustWarningText: typeof s.trust_warning_text === 'string' ? s.trust_warning_text : null,
        stateChangeType: r.state_change_type,
        deskLane: (typeof s.desk_lane === 'string' ? s.desk_lane : null) ?? r.desk_lane,
        contentUseMode: r.content_use_mode,
        sourceFamily: typeof s.source_family === 'string' ? s.source_family : 'general',
        indicator_class: r.indicator_class ?? null,
        clusterKeys,
        relevanceScore,
        surfaceState,
        suppressionReason: r.suppression_reason ?? null,
        missionTags,
        branchOfGovernment: typeof r.branch_of_government === 'string' ? r.branch_of_government : 'unknown',
        institutionalArea: typeof r.institutional_area === 'string' ? r.institutional_area : 'unknown',
        relevanceExplanations,
        isDuplicateLoser: false,
        whyItMatters: whyItMattersStub(provenanceClass, r.state_change_type, clusterKeys),
        ...trust,
      };
    });
}

function partitionDuplicateLosers(withDup) {
  const main = [];
  const duplicates = [];
  for (const it of withDup) {
    if (it.isDuplicateLoser) duplicates.push(it);
    else main.push(it);
  }
  return { main, duplicates };
}

function sortByPublishedDesc(a, b) {
  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  return tb - ta;
}

function compareForLead(a, b) {
  const da = typeof a.displayPriority === 'number' ? a.displayPriority : 0;
  const db = typeof b.displayPriority === 'number' ? b.displayPriority : 0;
  if (db !== da) return db - da;
  return compareDeskItems(a, b);
}

function addDisplayFields(items) {
  return items.map((it) => {
    const r = computeDisplayPriority({
      title: it.title,
      summary: it.summary,
      provenanceClass: it.provenanceClass,
      sourceSlug: it.sourceSlug,
      stateChangeType: it.stateChangeType,
      missionTags: it.missionTags,
      branchOfGovernment: it.branchOfGovernment,
      institutionalArea: it.institutionalArea,
      relevanceScore: it.relevanceScore,
      clusterKeys: it.clusterKeys,
      publishedAt: it.publishedAt,
      trustWarningMode: it.trustWarningMode,
      ceremonialOrLowSubstance: Boolean(it.ceremonial_or_low_substance),
    });
    return { ...it, ...r };
  });
}

function pickLeadBlock(items, opts = {}) {
  const maxLead = typeof opts.maxLead === 'number' ? opts.maxLead : 1;
  const maxSecondary = typeof opts.maxSecondary === 'number' ? opts.maxSecondary : 4;
  const maxPerArea = typeof opts.maxPerArea === 'number' ? opts.maxPerArea : 2;
  const maxPerSource = typeof opts.maxPerSource === 'number' ? opts.maxPerSource : 2;

  const surfacedOnly = items.filter((it) => it.surfaceState === 'surfaced' && !it.isDuplicateLoser);
  const surfacedWithTrustNotes = surfacedOnly.map((it) => {
    const mode = it.heroEligibilityMode || 'normal';
    if (mode === 'normal') return it;

    const reasons = [];
    if (mode === 'demote_low_substance') {
      if (it.ceremonial_or_low_substance) reasons.push('low_substance');
      if (!(it.displayBucket === 'lead' || it.displayBucket === 'secondary')) reasons.push('routine_bucket');
    } else if (mode === 'never_hero_without_corroboration') {
      if (it.displayBucket !== 'lead') reasons.push('no_corroboration_signal');
    }

    if (reasons.length === 0) return it;
    const msg =
      mode === 'demote_low_substance'
        ? `Hero-ineligible by source policy (${mode}): ${reasons.join(', ')}.`
        : `Hero-ineligible by source policy (${mode}).`;

    const existing = Array.isArray(it.relevanceExplanations) ? it.relevanceExplanations : [];
    return {
      ...it,
      relevanceExplanations: [...existing, { ruleId: 'trust:hero_ineligible', message: msg }],
    };
  });

  const heroEligible = surfacedWithTrustNotes.filter((it) => {
    const mode = it.heroEligibilityMode || 'normal';
    if (mode === 'normal') return true;
    if (mode === 'demote_low_substance') {
      return !it.ceremonial_or_low_substance && (it.displayBucket === 'lead' || it.displayBucket === 'secondary');
    }
    if (mode === 'never_hero_without_corroboration') {
      // Conservative default: do not hero these sources without stronger deterministic “impact” signals.
      return it.displayBucket === 'lead';
    }
    return true;
  });
  const ranked = [...heroEligible].sort(compareForLead);

  const picked = [];
  const countsByArea = new Map();
  const countsBySource = new Map();

  function canTake(it) {
    const area = it.institutionalArea || 'unknown';
    const src = it.sourceSlug || 'unknown';
    const ca = countsByArea.get(area) ?? 0;
    const cs = countsBySource.get(src) ?? 0;
    return ca < maxPerArea && cs < maxPerSource;
  }

  function take(it) {
    picked.push(it);
    const area = it.institutionalArea || 'unknown';
    const src = it.sourceSlug || 'unknown';
    countsByArea.set(area, (countsByArea.get(area) ?? 0) + 1);
    countsBySource.set(src, (countsBySource.get(src) ?? 0) + 1);
  }

  // Lead item
  for (const it of ranked) {
    if (!canTake(it)) continue;
    take(it);
    break;
  }

  // Secondary lead items
  for (const it of ranked) {
    if (picked.length >= maxLead + maxSecondary) break;
    if (picked.some((x) => x.id === it.id)) continue;
    if (!canTake(it)) continue;
    take(it);
  }

  const pickedIds = new Set(picked.map((p) => p.id));
  const remainder = items
    .filter((it) => !pickedIds.has(it.id))
    .map((it) => surfacedWithTrustNotes.find((x) => x.id === it.id) ?? it);

  return { leadItems: picked.slice(0, maxLead), secondaryLeadItems: picked.slice(maxLead), remainder };
}

/** Bounded OG:image backfill (direct fetch — avoids nested unstable_cache inside desk cache). */
async function enrichDeskItemsWithOg(items, opts = {}) {
  const max = Math.min(32, Math.max(0, Number(opts.max) ?? 16));
  const concurrency = Math.min(6, Math.max(1, Number(opts.concurrency) ?? 4));
  if (!Array.isArray(items) || max === 0) return;

  const need = [];
  for (const it of items) {
    if (!it?.canonicalUrl || it.imageUrl) continue;
    need.push(it);
    if (need.length >= max) break;
  }
  if (need.length === 0) return;

  const limit = pLimit(concurrency);
  await Promise.all(
    need.map((it) =>
      limit(async () => {
        const og = await fetchOgImageUncached(it.canonicalUrl);
        if (og) it.imageUrl = og;
      }),
    ),
  );
}

async function enrichLeadDeskImagesWithOg(leadItems, secondaryLeadItems) {
  const leads = Array.isArray(leadItems) ? leadItems : [];
  const secondary = Array.isArray(secondaryLeadItems) ? secondaryLeadItems : [];
  await enrichDeskItemsWithOg([...leads, ...secondary], { max: leads.length + secondary.length, concurrency: 5 });
}

/**
 * @param {string} deskLane 'osint' | 'voices' | 'watchdogs' | 'defense_ops' | 'indicators'
 */
async function buildLiveIntelDesk(deskLane) {
  const lane = normalizeDeskLane(deskLane);
  const snapId = snapshotIdForLane(lane);

  if (!intelDbConfigured()) {
    return {
      configured: false,
      stale: false,
      dataStale: false,
      snapshotFallback: false,
      liveReadOk: false,
      items: [],
      suppressedItems: [],
      duplicateItems: [],
      message: 'Supabase credentials not configured.',
      freshness: null,
      freshnessMeta: null,
      deskLane: lane,
    };
  }

  let freshness = { latestFetchedAt: null, latestSuccessfulIngestAt: null };
  try {
    freshness = await fetchIntelFreshnessForDeskLane(lane);
  } catch (e) {
    console.warn('[liveIntel] freshness query failed:', e);
  }

  const staleAfterMs = parseStaleAfterMinutes() * 60 * 1000;
  const limSurfaced = parseDeskSurfacedFetchLimit();
  const limDown = parseDeskDownrankedFetchLimit();
  const limSupp = parseDeskSuppressedFetchLimit();
  const maxVisible = parseDeskMaxVisibleItems();

  let surfacedRows;
  let downRows;
  let supRows;
  try {
    ;[surfacedRows, downRows, supRows] = await Promise.all([
      fetchSurfacedSourceItemsForLive(limSurfaced, lane),
      fetchDownrankedSourceItemsForLive(limDown, lane),
      fetchSuppressedSourceItemsForLive(limSupp, lane),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const snap = await loadLiveDeskSnapshot(snapId);
      if (snap?.items?.length) {
        const mergedFresh = snap.freshness ?? freshness;
        const freshnessMeta = buildFreshnessMeta(mergedFresh, 'snapshot', lane);
        return {
          configured: true,
          stale: true,
          dataStale: true,
          snapshotFallback: true,
          liveReadOk: false,
          items: snap.items,
          suppressedItems: snap.suppressedItems ?? [],
          duplicateItems: snap.duplicateItems ?? [],
          freshness: mergedFresh,
          freshnessMeta,
          message: `${deskLabelForLane(lane)} read failed; showing last saved desk (${augmentLiveDeskErrorMessage(msg)})`,
          intelSchemaMisconfigured: isIntelSchemaNotExposedError(msg),
          deskLane: lane,
        };
      }
    } catch (loadErr) {
      console.warn('[liveIntel] snapshot load failed:', loadErr);
    }

    const deskState = 'stale';
    const freshnessMeta = buildFreshnessMeta(freshness, deskState, lane);
    return {
      configured: true,
      stale: true,
      dataStale: true,
      snapshotFallback: false,
      liveReadOk: false,
      intelSchemaMisconfigured: isIntelSchemaNotExposedError(msg),
      items: [],
      suppressedItems: [],
      duplicateItems: [],
      freshness,
      freshnessMeta,
      message: augmentLiveDeskErrorMessage(msg),
      deskLane: lane,
    };
  }

  const mergedForDesk = [
    ...mapRowsToDeskItems(surfacedRows),
    ...mapRowsToDeskItems(downRows),
  ];
  const withDup = applyDuplicateClusterOverlay(mergedForDesk);
  const { main, duplicates } = partitionDuplicateLosers(withDup);
  let withDisplay = addDisplayFields(main);
  withDisplay = applyWatchdogLeadCorroborationRules(withDisplay, lane);
  withDisplay = applyAnecdotalIndicatorClassCaps(withDisplay);

  const { leadItems, secondaryLeadItems, remainder } = pickLeadBlock(withDisplay, {
    maxLead: 1,
    maxSecondary: 4,
    maxPerArea: 2,
    maxPerSource: 2,
  });

  await enrichLeadDeskImagesWithOg(leadItems, secondaryLeadItems);

  // The remaining list should feel more intentional than provenance-first alone,
  // but remain stable and explainable.
  remainder.sort((a, b) => {
    const ba = a.displayBucket === 'lead' ? 0 : a.displayBucket === 'secondary' ? 1 : 2;
    const bb = b.displayBucket === 'lead' ? 0 : b.displayBucket === 'secondary' ? 1 : 2;
    if (ba !== bb) return ba - bb;
    return compareDeskItems(a, b);
  });

  const visible = [...leadItems, ...secondaryLeadItems, ...remainder].slice(0, maxVisible);

  await enrichDeskItemsWithOg(visible, { max: 18, concurrency: 4 });

  const suppressedItems = mapRowsToDeskItems(supRows).sort(sortByPublishedDesc);
  const duplicateItems = [...duplicates].sort(sortByPublishedDesc);

  const hasEverIngested = Boolean(
    freshness.latestFetchedAt || freshness.latestSuccessfulIngestAt,
  );
  const dataStale =
    hasEverIngested &&
    isOlderThan(freshness.latestFetchedAt, staleAfterMs) &&
    isOlderThan(freshness.latestSuccessfulIngestAt, staleAfterMs);

  const deskState = dataStale ? 'stale' : 'fresh';
  const freshnessMeta = buildFreshnessMeta(freshness, deskState, lane);

  try {
    await saveLiveDeskSnapshot(snapId, {
      items: visible,
      suppressedItems,
      duplicateItems,
      leadItems,
      secondaryLeadItems,
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
    leadItems,
    secondaryLeadItems,
    suppressedItems,
    duplicateItems,
    freshness,
    freshnessMeta,
    message: dataStale ? freshnessMeta.staleReason : null,
    deskLane: lane,
  };
}

const getLiveIntelDeskOsint = unstable_cache(
  async () => buildLiveIntelDesk('osint'),
  ['intel-live-desk-v9', 'osint'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskVoices = unstable_cache(
  async () => buildLiveIntelDesk('voices'),
  ['intel-live-desk-v9', 'voices'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskWatchdogs = unstable_cache(
  async () => buildLiveIntelDesk('watchdogs'),
  ['intel-live-desk-v9', 'watchdogs'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskDefenseOps = unstable_cache(
  async () => buildLiveIntelDesk('defense_ops'),
  ['intel-live-desk-v9', 'defense_ops'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskIndicators = unstable_cache(
  async () => buildLiveIntelDesk('indicators'),
  ['intel-live-desk-v9', 'indicators'],
  { revalidate: 45, tags: ['intel-live'] },
);

export async function getLiveIntelDesk(deskLane = 'osint') {
  if (deskLane === 'voices') return getLiveIntelDeskVoices();
  if (deskLane === 'watchdogs') return getLiveIntelDeskWatchdogs();
  if (deskLane === 'defense_ops') return getLiveIntelDeskDefenseOps();
  if (deskLane === 'indicators') return getLiveIntelDeskIndicators();
  return getLiveIntelDeskOsint();
}
