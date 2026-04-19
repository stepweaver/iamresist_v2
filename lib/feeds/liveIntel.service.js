import 'server-only';

import pLimit from 'p-limit';

import { polishFeedCardImageUrl, shouldSkipFeedImageCandidate } from '@/lib/feeds/feedItemImage.js';
import { fetchOgImageFetchCached } from '@/lib/feeds/ogImage.js';
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
import { applyDuplicateClusterOverlay, compareDeskItems, provenanceRank } from '@/lib/intel/rank';
import { computeDisplayPriority } from '@/lib/intel/displayPriority';
import { computeTrustWarnings } from '@/lib/intel/trustWarnings';
import { whyItMattersStub } from '@/lib/intel/whyItMatters';
import { computeAccountabilityHighlights } from '@/lib/intel/accountabilitySignals';
import { assessMissionScope } from '@/lib/intel/missionScope';
import {
  applyAnecdotalIndicatorClassCaps,
  applyWatchdogLeadCorroborationRules,
} from '@/lib/intel/watchdogDeskPromotion';
import { partitionDeskRowsForPipeline } from '@/lib/intel/defaultDeskSurface';
import { unstable_cache } from 'next/cache';

function parseOgFallbackEnabled() {
  return String(process.env.INTEL_DESK_OG_FALLBACK || '').trim() === '1';
}

function isFederalRegisterCanonical(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return /(^|\.)federalregister\.gov$/i.test(u.hostname);
  } catch {
    return false;
  }
}

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
  if (deskLane === 'statements') return 6;
  return 1;
}

/**
 * @param {string | undefined} deskLane
 */
function normalizeDeskLane(deskLane) {
  if (
    deskLane === 'voices' ||
    deskLane === 'watchdogs' ||
    deskLane === 'defense_ops' ||
    deskLane === 'indicators' ||
    deskLane === 'statements' ||
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
  if (deskLane === 'statements') return 'Statements';
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
      const meta =
        e.meta && typeof e.meta === 'object' && !Array.isArray(e.meta) ? e.meta : undefined;
      out.push(meta ? { ruleId, message, meta } : { ruleId, message });
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

      let imageUrl = r.image_url ?? null;
      if (isFederalRegisterCanonical(r.canonical_url)) {
        imageUrl = null;
      }
      if (shouldSkipFeedImageCandidate(imageUrl)) {
        imageUrl = null;
      } else if (imageUrl) {
        imageUrl = polishFeedCardImageUrl(imageUrl) ?? imageUrl;
      }

      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        canonicalUrl: r.canonical_url,
        imageUrl,
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

function addDisplayFields(items, deskLane) {
  const lane = deskLane ?? 'osint';
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
      deskLane: lane,
      contentUseMode: it.contentUseMode,
      sourceFamily: it.sourceFamily,
    });
    const promotionDecision = {
      lane,
      surfaceState: it.surfaceState,
      provenanceClass: it.provenanceClass,
      sourceFamily: it.sourceFamily ?? null,
      stateChangeType: it.stateChangeType,
      relevanceScore: it.relevanceScore,
      displayPriority: r.displayPriority,
      displayBucket: r.displayBucket,
      freshness: {
        publishedAt: it.publishedAt ?? null,
        fetchedAt: it.fetchedAt ?? null,
      },
      trust: {
        trustWarningMode: it.trustWarningMode ?? 'none',
        trustWarningLevel: it.trustWarningLevel ?? 'info',
        requiresIndependentVerification: Boolean(it.requiresIndependentVerification),
        official_claim: Boolean(it.official_claim),
        contested_claim: Boolean(it.contested_claim),
        ceremonial_or_low_substance: Boolean(it.ceremonial_or_low_substance),
      },
      explain: {
        // Keep these arrays bounded for payload size while preserving debuggability.
        display: Array.isArray(r.displayExplanations) ? r.displayExplanations.slice(0, 8) : [],
        ingest: Array.isArray(it.relevanceExplanations) ? it.relevanceExplanations.slice(0, 10) : [],
      },
    };
    return { ...it, ...r, promotionDecision };
  });
}

function pickLeadBlock(items, opts = {}) {
  const deskLane = opts.deskLane ?? 'osint';
  const maxLead = typeof opts.maxLead === 'number' ? opts.maxLead : 1;
  const maxSecondary = typeof opts.maxSecondary === 'number' ? opts.maxSecondary : 4;
  const maxPerArea = typeof opts.maxPerArea === 'number' ? opts.maxPerArea : 2;
  const maxPerSource =
    typeof opts.maxPerSource === 'number' ? opts.maxPerSource : deskLane === 'watchdogs' ? 1 : 2;

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
    if (it.sourceSlug === 'indicator-pentagon-pizza') return false;
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
  if (!opts?.enabled) return;
  const max = Math.min(6, Math.max(0, Number(opts.max) ?? 2));
  const concurrency = Math.min(2, Math.max(1, Number(opts.concurrency) ?? 1));
  if (!Array.isArray(items) || max === 0) return;

  const need = [];
  for (const it of items) {
    if (!it?.canonicalUrl || it.imageUrl) continue;
    if (isFederalRegisterCanonical(it.canonicalUrl)) continue;
    need.push(it);
    if (need.length >= max) break;
  }
  if (need.length === 0) return;

  const limit = pLimit(concurrency);
  await Promise.all(
    need.map((it) =>
      limit(async () => {
        try {
          const og = await fetchOgImageFetchCached(it.canonicalUrl);
          if (og && !shouldSkipFeedImageCandidate(og)) it.imageUrl = polishFeedCardImageUrl(og) ?? og;
        } catch {
          // best-effort only; do not block the desk response
        }
      }),
    ),
  );
}

async function enrichLeadDeskImagesWithOg(leadItems, secondaryLeadItems) {
  const leads = Array.isArray(leadItems) ? leadItems : [];
  const secondary = Array.isArray(secondaryLeadItems) ? secondaryLeadItems : [];
  await enrichDeskItemsWithOg([...leads, ...secondary], {
    enabled: true,
    max: Math.min(2, leads.length + secondary.length),
    concurrency: 1,
  });
}

/** OG thumbnails for accountability overlay rows still missing art (bounded; same helper as main list). */
async function enrichAccountabilityHighlightsWithOg(highlights) {
  if (!parseOgFallbackEnabled()) return;
  const rows = Array.isArray(highlights) ? highlights : [];
  if (rows.length === 0) return;
  const limit = pLimit(1);
  await Promise.all(
    rows.map((h) =>
      limit(async () => {
        if (!h?.canonicalUrl || h.imageUrl) return;
        try {
          const og = await fetchOgImageFetchCached(h.canonicalUrl);
          if (og && !shouldSkipFeedImageCandidate(og)) h.imageUrl = polishFeedCardImageUrl(og) ?? og;
        } catch {
          // best-effort only
        }
      }),
    ),
  );
}

/**
 * @param {string} deskLane
 */
async function buildLiveIntelDesk(deskLane, opts = {}) {
  const lane = normalizeDeskLane(deskLane);
  const snapId = snapshotIdForLane(lane);
  const ogFallbackEnabled = parseOgFallbackEnabled();
  const useSnapshotFallback = opts.useSnapshotFallback !== false;

  if (!intelDbConfigured()) {
    return {
      configured: false,
      stale: false,
      dataStale: false,
      snapshotFallback: false,
      liveReadOk: false,
      items: [],
      preCapCandidates: [],
      leadItems: [],
      secondaryLeadItems: [],
      suppressedItems: [],
      duplicateItems: [],
      metadataOnlyItems: [],
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
  const limSurfaced =
    typeof opts.surfacedFetchLimit === 'number' && Number.isFinite(opts.surfacedFetchLimit)
      ? opts.surfacedFetchLimit
      : parseDeskSurfacedFetchLimit();
  const limDown =
    typeof opts.downrankedFetchLimit === 'number' && Number.isFinite(opts.downrankedFetchLimit)
      ? opts.downrankedFetchLimit
      : parseDeskDownrankedFetchLimit();
  const limSupp =
    typeof opts.suppressedFetchLimit === 'number' && Number.isFinite(opts.suppressedFetchLimit)
      ? opts.suppressedFetchLimit
      : parseDeskSuppressedFetchLimit();
  const maxVisible =
    typeof opts.maxVisibleItems === 'number' && Number.isFinite(opts.maxVisibleItems)
      ? opts.maxVisibleItems
      : parseDeskMaxVisibleItems();

  let surfacedRows;
  let downRows;
  let supRows;
  try {
    ;[surfacedRows, downRows, supRows] = await Promise.all([
      fetchSurfacedSourceItemsForLive(limSurfaced, lane),
      fetchDownrankedSourceItemsForLive(limDown, lane),
      limSupp > 0 ? fetchSuppressedSourceItemsForLive(limSupp, lane) : Promise.resolve([]),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (useSnapshotFallback) {
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
            preCapCandidates: snap.preCapCandidates ?? snap.items ?? [],
            leadItems: snap.leadItems ?? [],
            secondaryLeadItems: snap.secondaryLeadItems ?? [],
            suppressedItems: snap.suppressedItems ?? [],
            duplicateItems: snap.duplicateItems ?? [],
            metadataOnlyItems: snap.metadataOnlyItems ?? [],
            accountabilityHighlights: snap.accountabilityHighlights ?? [],
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
      preCapCandidates: [],
      leadItems: [],
      secondaryLeadItems: [],
      suppressedItems: [],
      duplicateItems: [],
      metadataOnlyItems: [],
      freshness,
      freshnessMeta,
      message: augmentLiveDeskErrorMessage(msg),
      deskLane: lane,
    };
  }

  const { surfacedMain, downMain, metadataOnlyRows } = partitionDeskRowsForPipeline(
    lane,
    surfacedRows,
    downRows,
  );

  const mergedForDesk = [...mapRowsToDeskItems(surfacedMain), ...mapRowsToDeskItems(downMain)];
  const withDup = applyDuplicateClusterOverlay(mergedForDesk);
  const { main, duplicates } = partitionDuplicateLosers(withDup);
  let withDisplay = addDisplayFields(main, lane);
  withDisplay = applyWatchdogLeadCorroborationRules(withDisplay, lane);
  withDisplay = applyAnecdotalIndicatorClassCaps(withDisplay);

  let accountabilityHighlights =
    lane === 'voices' || lane === 'indicators'
      ? []
      : computeAccountabilityHighlights(withDisplay, { max: 6 });

  const maxPerSource = lane === 'watchdogs' ? 1 : 2;

  const { leadItems, secondaryLeadItems, remainder } = pickLeadBlock(withDisplay, {
    deskLane: lane,
    maxLead: 1,
    maxSecondary: 4,
    maxPerArea: 2,
    maxPerSource,
  });

  if (ogFallbackEnabled) {
    await enrichLeadDeskImagesWithOg(leadItems, secondaryLeadItems);
  }

  // The remaining list should feel more intentional than provenance-first alone,
  // but remain stable and explainable.
  remainder.sort((a, b) => {
    const ba = a.displayBucket === 'lead' ? 0 : a.displayBucket === 'secondary' ? 1 : 2;
    const bb = b.displayBucket === 'lead' ? 0 : b.displayBucket === 'secondary' ? 1 : 2;
    if (ba !== bb) return ba - bb;
    return compareDeskItems(a, b);
  });

  const preCapCandidates = [...leadItems, ...secondaryLeadItems, ...remainder];
  const visible = preCapCandidates.slice(0, maxVisible);

  await enrichDeskItemsWithOg(visible, {
    enabled: ogFallbackEnabled,
    max: 2,
    concurrency: 1,
  });

  const imageByDeskItemId = new Map(visible.map((it) => [it.id, it.imageUrl ?? null]));
  accountabilityHighlights = accountabilityHighlights.map((h) => ({
    ...h,
    imageUrl: imageByDeskItemId.get(h.id) ?? h.imageUrl ?? null,
  }));
  await enrichAccountabilityHighlightsWithOg(accountabilityHighlights);

  const suppressedItems = mapRowsToDeskItems(supRows).sort(sortByPublishedDesc);
  const duplicateItems = [...duplicates].sort(sortByPublishedDesc);
  const metadataOnlyItems = mapRowsToDeskItems(metadataOnlyRows).sort(sortByPublishedDesc);

  const hasEverIngested = Boolean(
    freshness.latestFetchedAt || freshness.latestSuccessfulIngestAt,
  );
  const dataStale =
    hasEverIngested &&
    isOlderThan(freshness.latestFetchedAt, staleAfterMs) &&
    isOlderThan(freshness.latestSuccessfulIngestAt, staleAfterMs);

  const deskState = dataStale ? 'stale' : 'fresh';
  const freshnessMeta = buildFreshnessMeta(freshness, deskState, lane);

  if (opts.saveSnapshot !== false) {
    try {
      await saveLiveDeskSnapshot(snapId, {
        items: visible,
        preCapCandidates,
        suppressedItems,
        duplicateItems,
        leadItems,
        secondaryLeadItems,
        metadataOnlyItems,
        accountabilityHighlights,
        freshness,
        freshnessMeta,
      });
    } catch (e) {
      console.warn('[liveIntel] snapshot save failed:', e);
    }
  }

  return {
    configured: true,
    stale: dataStale,
    dataStale,
    snapshotFallback: false,
    liveReadOk: true,
    items: visible,
    preCapCandidates,
    leadItems,
    secondaryLeadItems,
    suppressedItems,
    duplicateItems,
    metadataOnlyItems,
    accountabilityHighlights,
    freshness,
    freshnessMeta,
    message: dataStale ? freshnessMeta.staleReason : null,
    deskLane: lane,
  };
}

const getLiveIntelDeskOsint = unstable_cache(
  async () => buildLiveIntelDesk('osint'),
  ['intel-live-desk-v10', 'osint'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskVoices = unstable_cache(
  async () => buildLiveIntelDesk('voices'),
  ['intel-live-desk-v10', 'voices'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskWatchdogs = unstable_cache(
  async () => buildLiveIntelDesk('watchdogs'),
  ['intel-live-desk-v10', 'watchdogs'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskDefenseOps = unstable_cache(
  async () => buildLiveIntelDesk('defense_ops'),
  ['intel-live-desk-v10', 'defense_ops'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskIndicators = unstable_cache(
  async () => buildLiveIntelDesk('indicators'),
  ['intel-live-desk-v10', 'indicators'],
  { revalidate: 45, tags: ['intel-live'] },
);

const getLiveIntelDeskStatements = unstable_cache(
  async () => buildLiveIntelDesk('statements'),
  ['intel-live-desk-v10', 'statements'],
  { revalidate: 45, tags: ['intel-live'] },
);

export async function getLiveIntelDesk(deskLane = 'osint') {
  if (deskLane === 'voices') return getLiveIntelDeskVoices();
  if (deskLane === 'watchdogs') return getLiveIntelDeskWatchdogs();
  if (deskLane === 'defense_ops') return getLiveIntelDeskDefenseOps();
  if (deskLane === 'indicators') return getLiveIntelDeskIndicators();
  if (deskLane === 'statements') return getLiveIntelDeskStatements();
  return getLiveIntelDeskOsint();
}

function sortedClusterEntries(clusterKeys) {
  if (!clusterKeys || typeof clusterKeys !== 'object' || Array.isArray(clusterKeys)) return [];
  return Object.entries(clusterKeys)
    .filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'string' && entry[1])
    .sort((a, b) => {
      const ka = `${a[0]}:${a[1]}`;
      const kb = `${b[0]}:${b[1]}`;
      return ka.localeCompare(kb);
    });
}

function buildDuplicateDecisionIndex(items) {
  const groups = new Map();
  for (const item of items) {
    for (const [key, value] of sortedClusterEntries(item.clusterKeys)) {
      const compositeKey = `${key}:${value}`;
      const arr = groups.get(compositeKey) ?? [];
      arr.push(item);
      groups.set(compositeKey, arr);
    }
  }

  const decisions = new Map();
  for (const [compositeKey, group] of groups) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      const pa = provenanceRank(a.provenanceClass);
      const pb = provenanceRank(b.provenanceClass);
      if (pa !== pb) return pa - pb;
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return a.id.localeCompare(b.id);
    });

    const winner = ranked[0];
    for (const current of ranked) {
      const existing = decisions.get(current.id);
      if (!existing || compositeKey < existing.duplicateClusterKey) {
        decisions.set(current.id, {
          duplicateClusterKey: compositeKey,
          duplicateSelection: current.id === winner.id ? 'winner' : 'loser',
          duplicateWinnerId: winner.id,
        });
      }
    }
  }

  return decisions;
}

function buildMissionScopeDebug(item) {
  const mission = assessMissionScope({
    title: item.title,
    summary: item.summary,
  });
  return {
    reason: mission.reason,
    positiveHits: mission.positiveHits,
    sportsHits: mission.sportsHits,
    softOffTopicHits: mission.softOffTopicHits,
  };
}

function buildDebugItem(item, listName, duplicateDecisionIndex) {
  const duplicateDecision = duplicateDecisionIndex.get(item.id) ?? null;
  return {
    id: item.id,
    listName,
    title: item.title,
    url: item.canonicalUrl,
    sourceSlug: item.sourceSlug,
    deskLane: item.deskLane ?? null,
    provenanceClass: item.provenanceClass,
    publishedAt: item.publishedAt,
    relevance_score: item.relevanceScore,
    surface_state: item.surfaceState,
    suppression_reason: item.suppressionReason,
    displayPriority: typeof item.displayPriority === 'number' ? item.displayPriority : null,
    displayBucket: item.displayBucket ?? null,
    missionScope: buildMissionScopeDebug(item),
    duplicateClusterKey: duplicateDecision?.duplicateClusterKey ?? null,
    duplicateSelection: duplicateDecision?.duplicateSelection ?? 'unique',
    duplicateWinnerId: duplicateDecision?.duplicateWinnerId ?? null,
    shortExplanations: {
      relevance: Array.isArray(item.relevanceExplanations) ? item.relevanceExplanations.slice(0, 10) : [],
      display: Array.isArray(item.displayExplanations) ? item.displayExplanations.slice(0, 8) : [],
    },
  };
}

export async function getLiveIntelDeskDebug(deskLane = 'osint') {
  const lane = normalizeDeskLane(deskLane);
  const desk = await getLiveIntelDesk(lane);
  const preCapCandidates = Array.isArray(desk.preCapCandidates) ? desk.preCapCandidates : [];
  const duplicatePool = [...preCapCandidates, ...(desk.duplicateItems ?? [])];
  const duplicateDecisionIndex = buildDuplicateDecisionIndex(duplicatePool);
  const visibleIds = new Set(Array.isArray(desk.items) ? desk.items.map((item) => item.id) : []);

  return {
    deskLane: lane,
    generatedAt: new Date().toISOString(),
    configured: desk.configured,
    stale: desk.stale,
    dataStale: desk.dataStale,
    snapshotFallback: desk.snapshotFallback,
    liveReadOk: desk.liveReadOk,
    message: desk.message ?? null,
    freshness: desk.freshness ?? null,
    freshnessMeta: desk.freshnessMeta ?? null,
    counts: {
      visible: Array.isArray(desk.items) ? desk.items.length : 0,
      lead: Array.isArray(desk.leadItems) ? desk.leadItems.length : 0,
      secondaryLead: Array.isArray(desk.secondaryLeadItems) ? desk.secondaryLeadItems.length : 0,
      preCapCandidates: preCapCandidates.length,
      suppressed: Array.isArray(desk.suppressedItems) ? desk.suppressedItems.length : 0,
      duplicates: Array.isArray(desk.duplicateItems) ? desk.duplicateItems.length : 0,
      metadataOnly: Array.isArray(desk.metadataOnlyItems) ? desk.metadataOnlyItems.length : 0,
    },
    leadItemIds: Array.isArray(desk.leadItems) ? desk.leadItems.map((item) => item.id) : [],
    secondaryLeadItemIds: Array.isArray(desk.secondaryLeadItems)
      ? desk.secondaryLeadItems.map((item) => item.id)
      : [],
    items: {
      preCapCandidates: preCapCandidates.map((item, index) => ({
        ...buildDebugItem(item, 'pre_cap_candidate', duplicateDecisionIndex),
        preCapRank: index + 1,
        madeVisible: visibleIds.has(item.id),
      })),
      visible: Array.isArray(desk.items)
        ? desk.items.map((item) => buildDebugItem(item, 'visible', duplicateDecisionIndex))
        : [],
      suppressed: Array.isArray(desk.suppressedItems)
        ? desk.suppressedItems.map((item) => buildDebugItem(item, 'suppressed', duplicateDecisionIndex))
        : [],
      duplicates: Array.isArray(desk.duplicateItems)
        ? desk.duplicateItems.map((item) => buildDebugItem(item, 'duplicates', duplicateDecisionIndex))
        : [],
      metadataOnly: Array.isArray(desk.metadataOnlyItems)
        ? desk.metadataOnlyItems.map((item) => buildDebugItem(item, 'metadata_only', duplicateDecisionIndex))
        : [],
    },
  };
}

const HOMEPAGE_BRIEFING_DESK_LIMITS = {
  surfacedFetchLimit: 32,
  downrankedFetchLimit: 10,
  suppressedFetchLimit: 0,
  maxVisibleItems: 32,
};

const getHomepageBriefingDeskOsint = unstable_cache(
  async () =>
    buildLiveIntelDesk('osint', {
      ...HOMEPAGE_BRIEFING_DESK_LIMITS,
      useSnapshotFallback: false,
      saveSnapshot: false,
    }),
  ['homepage-briefing-desk-v1', 'osint'],
  { revalidate: 45, tags: ['homepage-briefing', 'intel-live'] },
);

const getHomepageBriefingDeskWatchdogs = unstable_cache(
  async () =>
    buildLiveIntelDesk('watchdogs', {
      ...HOMEPAGE_BRIEFING_DESK_LIMITS,
      useSnapshotFallback: false,
      saveSnapshot: false,
    }),
  ['homepage-briefing-desk-v1', 'watchdogs'],
  { revalidate: 45, tags: ['homepage-briefing', 'intel-live'] },
);

const getHomepageBriefingDeskDefenseOps = unstable_cache(
  async () =>
    buildLiveIntelDesk('defense_ops', {
      ...HOMEPAGE_BRIEFING_DESK_LIMITS,
      useSnapshotFallback: false,
      saveSnapshot: false,
    }),
  ['homepage-briefing-desk-v1', 'defense_ops'],
  { revalidate: 45, tags: ['homepage-briefing', 'intel-live'] },
);

const getHomepageBriefingDeskVoices = unstable_cache(
  async () =>
    buildLiveIntelDesk('voices', {
      ...HOMEPAGE_BRIEFING_DESK_LIMITS,
      useSnapshotFallback: false,
      saveSnapshot: false,
    }),
  ['homepage-briefing-desk-v1', 'voices'],
  { revalidate: 45, tags: ['homepage-briefing', 'intel-live'] },
);

export async function getLiveIntelDeskForHomepageBriefing(deskLane = 'osint') {
  if (deskLane === 'voices') return getHomepageBriefingDeskVoices();
  if (deskLane === 'watchdogs') return getHomepageBriefingDeskWatchdogs();
  if (deskLane === 'defense_ops') return getHomepageBriefingDeskDefenseOps();
  return getHomepageBriefingDeskOsint();
}
