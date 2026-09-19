import type { PodcastEpisodeSource } from '@/lib/creatorNotes/types';
import { isYoutubeRssUrl } from '@/lib/feeds/rss';
import { isYouTubeUrl } from '@/lib/creatorNotes/youtubeIdentity';

export function optionalText(value: unknown): string | null {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

export function normalizeHttpUrl(value: string | null | undefined, baseUrl?: string | null): string | null {
  const raw = optionalText(value);
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const resolved = baseUrl ? new URL(withProto, baseUrl) : new URL(withProto);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    if (baseUrl) {
      try {
        return new URL(raw, baseUrl).toString();
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function hostFromUrl(url: string | null | undefined): string | null {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isAudioMime(mime: string | null | undefined): boolean {
  const type = String(mime || '').trim().toLowerCase();
  return type.startsWith('audio/') || type === 'video/mp4' || type === 'video/quicktime';
}

export function isTranscriptMime(mime: string | null | undefined): boolean {
  const type = String(mime || '').trim().toLowerCase();
  return (
    type === 'text/vtt' ||
    type === 'application/x-subrip' ||
    type === 'application/srt' ||
    type === 'text/srt' ||
    type === 'application/json' ||
    type === 'text/json' ||
    type === 'text/plain' ||
    type === 'text/html' ||
    type === 'application/xhtml+xml'
  );
}

export function isPodcastVoiceFeedUrl(feedUrl: string | null | undefined): boolean {
  const url = optionalText(feedUrl);
  if (!url) return false;
  if (isYoutubeRssUrl(url) || isYouTubeUrl(url)) return false;
  return true;
}

/** Stable key so Notion Feed URL, Podcast Feed URL, and adapter URLs can share one feed. */
export function canonicalPodcastFeedUrlKey(feedUrl: string | null | undefined): string | null {
  const normalized = normalizeHttpUrl(feedUrl) || optionalText(feedUrl);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return normalized.trim();
  }
}

export function looksLikePodcastPlatform(platform: string | null | undefined): boolean {
  const value = optionalText(platform);
  if (!value) return false;
  return /podcast|rss|substack|audio|megaphone|spotify|apple/i.test(value);
}

export function canonicalPodcastIdentityKey(episode: {
  sourceItemId: string;
  guid?: string | null;
  episodeUrl?: string | null;
  audioUrl?: string | null;
}): string {
  const guid = optionalText(episode.guid);
  if (guid) return `guid:${guid.toLowerCase()}`;
  const episodeUrl = optionalText(episode.episodeUrl);
  if (episodeUrl) return `url:${episodeUrl.toLowerCase()}`;
  const audioUrl = optionalText(episode.audioUrl);
  if (audioUrl) return `url:${audioUrl.toLowerCase()}`;
  return `id:${String(episode.sourceItemId || '').trim().toLowerCase()}`;
}

export function podcastIdentityAliases(episode: PodcastEpisodeSource): string[] {
  const slug = optionalText(episode.creatorId)?.toLowerCase() || null;
  const guid = optionalText(episode.guid);
  return [
    episode.sourceItemId,
    guid,
    episode.episodeUrl,
    episode.audioUrl,
    guid ? `guid:${guid}` : null,
    guid && slug ? `podcast:${slug}:${guid}` : null,
  ].filter((value): value is string => Boolean(optionalText(value)));
}

export function matchesPodcastIdentity(episode: PodcastEpisodeSource, sourceItemId: string): boolean {
  const needle = optionalText(sourceItemId);
  if (!needle) return false;
  const needles = new Set([needle, needle.toLowerCase()]);
  for (const alias of podcastIdentityAliases(episode)) {
    const cleaned = alias.trim();
    if (needles.has(cleaned) || needles.has(cleaned.toLowerCase())) return true;
  }
  return false;
}

export function comparePodcastEpisodesNewestFirst(a: PodcastEpisodeSource, b: PodcastEpisodeSource): number {
  const aTime = a.publishedAt ? Date.parse(a.publishedAt) : Number.NEGATIVE_INFINITY;
  const bTime = b.publishedAt ? Date.parse(b.publishedAt) : Number.NEGATIVE_INFINITY;
  const byTime = (Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY) - (Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY);
  if (byTime !== 0) return byTime;
  const byId = String(a.sourceItemId).localeCompare(String(b.sourceItemId));
  if (byId !== 0) return byId;
  return String(a.creatorId || '').localeCompare(String(b.creatorId || ''));
}

export function sortPodcastEpisodesNewestFirst(episodes: PodcastEpisodeSource[]): PodcastEpisodeSource[] {
  return [...episodes].sort(comparePodcastEpisodesNewestFirst);
}

export function dedupePodcastEpisodes(episodes: PodcastEpisodeSource[]): PodcastEpisodeSource[] {
  const seen = new Set<string>();
  const out: PodcastEpisodeSource[] = [];
  for (const episode of episodes) {
    const key = canonicalPodcastIdentityKey(episode);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(episode);
  }
  return out;
}

export function slugifyCreatorName(value: string | null | undefined): string | null {
  const cleaned = optionalText(value);
  if (!cleaned) return null;
  const slug = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

export function episodeHasPodcastMedia(episode: PodcastEpisodeSource): boolean {
  return Boolean(optionalText(episode.audioUrl) || episode.transcriptCandidates?.length);
}

function creatorGroupKey(episode: PodcastEpisodeSource): string {
  return optionalText(episode.creatorId) || optionalText(episode.creatorName) || 'unknown';
}

/**
 * List episodes so a high-volume feed cannot hide other registry podcasts.
 * Each creator with catalog items gets a slot first; remaining slots fill newest-first,
 * preferring items with audio or an RSS transcript.
 */
export function selectPodcastSourceEpisodes(
  episodes: PodcastEpisodeSource[],
  limit: number,
): PodcastEpisodeSource[] {
  const capped = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.round(limit))) : 0;
  if (!capped || !episodes.length) return [];

  const newest = sortPodcastEpisodesNewestFirst(episodes);
  const groups = new Map<string, PodcastEpisodeSource[]>();
  for (const episode of newest) {
    const key = creatorGroupKey(episode);
    const list = groups.get(key) || [];
    list.push(episode);
    groups.set(key, list);
  }

  const rankedFor = (list: PodcastEpisodeSource[]) => {
    const withMedia = list.filter(episodeHasPodcastMedia);
    return withMedia.length ? withMedia : list;
  };

  const creatorKeys = [...groups.keys()].sort((a, b) => {
    const byNewest = comparePodcastEpisodesNewestFirst(rankedFor(groups.get(a)!)[0], rankedFor(groups.get(b)!)[0]);
    if (byNewest !== 0) return byNewest;
    return a.localeCompare(b);
  });

  const used = new Set<string>();
  const out: PodcastEpisodeSource[] = [];

  const take = (episode: PodcastEpisodeSource | undefined) => {
    if (!episode || out.length >= capped) return;
    const key = canonicalPodcastIdentityKey(episode);
    if (!key || used.has(key)) return;
    used.add(key);
    out.push(episode);
  };

  for (const key of creatorKeys) take(rankedFor(groups.get(key) || [])[0]);

  for (const episode of newest) {
    if (out.length >= capped) break;
    if (episodeHasPodcastMedia(episode)) take(episode);
  }
  for (const episode of newest) {
    if (out.length >= capped) break;
    take(episode);
  }
  return out;
}
