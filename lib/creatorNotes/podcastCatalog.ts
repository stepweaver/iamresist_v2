import 'server-only';

import pLimit from 'p-limit';

import { sourceItemNotFoundError } from '@/lib/creatorNotes/errors';
import { isDavidPakmanOfficialHost } from '@/lib/creatorNotes/adapters/davidPakman';
import { extraPodcastFeedUrlsForVoice } from '@/lib/creatorNotes/podcastAdapters';
import {
  dedupePodcastEpisodes,
  isPodcastVoiceFeedUrl,
  matchesPodcastIdentity,
  optionalText,
  slugifyCreatorName,
  sortPodcastEpisodesNewestFirst,
} from '@/lib/creatorNotes/podcastIdentity';
import { parsePodcastFeedXml } from '@/lib/creatorNotes/podcastRss';
import type { PodcastEpisodeSource, PodcastSourceListRow } from '@/lib/creatorNotes/types';
import { getAllVoices } from '@/lib/notion/voices.repo';

const FEED_CONCURRENCY = 6;
const ITEMS_PER_FEED = 30;
const FEED_TIMEOUT_MS = 45000;

export type VoicePodcastRow = {
  title?: string | null;
  slug?: string | null;
  feedUrl?: string | null;
  homeUrl?: string | null;
  platform?: string | null;
};

export type PodcastCatalogDeps = {
  listVoices?: () => Promise<VoicePodcastRow[]>;
  fetchFeedXml?: (url: string) => Promise<string>;
  listEpisodes?: () => Promise<PodcastEpisodeSource[]>;
};

async function defaultFetchFeedXml(url: string): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ac.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'User-Agent': 'iamresist.org creator-notes podcast RSS fetcher',
      },
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function creatorIdFor(voice: VoicePodcastRow): string | null {
  return optionalText(voice.slug)?.toLowerCase() || slugifyCreatorName(voice.title);
}

function feedUrlsForVoice(voice: VoicePodcastRow): string[] {
  const urls: string[] = [];
  if (isPodcastVoiceFeedUrl(voice.feedUrl) && voice.feedUrl) urls.push(voice.feedUrl);
  urls.push(...extraPodcastFeedUrlsForVoice(voice));
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

export async function loadPodcastCatalog(deps: PodcastCatalogDeps = {}): Promise<PodcastEpisodeSource[]> {
  if (deps.listEpisodes) return deps.listEpisodes();
  const listVoices = deps.listVoices || (() => getAllVoices() as Promise<VoicePodcastRow[]>);
  const fetchFeedXml = deps.fetchFeedXml || defaultFetchFeedXml;
  const voices = await listVoices();
  if (!Array.isArray(voices) || voices.length === 0) return [];

  const limiter = pLimit(FEED_CONCURRENCY);
  const groups = await Promise.all(
    voices.map((voice) =>
      limiter(async () => {
        const feeds = feedUrlsForVoice(voice);
        if (!feeds.length) return [] as PodcastEpisodeSource[];
        const creatorId = creatorIdFor(voice);
        const creatorName = optionalText(voice.title);
        const perFeed = await Promise.all(
          feeds.map(async (feedUrl) => {
            try {
              const xml = await fetchFeedXml(feedUrl);
              return parsePodcastFeedXml(xml, { feedUrl, creatorId, creatorName }, { limit: ITEMS_PER_FEED });
            } catch {
              return [] as PodcastEpisodeSource[];
            }
          }),
        );
        return perFeed.flat();
      }),
    ),
  );

  return dedupePodcastEpisodes(sortPodcastEpisodesNewestFirst(groups.flat()));
}

export async function resolvePodcastEpisode(
  sourceItemId: string,
  deps: PodcastCatalogDeps = {},
): Promise<PodcastEpisodeSource> {
  const id = optionalText(sourceItemId);
  if (!id) throw sourceItemNotFoundError(String(sourceItemId || ''));
  const episodes = await loadPodcastCatalog(deps);
  const match = episodes.find((episode) => matchesPodcastIdentity(episode, id));
  if (match) return match;

  if (/^https?:\/\//i.test(id)) {
    const byUrl = episodes.find(
      (episode) =>
        optionalText(episode.episodeUrl)?.toLowerCase() === id.toLowerCase() ||
        optionalText(episode.audioUrl)?.toLowerCase() === id.toLowerCase(),
    );
    if (byUrl) return byUrl;
    if (!isDavidPakmanOfficialHost(id)) throw sourceItemNotFoundError(id);

    const voices = deps.listVoices ? await deps.listVoices() : ((await getAllVoices()) as VoicePodcastRow[]);
    const voice =
      voices.find((row) => /davidpakman|david pakman/i.test(`${row.title} ${row.homeUrl} ${row.slug}`)) || null;
    return {
      sourceItemId: id,
      creatorId: creatorIdFor(voice || { title: 'David Pakman', slug: 'david-pakman' }),
      creatorName: optionalText(voice?.title) || 'David Pakman',
      feedUrl:
        extraPodcastFeedUrlsForVoice(voice || { slug: 'david-pakman', title: 'David Pakman' })[0] ||
        voice?.feedUrl ||
        id,
      guid: id,
      title: id,
      episodeUrl: id,
      audioUrl: null,
      publishedAt: null,
      transcriptCandidates: [],
    };
  }

  throw sourceItemNotFoundError(id);
}

export async function listPodcastSources(
  opts: { limit?: number } = {},
  deps: PodcastCatalogDeps = {},
): Promise<PodcastSourceListRow[]> {
  const limitRaw = opts.limit == null ? 20 : Number(opts.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.round(limitRaw))) : 20;
  const episodes = (await loadPodcastCatalog(deps)).slice(0, limit);
  const rows: PodcastSourceListRow[] = [];

  for (const episode of episodes) {
    const rssCandidate = episode.transcriptCandidates[0] || null;
    rows.push({
      sourceItemId: episode.sourceItemId,
      creatorName: episode.creatorName,
      creatorId: episode.creatorId,
      title: episode.title,
      publishedAt: episode.publishedAt,
      transcriptDiscovered: Boolean(rssCandidate),
      transcriptSource: rssCandidate?.source || null,
      audioUrlPresent: Boolean(episode.audioUrl),
      episodeUrl: episode.episodeUrl,
      audioUrl: episode.audioUrl,
    });
  }
  return rows;
}
