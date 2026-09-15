import 'server-only';

import pLimit from 'p-limit';

import { fetchFeedItemsWithMeta } from '@/lib/feeds/rss';
import { getAllVoices } from '@/lib/notion/voices.repo';
import { getNewswireStoriesUncached } from '@/lib/newswire';
import {
  dedupeThemeCandidates,
  normalizeNewswireThemeCandidate,
  normalizeVoiceThemeCandidate,
} from '@/lib/themeMemory/normalize';
import {
  THEME_MEMORY_ITEMS_PER_VOICE,
} from '@/lib/themeMemory/types';
import type { ThemeCandidateItem } from '@/lib/themeMemory/types';

const VOICE_FETCH_CONCURRENCY = 6;

export type VoiceCollectResult = {
  candidates: ThemeCandidateItem[];
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  sourcesEmpty: number;
  itemsSeen: number;
  failures: Array<{ slug: string; reason: string }>;
};

export type NewswireCollectResult = {
  candidates: ThemeCandidateItem[];
  sourcesRepresented: number;
  itemsSeen: number;
};

/**
 * Fetch favorite-creator RSS history for Theme Memory.
 * Intentionally ignores homepage one-item-per-creator / interleave display rules.
 */
export async function collectVoiceThemeCandidates(opts: {
  perVoiceLimit?: number;
  now?: Date | string;
} = {}): Promise<VoiceCollectResult> {
  const fetchedAt = new Date(opts.now ?? Date.now()).toISOString();
  const perVoiceLimit = Math.max(
    1,
    Math.min(50, Number(opts.perVoiceLimit) || THEME_MEMORY_ITEMS_PER_VOICE),
  );

  const voices = await getAllVoices();
  if (!voices.length) {
    return {
      candidates: [],
      sourcesAttempted: 0,
      sourcesSucceeded: 0,
      sourcesFailed: 0,
      sourcesEmpty: 0,
      itemsSeen: 0,
      failures: [],
    };
  }

  const limiter = pLimit(VOICE_FETCH_CONCURRENCY);
  const results = await Promise.all(
    voices.map((voice) =>
      limiter(async () => {
        const slug = voice.slug || voice.id || 'unknown';
        const result = await fetchFeedItemsWithMeta(voice.feedUrl, {
          limit: perVoiceLimit,
          tags: ['theme-memory-feed', `theme-memory-voice:${slug}`],
        });
        const rawItems = result.items || [];
        const candidates = dedupeThemeCandidates(
          rawItems
            .map((item) =>
              normalizeVoiceThemeCandidate(
                {
                  ...item,
                  voice: {
                    id: voice.id,
                    title: voice.title,
                    slug: voice.slug,
                    homeUrl: voice.homeUrl,
                    platform: voice.platform,
                  },
                },
                fetchedAt,
              ),
            )
            .filter((item): item is ThemeCandidateItem => Boolean(item)),
        );

        return {
          slug,
          ok: result.ok,
          reason: result.reason,
          itemsSeen: rawItems.length,
          candidates,
        };
      }),
    ),
  );

  const failures = results
    .filter((result) => !result.ok)
    .map((result) => ({ slug: result.slug, reason: String(result.reason || 'failed') }));

  return {
    candidates: results.flatMap((result) => result.candidates),
    sourcesAttempted: results.length,
    sourcesSucceeded: results.filter((result) => result.ok).length,
    sourcesFailed: failures.length,
    sourcesEmpty: results.filter((result) => result.ok && result.itemsSeen === 0).length,
    itemsSeen: results.reduce((sum, result) => sum + result.itemsSeen, 0),
    failures,
  };
}

/**
 * Broad Newswire corpus (mission-filtered, URL-deduped) before homepage slot selection.
 */
export async function collectNewswireThemeCandidates(opts: {
  now?: Date | string;
} = {}): Promise<NewswireCollectResult> {
  const fetchedAt = new Date(opts.now ?? Date.now()).toISOString();
  const stories = await getNewswireStoriesUncached();
  const list = Array.isArray(stories) ? stories : [];
  const candidates = dedupeThemeCandidates(
    list
      .map((story) => normalizeNewswireThemeCandidate(story, fetchedAt))
      .filter((item): item is ThemeCandidateItem => Boolean(item)),
  );
  const sources = new Set(candidates.map((item) => item.sourceSlug).filter(Boolean));

  return {
    candidates,
    sourcesRepresented: sources.size,
    itemsSeen: list.length,
  };
}
