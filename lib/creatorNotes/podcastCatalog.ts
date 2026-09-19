import 'server-only';

import pLimit from 'p-limit';

import { sourceItemNotFoundError } from '@/lib/creatorNotes/errors';
import { isDavidPakmanOfficialHost } from '@/lib/creatorNotes/adapters/davidPakman';
import { extraPodcastFeedUrlsForVoice } from '@/lib/creatorNotes/podcastAdapters';
import {
  canonicalPodcastFeedUrlKey,
  dedupePodcastEpisodes,
  isPodcastVoiceFeedUrl,
  looksLikePodcastPlatform,
  matchesPodcastIdentity,
  optionalText,
  selectPodcastSourceEpisodes,
  slugifyCreatorName,
  sortPodcastEpisodesNewestFirst,
} from '@/lib/creatorNotes/podcastIdentity';
import { looksLikeHtmlDocument, parsePodcastFeedXml } from '@/lib/creatorNotes/podcastRss';
import type {
  PodcastEpisodeSource,
  PodcastFeedDiagnosticRow,
  PodcastFeedOrigin,
  PodcastFeedProbe,
  PodcastFeedsDiagnosticReport,
  PodcastSourceListRow,
} from '@/lib/creatorNotes/types';
import { classifyCreatorSourceProvider } from '@/lib/creatorNotes/youtubeIdentity';
import { getAllVoices, getEnabledVoices } from '@/lib/notion/voices.repo';

const FEED_CONCURRENCY = 6;
const ITEMS_PER_FEED = 30;
const FEED_TIMEOUT_MS = 45000;

export type VoicePodcastRow = {
  title?: string | null;
  slug?: string | null;
  feedUrl?: string | null;
  podcastFeedUrl?: string | null;
  homeUrl?: string | null;
  platform?: string | null;
};

export type PodcastFeedCandidate = {
  feedUrl: string;
  origin: PodcastFeedOrigin;
};

const FEED_ORIGIN_PRIORITY: Record<PodcastFeedOrigin, number> = {
  notion_podcast_feed: 0,
  notion_feed: 1,
  legacy_adapter: 2,
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

export function podcastFeedsForVoice(voice: VoicePodcastRow): PodcastFeedCandidate[] {
  const byKey = new Map<string, PodcastFeedCandidate>();

  const add = (raw: string | null | undefined, origin: PodcastFeedOrigin) => {
    const feedUrl = optionalText(raw);
    if (!feedUrl || !isPodcastVoiceFeedUrl(feedUrl)) return;
    const key = canonicalPodcastFeedUrlKey(feedUrl);
    if (!key) return;
    const existing = byKey.get(key);
    if (existing && FEED_ORIGIN_PRIORITY[existing.origin] <= FEED_ORIGIN_PRIORITY[origin]) return;
    byKey.set(key, { feedUrl, origin });
  };

  add(voice.podcastFeedUrl, 'notion_podcast_feed');
  add(voice.feedUrl, 'notion_feed');
  for (const url of extraPodcastFeedUrlsForVoice(voice)) {
    add(url, 'legacy_adapter');
  }
  return [...byKey.values()];
}

export function feedUrlsForVoice(voice: VoicePodcastRow): string[] {
  return podcastFeedsForVoice(voice).map((feed) => feed.feedUrl);
}

export function voiceSourceProviderType(voice: VoicePodcastRow): 'youtube' | 'podcast' | 'unknown' {
  if (feedUrlsForVoice(voice).length > 0) return 'podcast';
  if (voice.feedUrl && !isPodcastVoiceFeedUrl(voice.feedUrl)) return 'youtube';
  return classifyCreatorSourceProvider(voice.homeUrl || voice.feedUrl);
}

export function voiceLooksPodcastCapable(voice: VoicePodcastRow): boolean {
  if (feedUrlsForVoice(voice).length > 0) return true;
  if (looksLikePodcastPlatform(voice.platform)) return true;
  return voiceSourceProviderType(voice) === 'podcast';
}

function probeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name || '';
    const message = error.message || 'fetch_failed';
    if (name === 'AbortError' || /aborted/i.test(message)) return 'timeout';
    return message;
  }
  return String(error || 'fetch_failed');
}

function probeParsedFeed(xml: string, feedUrl: string): Omit<PodcastFeedProbe, 'feedUrl' | 'origin'> {
  if (looksLikeHtmlDocument(xml) || (!xml.includes('<rss') && !xml.includes('<feed'))) {
    return {
      fetched: true,
      status: 'parse_error',
      entryCount: 0,
      audioEnclosureCount: 0,
      podcastTranscriptCount: 0,
      error: looksLikeHtmlDocument(xml) ? 'html_not_rss' : 'not_rss_or_atom',
    };
  }
  const episodes = parsePodcastFeedXml(
    xml,
    { feedUrl, creatorId: null, creatorName: null },
    { limit: ITEMS_PER_FEED },
  );
  if (!episodes.length) {
    return {
      fetched: true,
      status: 'empty',
      entryCount: 0,
      audioEnclosureCount: 0,
      podcastTranscriptCount: 0,
      error: null,
    };
  }
  return {
    fetched: true,
    status: 'ok',
    entryCount: episodes.length,
    audioEnclosureCount: episodes.filter((episode) => Boolean(episode.audioUrl)).length,
    podcastTranscriptCount: episodes.filter((episode) =>
      episode.transcriptCandidates.some((candidate) => candidate.source === 'podcast_namespace'),
    ).length,
    error: null,
  };
}

async function probeFeedUrl(
  feedUrl: string,
  origin: PodcastFeedOrigin,
  fetchFeedXml: (url: string) => Promise<string>,
): Promise<PodcastFeedProbe> {
  try {
    const xml = await fetchFeedXml(feedUrl);
    return { feedUrl, origin, ...probeParsedFeed(xml, feedUrl) };
  } catch (error) {
    return {
      feedUrl,
      origin,
      fetched: false,
      status: 'fetch_error',
      entryCount: 0,
      audioEnclosureCount: 0,
      podcastTranscriptCount: 0,
      error: probeErrorMessage(error),
    };
  }
}

function diagnosticSkipReason(voice: VoicePodcastRow): PodcastFeedDiagnosticRow['skipReason'] {
  const feeds = feedUrlsForVoice(voice);
  if (feeds.length) return null;
  if (voice.feedUrl && !isPodcastVoiceFeedUrl(voice.feedUrl)) return 'youtube_only';
  return 'missing_podcast_feed';
}

export async function diagnosePodcastFeeds(
  deps: PodcastCatalogDeps = {},
): Promise<PodcastFeedsDiagnosticReport> {
  const listVoices = deps.listVoices || (() => getEnabledVoices() as Promise<VoicePodcastRow[]>);
  const fetchFeedXml = deps.fetchFeedXml || defaultFetchFeedXml;
  const voices = await listVoices();
  const limiter = pLimit(FEED_CONCURRENCY);

  const rows = await Promise.all(
    (Array.isArray(voices) ? voices : []).map((voice) =>
      limiter(async () => {
        const feeds = podcastFeedsForVoice(voice);
        const probes = await Promise.all(
          feeds.map((feed) => probeFeedUrl(feed.feedUrl, feed.origin, fetchFeedXml)),
        );
        const row: PodcastFeedDiagnosticRow = {
          creatorName: optionalText(voice.title),
          creatorId: creatorIdFor(voice),
          configuredFeedUrl: optionalText(voice.feedUrl),
          configuredPodcastFeedUrl: optionalText(voice.podcastFeedUrl),
          websiteUrl: optionalText(voice.homeUrl),
          platform: optionalText(voice.platform),
          providerType: voiceSourceProviderType(voice),
          podcastCapable: voiceLooksPodcastCapable(voice),
          skipReason: diagnosticSkipReason(voice),
          feeds: probes,
        };
        return row;
      }),
    ),
  );

  const podcastCapable = rows.filter((row) => row.podcastCapable);
  const youtubeOnly = rows.filter((row) => row.skipReason === 'youtube_only');
  const attemptedFeeds = rows.flatMap((row) => row.feeds);
  const fetchedOk = attemptedFeeds.filter((feed) => feed.status === 'ok');
  const missingOrFailed =
    attemptedFeeds.filter((feed) => feed.status !== 'ok').length +
    podcastCapable.filter((row) => !row.feeds.length).length;

  return {
    voicesInRegistry: rows.length,
    podcastCapableCount: podcastCapable.length,
    youtubeOnlyCount: youtubeOnly.length,
    feedsAttempted: attemptedFeeds.length,
    feedsFetchedOk: fetchedOk.length,
    feedsMissingOrFailed: missingOrFailed,
    sources: rows.sort((a, b) =>
      String(a.creatorName || a.creatorId || '').localeCompare(String(b.creatorName || b.creatorId || '')),
    ),
  };
}

export async function loadPodcastCatalog(deps: PodcastCatalogDeps = {}): Promise<PodcastEpisodeSource[]> {
  if (deps.listEpisodes) return deps.listEpisodes();
  const listVoices = deps.listVoices || (() => getEnabledVoices() as Promise<VoicePodcastRow[]>);
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
  const episodes = selectPodcastSourceEpisodes(await loadPodcastCatalog(deps), limit);
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
