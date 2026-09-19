import { parseHtmlTranscriptParagraphs, normalizeTranscriptCues } from '@/lib/creatorNotes/podcastFormats';
import { hostFromUrl, optionalText } from '@/lib/creatorNotes/podcastIdentity';
import type { CreatorTranscriptInput, PodcastEpisodeSource } from '@/lib/creatorNotes/types';

const OFFICIAL_HOSTS = new Set(['substack.davidpakman.com', 'davidpakman.substack.com', 'davidpakman.com']);

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export const DAVID_PAKMAN_PODCAST_FEED_URLS = [
  'https://feeds.megaphone.fm/SHHWD4599743349',
  'https://substack.davidpakman.com/feed',
];

export type DavidPakmanHttpGet = (
  url: string,
  timeoutMs?: number,
) => Promise<{ ok: boolean; status: number; text: string }>;

function matchesCreator(episode: PodcastEpisodeSource): boolean {
  const slug = optionalText(episode.creatorId)?.toLowerCase();
  if (slug === 'david-pakman') return true;
  if (/david\s*pakman/i.test(episode.creatorName || '')) return true;
  const host = hostFromUrl(episode.episodeUrl) || hostFromUrl(episode.feedUrl);
  return Boolean(host && OFFICIAL_HOSTS.has(host));
}

export function isDavidPakmanOfficialHost(url: string | null | undefined): boolean {
  const host = hostFromUrl(url);
  return Boolean(host && OFFICIAL_HOSTS.has(host));
}

export function davidPakmanDatePath(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  const month = MONTHS[date.getUTCMonth()];
  if (!month) return null;
  return `${month}-${date.getUTCDate()}-${date.getUTCFullYear()}`;
}

export function candidateOfficialPageUrls(episode: PodcastEpisodeSource): string[] {
  const urls: string[] = [];
  if (isDavidPakmanOfficialHost(episode.episodeUrl) && episode.episodeUrl) urls.push(episode.episodeUrl);
  const datePath = davidPakmanDatePath(episode.publishedAt);
  if (datePath) urls.push(`https://davidpakman.com/${datePath}/`);
  return [...new Set(urls)];
}

/**
 * Isolated David Pakman selectors. Only a clearly labeled Transcript: body is used.
 * Show notes, rundowns, and "Generate transcript" chrome are ignored.
 */
export function extractDavidPakmanTranscriptParagraphs(html: string): string[] | null {
  const raw = String(html || '');
  const marker =
    /<(p|h[1-6])[^>]*>\s*(?:<(strong|b)[^>]*>\s*)?Transcript:\s*(?:<\/(?:strong|b)>\s*)?<\/(?:p|h[1-6])>/i;
  const match = marker.exec(raw);
  if (!match) return null;
  const from = raw.slice(match.index + match[0].length);
  const end = from.search(
    /<hr\b|Don't miss the full show|Don&rsquo;t miss the full show|Tune in at|id="discussion"|Discussion about this/i,
  );
  const slice = end >= 0 ? from.slice(0, end) : from.slice(0, 20000);
  const paragraphs: string[] = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let p: RegExpExecArray | null = pRe.exec(slice);
  while (p) {
    const text = p[1] || '';
    if (!/button-wrapper|Leave a comment/i.test(text)) paragraphs.push(text);
    p = pRe.exec(slice);
  }
  return paragraphs.length ? paragraphs : null;
}

function pageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match) return null;
  return optionalText(match[1]?.replace(/\s+[—|-]\s+David Pakman.*$/i, '').replace(/\s+-\s+David Pakman.*$/i, ''));
}

function transcriptFromParagraphs(
  episode: PodcastEpisodeSource,
  url: string,
  paragraphs: string[],
  html?: string,
): CreatorTranscriptInput | null {
  const segments = normalizeTranscriptCues(parseHtmlTranscriptParagraphs(paragraphs));
  if (!segments.length) return null;
  const fromPage = html ? pageTitle(html) : null;
  const titleLooksLikeUrl = /^https?:\/\//i.test(episode.title || '');
  return {
    sourceItemId: episode.sourceItemId,
    creatorId: episode.creatorId,
    creatorName: episode.creatorName,
    sourceTitle: titleLooksLikeUrl ? fromPage || episode.title : episode.title || fromPage,
    sourceUrl: episode.episodeUrl,
    publishedAt: episode.publishedAt,
    sourceIdentityKey: episode.episodeUrl || episode.audioUrl || episode.guid,
    audioUrl: episode.audioUrl,
    transcriptSource: 'official_creator_page',
    transcriptUrl: url,
    transcriptMimeType: 'text/html',
    transcriptLanguage: 'en',
    segments,
  };
}

export function createDavidPakmanAdapter(get?: DavidPakmanHttpGet) {
  const fetchHtml: DavidPakmanHttpGet =
    get ||
    (async (url: string, timeoutMs = 20000) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          signal: ac.signal,
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'iamresist.org creator-notes podcast adapter',
          },
        });
        return { ok: res.ok, status: res.status, text: await res.text() };
      } finally {
        clearTimeout(timer);
      }
    });

  return {
    id: 'david-pakman',
    supports(episode: PodcastEpisodeSource): boolean {
      return matchesCreator(episode);
    },
    podcastFeedUrls(): string[] {
      return DAVID_PAKMAN_PODCAST_FEED_URLS;
    },
    async resolveTranscript(episode: PodcastEpisodeSource): Promise<CreatorTranscriptInput | null> {
      for (const url of candidateOfficialPageUrls(episode)) {
        let res: { ok: boolean; status: number; text: string };
        try {
          res = await fetchHtml(url, 20000);
        } catch {
          continue;
        }
        if (!res.ok) continue;
        const paragraphs = extractDavidPakmanTranscriptParagraphs(res.text);
        if (!paragraphs) continue;
        const transcript = transcriptFromParagraphs(episode, url, paragraphs, res.text);
        if (transcript) return transcript;
      }
      return null;
    },
  };
}

export const davidPakmanAdapter = createDavidPakmanAdapter();
