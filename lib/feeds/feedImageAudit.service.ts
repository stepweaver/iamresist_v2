import 'server-only';

import pLimit from 'p-limit';
import { NEWSWIRE_SOURCES } from '@/lib/data/newswire-sources';
import { fetchFeedItemsForAudit } from '@/lib/feeds/rss';
import { inspectArticleImageCandidates } from '@/lib/feeds/ogImage';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { getNewswireStories } from '@/lib/newswire';
import { getHomepageVoicesPool } from '@/lib/voices';
import { fetchIntelSourcesRegistry, intelDbConfigured } from '@/lib/intel/db';
import { getAllVoicesCached } from '@/lib/notion/voices.repo';
import type { AuditAction, FeedAuditMatchShape, FeedImageAuditRow } from '@/lib/feeds/feedImageAudit.shared';
import { buildFeedImageAuditRow } from '@/lib/feeds/feedImageAudit.shared';

type ArticleProbe = Awaited<ReturnType<typeof inspectArticleImageCandidates>>;

function isAuditableRssSource(
  source: { slug: string; endpoint_url?: string | null; fetch_kind?: string } | undefined,
): source is { slug: string; endpoint_url: string; fetch_kind: string } {
  return Boolean(
    source &&
      source.endpoint_url &&
      (source.fetch_kind === 'rss' || source.fetch_kind === 'podcast_rss'),
  );
}

export type FeedImageAuditPayload = {
  generatedAt: string;
  scope: {
    newswireSample: number;
    liveDeskPerLane: number;
    voicesSample: number;
  };
  sections: {
    newswire: {
      totalItems: number;
      missingImageItems: number;
      items: FeedImageAuditRow[];
    };
    intel: {
      configured: boolean;
      totalItems: number;
      missingImageItems: number;
      items: FeedImageAuditRow[];
    };
    voices: {
      totalItems: number;
      missingImageItems: number;
      items: FeedImageAuditRow[];
    };
  };
  summary: {
    totalMissingItems: number;
    byAction: Record<AuditAction, number>;
    topFailureCategories: Array<{ category: string; count: number }>;
    skipReasons: Array<{ reason: string; count: number }>;
    articleFetchErrors: Array<{ category: string; count: number }>;
    sourcesWithMostMissingImages: Array<{ sourceSlug: string; count: number }>;
    cleanTextOnlyPreferredCount: number;
    sourceSpecificRuleCandidates: number;
  };
  sources: {
    haaretz: FeedImageAuditRow[];
    alJazeera: FeedImageAuditRow[];
  };
};

function normalizeUrlForMatch(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    const keep = new URLSearchParams();
    for (const [key, rawValue] of url.searchParams.entries()) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || lower === 'fbclid' || lower === 'gclid') continue;
      keep.append(key, rawValue);
    }
    url.search = keep.toString();
    return url.href.replace(/\/$/, '');
  } catch {
    return String(value).trim().toLowerCase();
  }
}

function toFeedAuditMap(items: FeedAuditMatchShape[]): Map<string, FeedAuditMatchShape> {
  const map = new Map<string, FeedAuditMatchShape>();
  for (const item of items || []) {
    const key = normalizeUrlForMatch((item as { url?: string }).url);
    if (!key) continue;
    map.set(key, item);
  }
  return map;
}

async function probeArticles(rows: Array<{ canonicalUrl: string }>) {
  const limit = pLimit(4);
  const byUrl = new Map<string, ArticleProbe>();
  await Promise.all(
    rows.map((row) =>
      limit(async () => {
        const key = normalizeUrlForMatch(row.canonicalUrl);
        if (!key || byUrl.has(key)) return;
        byUrl.set(key, await inspectArticleImageCandidates(row.canonicalUrl));
      }),
    ),
  );
  return byUrl;
}

async function buildNewswireSection(sampleLimit: number) {
  const stories = (await getNewswireStories()).slice(0, sampleLimit);
  const feedMaps = await Promise.all(
    NEWSWIRE_SOURCES.filter((source) => source.automation === 'rss' && source.status === 'active').map(
      async (source) => {
        const rssUrl = typeof source.rssUrl === 'string' ? source.rssUrl : '';
        return {
          slug: source.slug,
          map: toFeedAuditMap(
            rssUrl
              ? await fetchFeedItemsForAudit(rssUrl, {
                  limit: sampleLimit,
                  tags: ['newswire', `newswire:${source.slug}`, 'feed-image-audit'],
                })
              : [],
          ),
        };
      },
    ),
  );
  const feedBySource = new Map(feedMaps.map((entry) => [entry.slug, entry.map]));
  const missingStories = stories.filter((story) => !story.image);
  const probes = await probeArticles(missingStories.map((story) => ({ canonicalUrl: story.url })));

  const items = missingStories.map((story) =>
    buildFeedImageAuditRow({
      kind: 'newswire',
      title: story.title || '',
      source: story.source || story.sourceSlug || 'Unknown',
      sourceSlug: story.sourceSlug || 'unknown',
      desk: 'newswire',
      canonicalUrl: story.url || '',
      currentFinalImageUrl: story.image || null,
      feedAuditMatch:
        feedBySource.get(story.sourceSlug || '')?.get(normalizeUrlForMatch(story.url)) ?? null,
      articleProbe:
        probes.get(normalizeUrlForMatch(story.url)) ?? {
          articleUrl: story.url,
          fetchOk: false,
          fetchStatus: null,
          fetchErrorCategory: 'not_probed',
          ogImageUrl: null,
          articleImageUrl: null,
          articleImageCandidates: [],
        },
    }),
  );

  return {
    totalItems: stories.length,
    missingImageItems: items.length,
    items,
  };
}

async function buildIntelSection(liveDeskPerLane: number) {
  if (!intelDbConfigured()) {
    return {
      configured: false,
      totalItems: 0,
      missingImageItems: 0,
      items: [] as FeedImageAuditRow[],
    };
  }

  const lanes = ['osint', 'watchdogs', 'defense_ops', 'voices'];
  const desks = await Promise.all(lanes.map((lane) => getLiveIntelDesk(lane)));
  const registry = await fetchIntelSourcesRegistry();
  const sourceBySlug = new Map(registry.map((row) => [row.slug, row]));

  const visibleItems = desks.flatMap((desk) =>
    (desk.items || []).slice(0, liveDeskPerLane).map((item) => ({
      ...item,
      deskLane: desk.deskLane || item.deskLane || 'osint',
    })),
  );
  const missingItems = visibleItems.filter((item) => !item.imageUrl);
  const rssSourceSlugSet = new Set<string>();
  for (const item of missingItems) {
    const source = sourceBySlug.get(item.sourceSlug);
    if (isAuditableRssSource(source)) {
      rssSourceSlugSet.add(source.slug);
    }
  }
  const rssSourcesToFetch = [...rssSourceSlugSet];

  const feedBySource = new Map<string, Map<string, FeedAuditMatchShape>>();
  await Promise.all(
    rssSourcesToFetch.map(async (slug) => {
      const source = sourceBySlug.get(slug);
      if (!source?.endpoint_url) return;
      const items = await fetchFeedItemsForAudit(source.endpoint_url, {
        limit: liveDeskPerLane,
        tags: ['intel-live', `intel-source:${slug}`, 'feed-image-audit'],
      });
      feedBySource.set(slug, toFeedAuditMap(items));
    }),
  );

  const probes = await probeArticles(missingItems.map((item) => ({ canonicalUrl: item.canonicalUrl })));

  const items = missingItems.map((item) =>
    buildFeedImageAuditRow({
      kind: 'intel',
      title: item.title || '',
      source: item.sourceName || item.sourceSlug || 'Unknown',
      sourceSlug: item.sourceSlug || 'unknown',
      desk: item.deskLane || 'osint',
      canonicalUrl: item.canonicalUrl || '',
      currentFinalImageUrl: item.imageUrl || null,
      feedAuditMatch:
        feedBySource.get(item.sourceSlug || '')?.get(normalizeUrlForMatch(item.canonicalUrl)) ?? null,
      articleProbe:
        probes.get(normalizeUrlForMatch(item.canonicalUrl)) ?? {
          articleUrl: item.canonicalUrl,
          fetchOk: false,
          fetchStatus: null,
          fetchErrorCategory: 'not_probed',
          ogImageUrl: null,
          articleImageUrl: null,
          articleImageCandidates: [],
        },
    }),
  );

  return {
    configured: true,
    totalItems: visibleItems.length,
    missingImageItems: items.length,
    items,
  };
}

async function buildVoicesSection(voicesSample: number) {
  const pool = (await getHomepageVoicesPool()).slice(0, voicesSample);
  const voices = (await getAllVoicesCached({ limit: 16 })).slice(0, 16);
  const voiceBySlug = new Map(voices.map((voice) => [voice.slug, voice]));
  const missingItems = pool.filter((item) => !item.image);

  const feedByVoice = new Map<string, Map<string, FeedAuditMatchShape>>();
  await Promise.all(
    [...new Set(missingItems.map((item) => item.voice?.slug).filter(Boolean))].map(async (slug) => {
      const voice = voiceBySlug.get(slug);
      if (!voice?.feedUrl) return;
      const items = await fetchFeedItemsForAudit(voice.feedUrl, {
        limit: 6,
        tags: ['voices-feed', `voices-home:${slug}`, 'feed-image-audit'],
      });
      feedByVoice.set(slug, toFeedAuditMap(items));
    }),
  );

  const probes = await probeArticles(missingItems.map((item) => ({ canonicalUrl: item.url })));

  const items = missingItems.map((item) =>
    buildFeedImageAuditRow({
      kind: 'voices',
      title: item.title || '',
      source: item.voice?.title || 'Unknown voice',
      sourceSlug: item.voice?.slug || 'unknown',
      desk: 'voices',
      canonicalUrl: item.url || '',
      currentFinalImageUrl: item.image || null,
      feedAuditMatch:
        feedByVoice.get(item.voice?.slug || '')?.get(normalizeUrlForMatch(item.url)) ?? null,
      articleProbe:
        probes.get(normalizeUrlForMatch(item.url)) ?? {
          articleUrl: item.url,
          fetchOk: false,
          fetchStatus: null,
          fetchErrorCategory: 'not_probed',
          ogImageUrl: null,
          articleImageUrl: null,
          articleImageCandidates: [],
        },
    }),
  );

  return {
    totalItems: pool.length,
    missingImageItems: items.length,
    items,
  };
}

function summarizeFailureCategories(rows: FeedImageAuditRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const category =
      row.skipReason ||
      row.articleFetchErrorCategory ||
      (row.ogImageAvailable ? 'og_backfill_available' : null) ||
      (row.articleImageAvailable ? 'article_image_without_og' : null) ||
      'no_image_found';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, count]) => ({ category, count }));
}

function summarizeRowsBy<T extends string>(rows: FeedImageAuditRow[], pick: (row: FeedImageAuditRow) => T | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([value, count]) => ({ value, count }));
}

function summarizeSources(rows: FeedImageAuditRow[]) {
  return summarizeRowsBy(rows, (row) => row.sourceSlug).map(({ value, count }) => ({
    sourceSlug: value,
    count,
  }));
}

export async function getFeedImageAudit(opts?: {
  newswireSample?: number;
  liveDeskPerLane?: number;
  voicesSample?: number;
}): Promise<FeedImageAuditPayload> {
  const newswireSample = Math.min(60, Math.max(10, Number(opts?.newswireSample) || 24));
  const liveDeskPerLane = Math.min(32, Math.max(8, Number(opts?.liveDeskPerLane) || 16));
  const voicesSample = Math.min(24, Math.max(6, Number(opts?.voicesSample) || 12));

  const [newswire, intel, voices] = await Promise.all([
    buildNewswireSection(newswireSample),
    buildIntelSection(liveDeskPerLane),
    buildVoicesSection(voicesSample),
  ]);

  const allRows = [...newswire.items, ...intel.items, ...voices.items];
  const byAction = {
    keep_text_only: 0,
    allow_feed_image: 0,
    upgrade_feed_image: 0,
    enable_og_backfill: 0,
    add_source_specific_rule: 0,
    investigate_fetch_block: 0,
  } satisfies Record<AuditAction, number>;

  for (const row of allRows) {
    byAction[row.recommendedAction] += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      newswireSample,
      liveDeskPerLane,
      voicesSample,
    },
    sections: {
      newswire,
      intel,
      voices,
    },
    summary: {
      totalMissingItems: allRows.length,
      byAction,
      topFailureCategories: summarizeFailureCategories(allRows),
      skipReasons: summarizeRowsBy(allRows, (row) => row.skipReason).map(({ value, count }) => ({
        reason: value,
        count,
      })),
      articleFetchErrors: summarizeRowsBy(allRows, (row) => row.articleFetchErrorCategory).map(
        ({ value, count }) => ({
          category: value,
          count,
        }),
      ),
      sourcesWithMostMissingImages: summarizeSources(allRows),
      cleanTextOnlyPreferredCount: allRows.filter((row) => row.recommendedAction === 'keep_text_only').length,
      sourceSpecificRuleCandidates: allRows.filter((row) => row.recommendedAction === 'add_source_specific_rule').length,
    },
    sources: {
      haaretz: allRows.filter((row) => row.sourceSlug === 'haaretz'),
      alJazeera: allRows.filter((row) => row.sourceSlug === 'al-jazeera'),
    },
  };
}
