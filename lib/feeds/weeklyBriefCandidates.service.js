import 'server-only';

import { getHomeLiveBriefingWithExplain, computeHomepageBriefingScore, weightedBriefingScore, bridgeNewswireStoryScore } from '@/lib/feeds/homepageBriefing.service';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getNewswireStories, normalizeStoryUrl } from '@/lib/newswire';
import { briefingLaneLabel } from '@/lib/feeds/homepageBriefing.weights';

const DEFAULT_WINDOW_DAYS = 7;

const SOURCE_SYSTEM_WEIGHT = {
  'homepage-briefing': 400,
  'live-intel-desk': 300,
  newswire: 200,
  'homepage-intel-feed': 100,
};

const LIVE_INTEL_LANES = ['osint', 'watchdogs', 'defense_ops', 'voices'];

function toIso(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function hoursSince(iso, nowMs = Date.now()) {
  const ts = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;
  return (nowMs - ts) / 3600000;
}

export function clampScore(n, min = 0, max = 100) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function buildWeeklyCandidateWindow(options = {}) {
  const nowIso = toIso(options.now ?? new Date()) ?? new Date().toISOString();
  const endIso = toIso(options.windowEnd) ?? nowIso;
  const days = Math.max(1, Number.parseInt(String(options.windowDays ?? DEFAULT_WINDOW_DAYS), 10) || DEFAULT_WINDOW_DAYS);
  const startIso =
    toIso(options.windowStart) ??
    new Date(new Date(endIso).getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  return {
    start: startIso,
    end: endIso,
    days,
  };
}

function isWithinWindow(iso, window) {
  const ts = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(ts)) return false;
  const start = new Date(window.start).getTime();
  const end = new Date(window.end).getTime();
  return ts >= start && ts <= end;
}

function normalizeCandidateUrl(candidate) {
  const url = candidate?.canonicalUrl || candidate?.url || '';
  return normalizeStoryUrl(url);
}

function compareCandidates(a, b) {
  const compositeDiff = (b.compositeScore ?? 0) - (a.compositeScore ?? 0);
  if (compositeDiff !== 0) return compositeDiff;

  const sourceDiff = (b.sourceScore ?? 0) - (a.sourceScore ?? 0);
  if (sourceDiff !== 0) return sourceDiff;

  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  if (tb !== ta) return tb - ta;

  return String(a.id || '').localeCompare(String(b.id || ''));
}

function createIntelScore(item, lane) {
  const rawScore =
    typeof item?.displayPriority === 'number' && Number.isFinite(item.displayPriority)
      ? item.displayPriority
      : 50;
  const weightedScore = weightedBriefingScore({ briefLane: lane, rawScore });
  const sourceScore = computeHomepageBriefingScore({
    kind: 'intel',
    briefLane: lane,
    rawScore,
    weightedScore,
    intelItem: item,
  });
  return { rawScore, weightedScore, sourceScore };
}

function createNewswireScore(story) {
  const missionDelta = story?.missionScope?.scoreDelta ?? 0;
  const rawScore = bridgeNewswireStoryScore(story, missionDelta);
  const weightedScore = weightedBriefingScore({ briefLane: 'newswire', rawScore });
  const sourceScore = computeHomepageBriefingScore({
    kind: 'newswire',
    briefLane: 'newswire',
    rawScore,
    weightedScore,
    story,
  });
  return { rawScore, weightedScore, sourceScore };
}

export function scoreHomepageIntelFeedItem(item, sourceRank = 0, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const mission = typeof item?.homepageMissionScore === 'number' ? item.homepageMissionScore : 0;
  const ageHours = hoursSince(item?.publishedAt ?? item?.createdTime ?? null, nowMs);
  let recencyBoost = 0;
  if (ageHours != null) {
    if (ageHours <= 24) recencyBoost = 8;
    else if (ageHours <= 72) recencyBoost = 4;
    else if (ageHours <= 168) recencyBoost = 1;
  }
  const rankCredit = Math.max(0, 30 - sourceRank * 2);
  const sourceScore = clampScore(40 + mission + recencyBoost + rankCredit, 0, 100);
  return {
    rawScore: mission,
    weightedScore: sourceScore,
    sourceScore,
  };
}

function normalizeBriefingItem(item, sourceRank) {
  if (!item) return null;

  if (item.kind === 'newswire' && item.story) {
    const story = item.story;
    const explain = item.briefingExplain ?? null;
    const sourceScore = typeof item.homepageBriefingScore === 'number' ? item.homepageBriefingScore : 0;
    return {
      id: `briefing:newswire:${story.id}`,
      candidateType: 'newswire',
      title: story.title ?? '',
      summary: story.excerpt ?? story.note ?? '',
      canonicalUrl: story.url ?? '',
      url: story.url ?? '',
      publishedAt: story.publishedAt ?? null,
      imageUrl: story.image ?? null,
      lane: 'newswire',
      laneLabel: briefingLaneLabel('newswire'),
      sourceName: story.source ?? 'Newswire',
      sourceSlug: story.sourceSlug ?? 'newswire',
      sourceFamily: 'newswire',
      sourceSystem: 'homepage-briefing',
      sourceRank,
      sourceScore,
      compositeScore: SOURCE_SYSTEM_WEIGHT['homepage-briefing'] + sourceScore,
      provenanceClass: story.isCurated ? 'CURATED' : 'WIRE',
      originId: story.id,
      explain: {
        system: 'homepage-briefing',
        sourceSystemWeight: SOURCE_SYSTEM_WEIGHT['homepage-briefing'],
        scoringModel: 'homepageBriefingScore',
        briefing: explain,
      },
      seenIn: ['homepage-briefing'],
    };
  }

  if (item.kind === 'intel' && item.intelItem) {
    const intelItem = item.intelItem;
    const lane = intelItem.deskLane || item.briefLane || 'osint';
    const explain = item.briefingExplain ?? null;
    const sourceScore = typeof item.homepageBriefingScore === 'number' ? item.homepageBriefingScore : 0;
    return {
      id: `briefing:intel:${intelItem.id}`,
      candidateType: 'intel',
      title: intelItem.title ?? '',
      summary: intelItem.summary ?? '',
      canonicalUrl: intelItem.canonicalUrl ?? '',
      url: intelItem.canonicalUrl ?? '',
      publishedAt: intelItem.publishedAt ?? null,
      imageUrl: intelItem.imageUrl ?? null,
      lane,
      laneLabel: briefingLaneLabel(lane),
      sourceName: intelItem.sourceName ?? 'Intel',
      sourceSlug: intelItem.sourceSlug ?? 'intel',
      sourceFamily: intelItem.sourceFamily ?? 'general',
      sourceSystem: 'homepage-briefing',
      sourceRank,
      sourceScore,
      compositeScore: SOURCE_SYSTEM_WEIGHT['homepage-briefing'] + sourceScore,
      provenanceClass: intelItem.provenanceClass ?? null,
      originId: intelItem.id,
      explain: {
        system: 'homepage-briefing',
        sourceSystemWeight: SOURCE_SYSTEM_WEIGHT['homepage-briefing'],
        scoringModel: 'homepageBriefingScore',
        briefing: explain,
      },
      seenIn: ['homepage-briefing'],
    };
  }

  return null;
}

function normalizeLiveIntelItem(item, lane, sourceRank) {
  if (!item?.id) return null;
  const score = createIntelScore(item, lane);
  return {
    id: `desk:${lane}:${item.id}`,
    candidateType: 'intel',
    title: item.title ?? '',
    summary: item.summary ?? '',
    canonicalUrl: item.canonicalUrl ?? '',
    url: item.canonicalUrl ?? '',
    publishedAt: item.publishedAt ?? null,
    imageUrl: item.imageUrl ?? null,
    lane,
    laneLabel: briefingLaneLabel(lane),
    sourceName: item.sourceName ?? 'Intel',
    sourceSlug: item.sourceSlug ?? 'intel',
    sourceFamily: item.sourceFamily ?? 'general',
    sourceSystem: 'live-intel-desk',
    sourceRank,
    sourceScore: score.sourceScore,
    compositeScore: SOURCE_SYSTEM_WEIGHT['live-intel-desk'] + score.sourceScore,
    provenanceClass: item.provenanceClass ?? null,
    originId: item.id,
    explain: {
      system: 'live-intel-desk',
      sourceSystemWeight: SOURCE_SYSTEM_WEIGHT['live-intel-desk'],
      scoringModel: 'homepageBriefingIntelBridge',
      rawScore: score.rawScore,
      weightedScore: score.weightedScore,
      lane,
      deskRank: sourceRank,
    },
    seenIn: ['live-intel-desk'],
  };
}

function normalizeNewswireStory(story, sourceRank) {
  if (!story?.id || !story?.url) return null;
  const score = createNewswireScore(story);
  return {
    id: `newswire:${story.id}`,
    candidateType: 'newswire',
    title: story.title ?? '',
    summary: story.excerpt ?? story.note ?? '',
    canonicalUrl: story.url ?? '',
    url: story.url ?? '',
    publishedAt: story.publishedAt ?? null,
    imageUrl: story.image ?? null,
    lane: 'newswire',
    laneLabel: briefingLaneLabel('newswire'),
    sourceName: story.source ?? 'Newswire',
    sourceSlug: story.sourceSlug ?? 'newswire',
    sourceFamily: 'newswire',
    sourceSystem: 'newswire',
    sourceRank,
    sourceScore: score.sourceScore,
    compositeScore: SOURCE_SYSTEM_WEIGHT.newswire + score.sourceScore,
    provenanceClass: story.isCurated ? 'CURATED' : 'WIRE',
    originId: story.id,
    explain: {
      system: 'newswire',
      sourceSystemWeight: SOURCE_SYSTEM_WEIGHT.newswire,
      scoringModel: 'homepageBriefingNewswireBridge',
      rawScore: score.rawScore,
      weightedScore: score.weightedScore,
      curated: Boolean(story.isCurated),
    },
    seenIn: ['newswire'],
  };
}

function normalizeHomepageIntelItem(item, sourceRank, now) {
  if (!item?.id || !item?.url) return null;
  const score = scoreHomepageIntelFeedItem(item, sourceRank, now);
  const lane = item.sourceType === 'voices' ? 'voices' : 'voices';
  return {
    id: `homepage-intel:${item.id}`,
    candidateType: item.sourceType ?? 'commentary',
    title: item.title ?? '',
    summary: item.description ?? '',
    canonicalUrl: item.url ?? '',
    url: item.url ?? '',
    publishedAt: item.publishedAt ?? item.createdTime ?? null,
    imageUrl: item.image ?? null,
    lane,
    laneLabel: briefingLaneLabel(lane),
    sourceName: item.voice?.title ?? item.sourceType ?? 'Feed',
    sourceSlug: item.voice?.slug ?? item.sourceType ?? 'feed',
    sourceFamily: item.sourceType ?? 'voices',
    sourceSystem: 'homepage-intel-feed',
    sourceRank,
    sourceScore: score.sourceScore,
    compositeScore: SOURCE_SYSTEM_WEIGHT['homepage-intel-feed'] + score.sourceScore,
    provenanceClass: item.isCurated ? 'CURATED' : item.isProtestMusic ? 'MEDIA' : 'COMMENTARY',
    originId: item.id,
    explain: {
      system: 'homepage-intel-feed',
      sourceSystemWeight: SOURCE_SYSTEM_WEIGHT['homepage-intel-feed'],
      scoringModel: 'homepageIntelRankAndMissionScore',
      rawScore: score.rawScore,
      weightedScore: score.weightedScore,
      sourceRank,
      homepageMissionScore: item.homepageMissionScore ?? null,
      sourceType: item.sourceType ?? null,
    },
    seenIn: ['homepage-intel-feed'],
  };
}

export function mergeWeeklyCandidates(candidates, window) {
  const byUrl = new Map();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate?.publishedAt || !isWithinWindow(candidate.publishedAt, window)) continue;

    const key = normalizeCandidateUrl(candidate) || `${candidate.sourceSystem}:${candidate.originId}`;
    const existing = byUrl.get(key);

    if (!existing) {
      byUrl.set(key, candidate);
      continue;
    }

    existing.seenIn = Array.from(new Set([...(existing.seenIn ?? []), ...(candidate.seenIn ?? []), candidate.sourceSystem]));
    existing.explain = {
      ...(existing.explain ?? {}),
      alsoSeenIn: Array.from(new Set([...(existing.explain?.alsoSeenIn ?? []), candidate.sourceSystem])),
    };

    if (compareCandidates(candidate, existing) > 0) {
      continue;
    }

    byUrl.set(key, {
      ...candidate,
      seenIn: existing.seenIn,
      explain: {
        ...(candidate.explain ?? {}),
        alsoSeenIn: Array.from(new Set([...(candidate.explain?.alsoSeenIn ?? []), ...(existing.seenIn ?? [])])),
      },
    });
  }

  return Array.from(byUrl.values()).sort(compareCandidates);
}

export async function buildWeeklyBriefCandidates(options = {}) {
  const window = buildWeeklyCandidateWindow(options);
  const now = options.now ?? new Date(window.end);

  const [briefingPayload, deskResults, newswireStories, homepageIntelFeed] = await Promise.all([
    getHomeLiveBriefingWithExplain(),
    Promise.all(LIVE_INTEL_LANES.map(async (lane) => [lane, await getLiveIntelDesk(lane)])),
    getNewswireStories(),
    getHomepageIntelFeed(),
  ]);

  const briefingItems = Array.isArray(briefingPayload?.items) ? briefingPayload.items : [];
  const liveDeskMap = Object.fromEntries(deskResults);

  const normalized = [
    ...briefingItems.map((item, index) => normalizeBriefingItem(item, index)).filter(Boolean),
    ...LIVE_INTEL_LANES.flatMap((lane) =>
      (Array.isArray(liveDeskMap[lane]?.items) ? liveDeskMap[lane].items : [])
        .map((item, index) => normalizeLiveIntelItem(item, lane, index))
        .filter(Boolean)
    ),
    ...(Array.isArray(newswireStories) ? newswireStories : [])
      .map((story, index) => normalizeNewswireStory(story, index))
      .filter(Boolean),
    ...(Array.isArray(homepageIntelFeed) ? homepageIntelFeed : [])
      .map((item, index) => normalizeHomepageIntelItem(item, index, now))
      .filter(Boolean),
  ];

  const items = mergeWeeklyCandidates(normalized, window);

  return {
    window,
    items,
    explain: {
      generatedAt: toIso(now),
      sourceSystemWeights: SOURCE_SYSTEM_WEIGHT,
      pool: {
        homepageBriefing: briefingItems.length,
        liveIntelDesk: Object.fromEntries(
          LIVE_INTEL_LANES.map((lane) => [lane, Array.isArray(liveDeskMap[lane]?.items) ? liveDeskMap[lane].items.length : 0])
        ),
        newswire: Array.isArray(newswireStories) ? newswireStories.length : 0,
        homepageIntelFeed: Array.isArray(homepageIntelFeed) ? homepageIntelFeed.length : 0,
        normalizedTotal: normalized.length,
      },
      totalCandidates: items.length,
    },
  };
}

export async function getWeeklyBriefCandidates(options = {}) {
  return buildWeeklyBriefCandidates(options);
}
