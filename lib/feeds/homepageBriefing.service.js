import 'server-only';

import { unstable_cache } from 'next/cache';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { getNewswireStories, normalizeStoryUrl, pickDiverseTopStories } from '@/lib/newswire';
import { promoteGlobally } from '@/lib/intel/globalPromotion';
import {
  BRIEFING_CANDIDATES_PER_DESK,
  BRIEFING_LANE_WEIGHT,
  BRIEFING_MAX_PER_LANE,
  BRIEFING_NEWSWIRE_POOL,
  BRIEFING_TOTAL_SLOTS,
} from '@/lib/feeds/homepageBriefing.weights';

const BRIEFING_PROMOTION_POOL_PER_DESK = 18;

export function clampScore(n, min = 0, max = 100) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Bridge RSS/newswire stories onto ~0–100 scale (aligned with intel displayPriority band).
 * Curated and fresh items score higher.
 */
export function bridgeNewswireStoryScore(story) {
  if (!story || typeof story !== 'object') return 40;
  let score = 42;
  if (story.isCurated) score += 14;
  const p = story.publishedAt ? new Date(story.publishedAt).getTime() : NaN;
  const ageH = Number.isFinite(p) ? (Date.now() - p) / 3600000 : 168;
  const recency = Math.max(0, 28 - Math.min(ageH * 0.35, 28));
  score += recency;
  return clampScore(score, 0, 100);
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
  const lanes = ['osint', 'watchdogs', 'defense_ops', 'statements', 'voices'];
  const pool = [];
  for (const lane of lanes) {
    const desk = desksByLane?.[lane];
    const rows = Array.isArray(desk?.items) ? desk.items : [];
    pool.push(...rows.slice(0, BRIEFING_PROMOTION_POOL_PER_DESK));
  }

  const promoted = promoteGlobally(pool, { limit: BRIEFING_TOTAL_SLOTS + 2 });
  return promoted.map((c) => {
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
      rawScore,
      weightedScore: weightedBriefingScore({ briefLane, rawScore }),
      intelItem,
    };
  });
}

/**
 * @param {unknown[]} stories
 */
function newswireCandidatesFromStories(stories) {
  if (!Array.isArray(stories) || stories.length === 0) return [];
  const pool = pickDiverseTopStories(stories, BRIEFING_NEWSWIRE_POOL, 2);
  const briefLane = 'newswire';
  return pool.map((story) => {
    const raw = bridgeNewswireStoryScore(story);
    return {
      kind: 'newswire',
      briefLane,
      rawScore: raw,
      weightedScore: weightedBriefingScore({ briefLane, rawScore: raw }),
      story,
    };
  });
}

/**
 * Sort by weighted score, dedupe URL, then greedy diversity cap.
 * @param {ReturnType<typeof newswireCandidatesFromStories>[number][]} candidates
 */
export function mergeAndRankBriefingCandidates(candidates) {
  const sorted = [...candidates].sort((a, b) => b.weightedScore - a.weightedScore);
  const seenUrl = new Set();
  const deduped = [];
  for (const c of sorted) {
    const key = itemDedupeKey(c);
    if (!key || seenUrl.has(key)) continue;
    seenUrl.add(key);
    deduped.push(c);
  }

  const out = [];
  const laneCounts = {};

  for (const c of deduped) {
    if (out.length >= BRIEFING_TOTAL_SLOTS) break;
    if (out.some((o) => sameBriefingEntry(o, c))) continue;
    const lane = c.briefLane;
    const n = laneCounts[lane] ?? 0;
    if (n >= BRIEFING_MAX_PER_LANE) continue;
    out.push(c);
    laneCounts[lane] = n + 1;
  }

  if (out.length < BRIEFING_TOTAL_SLOTS) {
    for (const c of deduped) {
      if (out.length >= BRIEFING_TOTAL_SLOTS) break;
      if (out.some((o) => sameBriefingEntry(o, c))) continue;
      out.push(c);
    }
  }

  return out.slice(0, BRIEFING_TOTAL_SLOTS);
}

async function buildHomeLiveBriefing() {
  const [
    newswireStories,
    osintDesk,
    watchdogsDesk,
    defenseDesk,
    statementsDesk,
    voicesDesk,
  ] = await Promise.all([
    getNewswireStories(),
    getLiveIntelDesk('osint'),
    getLiveIntelDesk('watchdogs'),
    getLiveIntelDesk('defense_ops'),
    getLiveIntelDesk('statements'),
    getLiveIntelDesk('voices'),
  ]);

  const desksByLane = {
    osint: osintDesk,
    watchdogs: watchdogsDesk,
    defense_ops: defenseDesk,
    statements: statementsDesk,
    voices: voicesDesk,
  };

  const promotedIntel = promotedIntelCandidatesFromDesks(desksByLane);

  const candidates = [
    ...newswireCandidatesFromStories(newswireStories ?? []),
    ...promotedIntel,
    // Backstop: keep a small per-lane slice so "global promotion" never returns empty
    // if intel pool is sparse or all suppressed.
    ...intelCandidatesFromDesk(osintDesk, 'osint'),
    ...intelCandidatesFromDesk(watchdogsDesk, 'watchdogs'),
    ...intelCandidatesFromDesk(defenseDesk, 'defense_ops'),
    ...intelCandidatesFromDesk(statementsDesk, 'statements'),
    ...intelCandidatesFromDesk(voicesDesk, 'voices'),
  ];

  const items = mergeAndRankBriefingCandidates(candidates);
  return { items };
}

export const getHomeLiveBriefing = unstable_cache(buildHomeLiveBriefing, ['homepage-live-briefing-v1'], {
  revalidate: 120,
  tags: ['homepage-briefing', 'newswire', 'intel-live'],
});
