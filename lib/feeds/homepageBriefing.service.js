import 'server-only';

import { unstable_cache } from 'next/cache';
import { getLiveIntelDeskForHomepageBriefing } from '@/lib/feeds/liveIntel.service';
import { assessHomepageNewswireScope } from '@/lib/feeds/homepageNewswireScope';
import { getNewswireStories, normalizeStoryUrl, pickDiverseTopStories } from '@/lib/newswire';
import { promoteGlobally } from '@/lib/intel/globalPromotion';
import {
  BRIEFING_LANE_WEIGHT,
  BRIEFING_MAX_PER_LANE,
  BRIEFING_NEWSWIRE_POOL,
  BRIEFING_TOTAL_SLOTS,
} from '@/lib/feeds/homepageBriefing.weights';
import {
  BRIEFING_CANDIDATES_PER_DESK,
  BRIEFING_MAX_PER_SOURCE,
  BRIEFING_MAX_PER_SOURCE_FAMILY,
  BRIEFING_PROMOTION_POOL_PER_DESK,
  BRIEFING_VOICES_MAX_TOTAL,
  FALLBACK_MAX_AGE_HOURS,
  FALLBACK_MAX_EXTRA_PER_LANE,
  FALLBACK_MIN_HOMEPAGE_SCORE,
  PROMOTED_PRIMARY_PRIORITY_BOOST,
  STORY_COHERENCE_MAX_COMPANIONS_PER_PROMOTED,
  STORY_COHERENCE_MIN_HOMEPAGE_SCORE,
  STORY_COHERENCE_MIN_SHARED_TOKENS,
  VOICES_COMMENTARY_FALLBACK_MAX_AGE_H,
  VOICES_COMMENTARY_FALLBACK_MIN_RAW,
  freshnessBucketFromAgeHours,
  hoursSincePublished,
  intelFreshnessMultiplier,
  newswireFreshnessMultiplier,
  shouldSuppressVoicesStaleCommentary,
} from '@/lib/feeds/homepageBriefing.policy';
import { evaluateStoryCoherence } from '@/lib/intel/storyCoherence';

const HOMEPAGE_BRIEFING_DESK_LIMITS = {
  surfacedFetchLimit: 32,
  downrankedFetchLimit: 10,
  suppressedFetchLimit: 0,
  maxVisibleItems: 32,
};

export function clampScore(n, min = 0, max = 100) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Bridge RSS/newswire stories onto ~0–100 scale (aligned with intel displayPriority band).
 * Curated and fresh items score higher.
 */
export function bridgeNewswireStoryScore(story, missionScoreDelta = 0) {
  if (!story || typeof story !== 'object') return 40;

  let score = 42;

  if (story.isCurated) score += 14;

  const p = story.publishedAt ? new Date(story.publishedAt).getTime() : NaN;
  const ageH = Number.isFinite(p) ? (Date.now() - p) / 3600000 : 168;
  const recency = Math.max(0, 28 - Math.min(ageH * 0.35, 28));
  score += recency;

  score += Math.round((missionScoreDelta || 0) * 0.75);

  return clampScore(score, 0, 100);
}

export function homepageBriefingDisplayDedupeKey(entry) {
  if (!entry || typeof entry !== 'object') return null;

  if (entry.kind === 'newswire') {
    const url = normalizeStoryUrl(entry.story?.url || '');
    if (url) return `url:${url}`;
    const id = entry.story?.id;
    return id ? `nw:${id}` : null;
  }

  if (entry.kind === 'intel') {
    const url = normalizeStoryUrl(entry.intelItem?.canonicalUrl || '');
    if (url) return `url:${url}`;
    const id = entry.intelItem?.id;
    return id ? `intel:${id}` : null;
  }

  return null;
}

export function dedupeHomepageBriefingItemsForDisplay(items) {
  const rows = Array.isArray(items) ? items : [];
  const seen = new Set();
  const out = [];

  for (const entry of rows) {
    const key = homepageBriefingDisplayDedupeKey(entry);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(entry);
  }

  return out;
}

function itemDedupeKey(entry) {
  if (entry.kind === 'newswire') {
    return normalizeStoryUrl(entry.story?.url || '') || `nw:${entry.story?.id || ''}`;
  }
  const u = normalizeStoryUrl(entry.intelItem?.canonicalUrl || '');
  return u || `intel:${entry.intelItem?.id || ''}`;
}

function sameBriefingEntry(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'newswire') return a.story?.id === b.story?.id;
  return a.intelItem?.id === b.intelItem?.id;
}

function briefingEntryId(entry) {
  if (!entry) return 'unknown';
  if (entry.kind === 'newswire') return `newswire:${entry.story?.id ?? 'unknown'}`;
  return `intel:${entry.intelItem?.id ?? 'unknown'}`;
}

function briefingEntryText(entry) {
  if (!entry) return '';
  if (entry.kind === 'newswire') {
    return [entry.story?.title ?? '', entry.story?.excerpt ?? '', entry.story?.note ?? '']
      .filter(Boolean)
      .join('\n');
  }
  return [entry.intelItem?.title ?? '', entry.intelItem?.summary ?? ''].filter(Boolean).join('\n');
}

function briefingEntryEventType(entry) {
  if (!entry || entry.kind !== 'intel') return null;
  return entry.intelItem?.promotionEventType ?? entry.intelItem?.globalPromotion?.eventType ?? null;
}

function coherenceSignalForEntries(anchor, candidate) {
  if (!anchor || !candidate || sameBriefingEntry(anchor, candidate)) return null;
  if (anchor.briefingOrigin !== 'promoted' || anchor.kind !== 'intel') return null;
  if (candidate.briefingOrigin === 'promoted') return null;

  const metrics = evaluateStoryCoherence({
    anchorText: [briefingEntryText(anchor), ...(anchor.intelItem?.promotionReasons ?? [])]
      .filter(Boolean)
      .join('\n'),
    candidateText: briefingEntryText(candidate),
    anchorPublishedAt: anchor.intelItem?.publishedAt ?? null,
    candidatePublishedAt:
      candidate.kind === 'newswire' ? candidate.story?.publishedAt ?? null : candidate.intelItem?.publishedAt ?? null,
    anchorEventType: briefingEntryEventType(anchor),
    candidateEventType: candidate.kind === 'intel' ? briefingEntryEventType(candidate) : null,
    minSharedTokens: STORY_COHERENCE_MIN_SHARED_TOKENS,
  });
  if (!metrics) return null;

  const boost = candidate.kind === 'newswire' ? 4 : 2;
  return {
    anchorEntryId: briefingEntryId(anchor),
    anchorItemId: anchor.intelItem?.id ?? null,
    boost,
    overlapScore: metrics.overlapScore,
    sharedEventType: metrics.sharedEventType,
    sharedTokens: metrics.sharedTokens,
  };
}

function bestCoherenceSignal(candidate, promotedAnchors) {
  let best = null;
  for (const anchor of promotedAnchors) {
    const signal = coherenceSignalForEntries(anchor, candidate);
    if (!signal) continue;
    if (
      !best ||
      signal.sharedTokens > best.sharedTokens ||
      (signal.sharedTokens === best.sharedTokens && signal.overlapScore > best.overlapScore) ||
      (signal.sharedTokens === best.sharedTokens &&
        signal.overlapScore === best.overlapScore &&
        String(signal.anchorItemId ?? '').localeCompare(String(best.anchorItemId ?? '')) < 0)
    ) {
      best = signal;
    }
  }
  return best;
}

function primarySelectionPriority(entry) {
  const promotedPriorityBoost = entry.briefingOrigin === 'promoted' ? PROMOTED_PRIMARY_PRIORITY_BOOST : 0;
  const coherenceSupportBoost = entry.coherenceSupport?.boost ?? 0;
  return entry.homepageBriefingScore + promotedPriorityBoost + coherenceSupportBoost;
}

/**
 * @param {object} params
 * @param {import('@/lib/feeds/homepageBriefing.weights').BriefingLane} params.briefLane
 * @param {number} params.rawScore
 */
export function weightedBriefingScore({ briefLane, rawScore }) {
  const w = BRIEFING_LANE_WEIGHT[briefLane] ?? 1;
  return rawScore * w;
}

/**
 * @param {object} entry
 * @param {string | undefined} entry.briefingOrigin
 */
export function computeHomepageBriefingScore(entry) {
  const briefLane = entry.briefLane;
  const weightedLaneScore = entry.weightedScore ?? weightedBriefingScore(entry);
  if (entry.kind === 'newswire') {
    const iso = entry.story?.publishedAt ?? null;
    const age = hoursSincePublished(iso);
    return weightedLaneScore * newswireFreshnessMultiplier(age);
  }
  const iso = entry.intelItem?.publishedAt ?? null;
  const age = hoursSincePublished(iso);
  const bucket = freshnessBucketFromAgeHours(age);
  const prov = entry.intelItem?.provenanceClass;
  const mult = intelFreshnessMultiplier(bucket, briefLane, prov);
  return weightedLaneScore * mult;
}

function sourceKeyForEntry(entry) {
  if (entry.kind === 'newswire') {
    return String(entry.story?.sourceSlug || 'newswire');
  }
  return String(entry.intelItem?.sourceSlug || 'unknown');
}

function familyKeyForEntry(entry) {
  if (entry.kind === 'newswire') return 'newswire';
  return String(entry.intelItem?.sourceFamily || 'general');
}

/**
 * @param {object} entry
 * @param {number} homepageScore
 */
export function passesFallbackGate(entry, homepageScore) {
  const lane = entry.briefLane;
  const age = hoursSincePublished(
    entry.kind === 'newswire' ? entry.story?.publishedAt : entry.intelItem?.publishedAt,
  );
  if (age != null && age > FALLBACK_MAX_AGE_HOURS[lane]) return false;
  if (homepageScore < FALLBACK_MIN_HOMEPAGE_SCORE[lane]) return false;
  if (lane === 'voices' && entry.intelItem?.provenanceClass === 'COMMENTARY') {
    const raw = typeof entry.rawScore === 'number' ? entry.rawScore : 0;
    if (age != null && age > VOICES_COMMENTARY_FALLBACK_MAX_AGE_H && raw < VOICES_COMMENTARY_FALLBACK_MIN_RAW) {
      return false;
    }
  }
  return true;
}

/**
 * @param {object} entry
 * @param {import('@/lib/feeds/homepageBriefing.policy').BriefingCandidateOrigin} origin
 * @param {'primary' | 'fallback'} selectionPhase
 */
function buildBriefingExplain(entry, origin, selectionPhase, homepageScore) {
  const briefLane = entry.briefLane;
  const publishedAt =
    entry.kind === 'newswire' ? entry.story?.publishedAt ?? null : entry.intelItem?.publishedAt ?? null;
  const ageHours = hoursSincePublished(publishedAt);
  const freshnessBucket = freshnessBucketFromAgeHours(ageHours);
  const weightedLaneScore = entry.weightedScore ?? weightedBriefingScore(entry);
  let freshnessMultiplier = 1;
  if (entry.kind === 'newswire') {
    freshnessMultiplier = newswireFreshnessMultiplier(ageHours);
  } else {
    const prov = entry.intelItem?.provenanceClass;
    freshnessMultiplier = intelFreshnessMultiplier(freshnessBucket, briefLane, prov);
  }

  const rawPromotionScore =
    entry.kind === 'intel'
      ? typeof entry.rawScore === 'number'
        ? entry.rawScore
        : entry.intelItem?.displayPriority ?? null
      : typeof entry.rawScore === 'number'
        ? entry.rawScore
        : null;

  const globalPromotion = entry.kind === 'intel' ? entry.intelItem?.globalPromotion ?? null : null;
  const representative =
    entry.kind === 'intel'
      ? {
          itemId: entry.intelItem?.id ?? null,
          sourceSlug: entry.intelItem?.sourceSlug ?? null,
          sourceName: entry.intelItem?.sourceName ?? null,
          provenanceClass: entry.intelItem?.provenanceClass ?? null,
          displayPriority:
            typeof entry.intelItem?.displayPriority === 'number' ? entry.intelItem.displayPriority : null,
          displayBucket: entry.intelItem?.displayBucket ?? null,
          clusterItemCount:
            typeof entry.intelItem?.clusterItemCount === 'number' ? entry.intelItem.clusterItemCount : 1,
        }
      : {
          itemId: entry.story?.id ?? null,
          sourceSlug: entry.story?.sourceSlug ?? null,
          sourceName: entry.story?.source ?? null,
          provenanceClass: 'NEWSWIRE',
          displayPriority: null,
          displayBucket: null,
          clusterItemCount: 1,
        };

  return {
    lane: briefLane,
    publishedAt,
    ageHours,
    freshnessBucket,
    freshnessMultiplier: Math.round(freshnessMultiplier * 1000) / 1000,
    eventType:
      entry.kind === 'intel'
        ? entry.intelItem?.promotionEventType ?? entry.intelItem?.globalPromotion?.eventType ?? null
        : 'newswire',
    rawPromotionScore,
    weightedLaneScore: Math.round(weightedLaneScore * 100) / 100,
    homepageBriefingScore: Math.round(homepageScore * 100) / 100,
    primarySelectionPriority: Math.round((entry.primarySelectionPriority ?? homepageScore) * 100) / 100,
    promotionReasons:
      entry.kind === 'intel'
        ? Array.isArray(entry.intelItem?.promotionReasons)
          ? entry.intelItem.promotionReasons
          : []
        : [],
    promotionContributions:
      entry.kind === 'intel' && Array.isArray(globalPromotion?.contributions)
        ? globalPromotion.contributions.map((contribution) => ({
            code: contribution?.code ?? null,
            delta: typeof contribution?.delta === 'number' ? contribution.delta : null,
            message: contribution?.message ?? null,
          }))
        : [],
    corroboration:
      entry.kind === 'intel' && globalPromotion?.corroboration
        ? {
            itemCount: globalPromotion.corroboration.itemCount ?? null,
            sourceCount: globalPromotion.corroboration.sourceCount ?? null,
            laneCount: globalPromotion.corroboration.laneCount ?? null,
            familyCount: globalPromotion.corroboration.familyCount ?? null,
          }
        : null,
    creatorConvergence:
      entry.kind === 'intel' && globalPromotion?.creatorConvergence
        ? {
            active: Boolean(globalPromotion.creatorConvergence.active),
            itemCount: globalPromotion.creatorConvergence.itemCount ?? 0,
            sourceCount: globalPromotion.creatorConvergence.sourceCount ?? 0,
            supportingItemCount: globalPromotion.creatorConvergence.supportingItemCount ?? 0,
            supportingLaneCount: globalPromotion.creatorConvergence.supportingLaneCount ?? 0,
            sharedTokens: Array.isArray(globalPromotion.creatorConvergence.sharedTokens)
              ? globalPromotion.creatorConvergence.sharedTokens
              : [],
            latestHours:
              typeof globalPromotion.creatorConvergence.latestHours === 'number'
                ? globalPromotion.creatorConvergence.latestHours
                : null,
          }
        : null,
    representative,
    origin,
    selectionPhase,
    promotedPriorityApplied: entry.briefingOrigin === 'promoted',
    sameStoryCoherenceSupport: entry.coherenceSupport
      ? {
          applied: true,
          anchorItemId: entry.coherenceSupport.anchorItemId,
          anchorEntryId: entry.coherenceSupport.anchorEntryId,
          boost: entry.coherenceSupport.boost,
          sharedTokens: entry.coherenceSupport.sharedTokens,
          overlapScore: entry.coherenceSupport.overlapScore,
          sharedEventType: entry.coherenceSupport.sharedEventType,
          capOverrideUsed: Boolean(entry.capOverrideUsed),
        }
      : {
          applied: false,
        },
  };
}

function stripBriefingExplain(items) {
  return items.map((it) => {
    const { briefingExplain, homepageBriefingScore, briefingOrigin, ...rest } = it;
    return rest;
  });
}

/**
 * Sort by homepage score, dedupe URL, lane caps + source/family caps, then strict fallback.
 * @param {ReturnType<typeof newswireCandidatesFromStories>[number][]} candidates
 */
export function mergeAndRankBriefingCandidates(candidates) {
  const prelim = (Array.isArray(candidates) ? candidates : []).map((c) => {
    const homepageBriefingScore = computeHomepageBriefingScore(c);
    return { ...c, homepageBriefingScore };
  });

  const promotedAnchors = prelim
    .filter((c) => c.briefingOrigin === 'promoted' && c.kind === 'intel')
    .sort((a, b) => b.homepageBriefingScore - a.homepageBriefingScore);

  const scored = prelim.map((c) => {
    const coherenceSupport = bestCoherenceSignal(c, promotedAnchors);
    return {
      ...c,
      coherenceSupport,
      primarySelectionPriority: primarySelectionPriority({ ...c, coherenceSupport }),
    };
  });

  scored.sort((a, b) => {
    if (b.primarySelectionPriority !== a.primarySelectionPriority) {
      return b.primarySelectionPriority - a.primarySelectionPriority;
    }
    if (b.homepageBriefingScore !== a.homepageBriefingScore) {
      return b.homepageBriefingScore - a.homepageBriefingScore;
    }
    if ((b.rawScore ?? 0) !== (a.rawScore ?? 0)) return (b.rawScore ?? 0) - (a.rawScore ?? 0);
    return briefingEntryId(a).localeCompare(briefingEntryId(b));
  });

  const seenUrl = new Set();
  const deduped = [];
  for (const c of scored) {
    const key = itemDedupeKey(c);
    if (!key || seenUrl.has(key)) continue;
    seenUrl.add(key);
    deduped.push(c);
  }

  const out = [];
  const laneCounts = {};
  const sourceCounts = {};
  const familyCounts = {};
  const fallbackLaneAdds = {};
  const coherenceCompanionCounts = {};

  const tryPush = (c, phase) => {
    if (out.length >= BRIEFING_TOTAL_SLOTS) return false;
    if (out.some((o) => sameBriefingEntry(o, c))) return false;
    const lane = c.briefLane;
    const sk = sourceKeyForEntry(c);
    const fk = familyKeyForEntry(c);
    const coherenceKey = c.coherenceSupport?.anchorEntryId ?? null;
    const coherentCompanionEligible =
      phase === 'primary' &&
      coherenceKey &&
      c.homepageBriefingScore >= STORY_COHERENCE_MIN_HOMEPAGE_SCORE &&
      out.some((o) => briefingEntryId(o) === coherenceKey);

    const pub = c.kind === 'newswire' ? c.story?.publishedAt : c.intelItem?.publishedAt;
    const ageH = hoursSincePublished(pub);
    if (shouldSuppressVoicesStaleCommentary(c, c.homepageBriefingScore, ageH)) return false;

    if (lane === 'voices' && (laneCounts[lane] ?? 0) >= BRIEFING_VOICES_MAX_TOTAL) return false;

    let capOverrideUsed = false;
    if (phase === 'primary') {
      const n = laneCounts[lane] ?? 0;
      if (n >= BRIEFING_MAX_PER_LANE) {
        if (
          coherentCompanionEligible &&
          (coherenceCompanionCounts[coherenceKey] ?? 0) < STORY_COHERENCE_MAX_COMPANIONS_PER_PROMOTED
        ) {
          capOverrideUsed = true;
        } else {
          return false;
        }
      }
    } else {
      const fb = fallbackLaneAdds[lane] ?? 0;
      if (fb >= (FALLBACK_MAX_EXTRA_PER_LANE[lane] ?? 0)) return false;
      if (!passesFallbackGate(c, c.homepageBriefingScore)) return false;
    }

    const sc = sourceCounts[sk] ?? 0;
    if (sc >= BRIEFING_MAX_PER_SOURCE) return false;
    const fc = familyCounts[fk] ?? 0;
    if (fc >= BRIEFING_MAX_PER_SOURCE_FAMILY) {
      if (
        coherentCompanionEligible &&
        !capOverrideUsed &&
        (coherenceCompanionCounts[coherenceKey] ?? 0) < STORY_COHERENCE_MAX_COMPANIONS_PER_PROMOTED
      ) {
        capOverrideUsed = true;
      } else {
        return false;
      }
    }

    const origin = c.briefingOrigin ?? 'lane_backstop';
    const selectedEntry = {
      ...c,
      capOverrideUsed,
    };
    out.push({
      ...selectedEntry,
      briefingExplain: buildBriefingExplain(selectedEntry, origin, phase, c.homepageBriefingScore),
    });
    laneCounts[lane] = (laneCounts[lane] ?? 0) + 1;
    if (phase === 'fallback') {
      fallbackLaneAdds[lane] = (fallbackLaneAdds[lane] ?? 0) + 1;
    }
    if (capOverrideUsed && coherenceKey) {
      coherenceCompanionCounts[coherenceKey] = (coherenceCompanionCounts[coherenceKey] ?? 0) + 1;
    }
    sourceCounts[sk] = sc + 1;
    familyCounts[fk] = fc + 1;
    return true;
  };

  for (const c of deduped) {
    if (out.length >= BRIEFING_TOTAL_SLOTS) break;
    tryPush(c, 'primary');
  }

  for (const c of deduped) {
    if (out.length >= BRIEFING_TOTAL_SLOTS) break;
    if (out.some((o) => sameBriefingEntry(o, c))) continue;
    tryPush(c, 'fallback');
  }

  return out.slice(0, BRIEFING_TOTAL_SLOTS);
}

/**
 * @param {Awaited<ReturnType<typeof getLiveIntelDesk>>} desk
 * @param {import('@/lib/feeds/homepageBriefing.weights').BriefingLane} briefLane
 */
function intelCandidatesFromDesk(desk, briefLane) {
  if (!desk?.configured || !Array.isArray(desk.items) || desk.items.length === 0) {
    return [];
  }
  const slice = desk.items.slice(0, BRIEFING_CANDIDATES_PER_DESK);
  return slice.map((intelItem) => {
    const raw =
      typeof intelItem.displayPriority === 'number' && Number.isFinite(intelItem.displayPriority)
        ? intelItem.displayPriority
        : 50;
    return {
      kind: 'intel',
      briefLane,
      briefingOrigin: 'lane_backstop',
      rawScore: raw,
      weightedScore: weightedBriefingScore({ briefLane, rawScore: raw }),
      intelItem,
    };
  });
}

/**
 * Global promotion across intel desks (observer-layer).
 * Pulls a wider per-desk pool, clusters lightly, and promotes based on deterministic reasons.
 */
function promotedIntelCandidatesFromDesks(desksByLane) {
  const lanes = ['osint', 'watchdogs', 'defense_ops', 'voices'];
  const pool = [];
  for (const lane of lanes) {
    const desk = desksByLane?.[lane];
    const rows = Array.isArray(desk?.items) ? desk.items : [];
    pool.push(...rows.slice(0, BRIEFING_PROMOTION_POOL_PER_DESK));
  }

  const promoted = promoteGlobally(pool, { limit: BRIEFING_TOTAL_SLOTS + 2 });
  return promoted
    .map((c) => {
      const intelItem = {
        ...c.representative,
        globalPromotion: c.decision,
        promotionReasons: c.decision?.reasons ?? [],
        promotionEventType: c.decision?.eventType ?? 'generic_report',
        clusterItemCount: c.decision?.corroboration?.itemCount ?? 1,
      };
      const briefLane = intelItem?.deskLane || 'osint';
      const rawScore =
        typeof c.decision?.totalScore === 'number' && Number.isFinite(c.decision.totalScore)
          ? c.decision.totalScore
          : typeof intelItem.displayPriority === 'number'
            ? intelItem.displayPriority
            : 50;
      return {
        kind: 'intel',
        briefLane,
        briefingOrigin: 'promoted',
        rawScore,
        weightedScore: weightedBriefingScore({ briefLane, rawScore }),
        intelItem,
      };
    })
    .filter((entry) => entry.briefLane !== 'voices');
}

/**
 * @param {unknown[]} stories
 */
function summarizeBriefingSelection(items) {
  const selected = Array.isArray(items) ? items : [];
  const countBy = (fn) => {
    const out = {};
    for (const item of selected) {
      const key = fn(item);
      if (!key) continue;
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  };

  const promotionReasonCounts = {};
  const contributionCodeCounts = {};
  let creatorConvergenceSelectedCount = 0;
  let sameStoryCoherenceCompanionCount = 0;

  for (const item of selected) {
    const explain = item?.briefingExplain;
    const reasons = Array.isArray(explain?.promotionReasons) ? explain.promotionReasons : [];
    for (const reason of reasons) {
      promotionReasonCounts[reason] = (promotionReasonCounts[reason] ?? 0) + 1;
    }

    const contributions = Array.isArray(explain?.promotionContributions) ? explain.promotionContributions : [];
    for (const contribution of contributions) {
      const code = contribution?.code;
      if (!code) continue;
      contributionCodeCounts[code] = (contributionCodeCounts[code] ?? 0) + 1;
    }

    if (explain?.creatorConvergence?.active) creatorConvergenceSelectedCount += 1;
    if (explain?.sameStoryCoherenceSupport?.applied) sameStoryCoherenceCompanionCount += 1;
  }

  return {
    totalSelected: selected.length,
    byOrigin: countBy((item) => item?.briefingExplain?.origin ?? null),
    byLane: countBy((item) => item?.briefingExplain?.lane ?? null),
    bySelectionPhase: countBy((item) => item?.briefingExplain?.selectionPhase ?? null),
    promotionReasonCounts,
    contributionCodeCounts,
    creatorConvergenceSelectedCount,
    sameStoryCoherenceCompanionCount,
  };
}

function newswireCandidatesFromStories(stories) {
  if (!Array.isArray(stories) || stories.length === 0) return [];

  const pool = pickDiverseTopStories(stories, BRIEFING_NEWSWIRE_POOL, 2);
  const briefLane = 'newswire';

  return pool
    .map((story) => {
      const { missionScope, allowOnHomepageBriefing } = assessHomepageNewswireScope(story);
      if (!allowOnHomepageBriefing) return null;

      const raw = bridgeNewswireStoryScore(story, missionScope.scoreDelta ?? 0);

      return {
        kind: 'newswire',
        briefLane,
        briefingOrigin: 'newswire',
        rawScore: raw,
        weightedScore: weightedBriefingScore({ briefLane, rawScore: raw }),
        story: {
          ...story,
          missionScope,
        },
      };
    })
    .filter(Boolean);
}

async function buildHomeLiveBriefing() {
  const [newswireStories, osintDesk, watchdogsDesk, defenseDesk, voicesDesk] = await Promise.all([
    getNewswireStories(),
    getLiveIntelDeskForHomepageBriefing('osint'),
    getLiveIntelDeskForHomepageBriefing('watchdogs'),
    getLiveIntelDeskForHomepageBriefing('defense_ops'),
    getLiveIntelDeskForHomepageBriefing('voices'),
  ]);

  const desksByLane = {
    osint: osintDesk,
    watchdogs: watchdogsDesk,
    defense_ops: defenseDesk,
    voices: voicesDesk,
  };

  const promotedIntel = promotedIntelCandidatesFromDesks(desksByLane);

  const nw = newswireCandidatesFromStories(newswireStories ?? []);
  const backOsint = intelCandidatesFromDesk(osintDesk, 'osint');
  const backWatch = intelCandidatesFromDesk(watchdogsDesk, 'watchdogs');
  const backDef = intelCandidatesFromDesk(defenseDesk, 'defense_ops');
  const candidates = [...nw, ...promotedIntel, ...backOsint, ...backWatch, ...backDef];

  const ranked = mergeAndRankBriefingCandidates(candidates);
  const items = dedupeHomepageBriefingItemsForDisplay(ranked);
  const explain = {
    policyVersion: 'homepage-briefing-v3',
    generatedAt: new Date().toISOString(),
    pool: {
      promotedIntel: promotedIntel.length,
      laneBackstop: backOsint.length + backWatch.length + backDef.length,
      newswire: nw.length,
      briefingDesk: {
        limits: HOMEPAGE_BRIEFING_DESK_LIMITS,
        ogFallbackEnabled: String(process.env.INTEL_DESK_OG_FALLBACK || '').trim() === '1',
        desks: {
          osint: Array.isArray(osintDesk?.items) ? osintDesk.items.length : 0,
          watchdogs: Array.isArray(watchdogsDesk?.items) ? watchdogsDesk.items.length : 0,
          defense_ops: Array.isArray(defenseDesk?.items) ? defenseDesk.items.length : 0,
          voices: Array.isArray(voicesDesk?.items) ? voicesDesk.items.length : 0,
        },
      },
    },
    summary: summarizeBriefingSelection(items),
    selected: items.map((it) => it.briefingExplain),
  };

  return { items, explain };
}

const cachedBriefing = unstable_cache(
  async () => buildHomeLiveBriefing(),
  ['homepage-live-briefing-v4'],
  {
    revalidate: 120,
    tags: ['homepage-briefing', 'newswire', 'intel-live'],
  },
);

export async function getHomeLiveBriefing() {
  const { items, explain: _e } = await cachedBriefing();
  return { items: stripBriefingExplain(items) };
}

/** Full payload for debug / internal inspection (includes per-item explanation). */
export async function getHomeLiveBriefingWithExplain() {
  return cachedBriefing();
}

