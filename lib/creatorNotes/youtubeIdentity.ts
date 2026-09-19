import { getYoutubeVideoId } from '@/lib/utils/youtube';
import { malformedYouTubeUrlError } from '@/lib/creatorNotes/errors';
import type { CreatorTranscriptProviderName } from '@/lib/creatorNotes/types';

type YoutubeLookup = (url?: string | null, sourceId?: string | null) => string | null;

const lookupYoutubeId = getYoutubeVideoId as YoutubeLookup;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
]);

export function parseYouTubeVideoId(
  url: string | null | undefined,
  storedId: string | null | undefined = null,
): string | null {
  const fromUrl = url && String(url).trim() ? lookupYoutubeId(String(url).trim(), storedId ?? null) : null;
  if (fromUrl) return fromUrl;
  if (storedId && String(storedId).trim()) {
    const fromStored = lookupYoutubeId('', String(storedId).trim());
    if (fromStored) return fromStored;
  }
  const compact = String(storedId || url || '')
    .trim()
    .match(/^yt:([a-zA-Z0-9_-]{11})$/i);
  if (compact?.[1]) return compact[1];
  return null;
}

export function youtubeHostFromUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string | null | undefined): boolean {
  const host = youtubeHostFromUrl(url);
  if (host && YOUTUBE_HOSTS.has(host)) return true;
  const raw = String(url || '').toLowerCase();
  return raw.includes('youtube.com') || raw.includes('youtu.be');
}

export function classifyCreatorSourceProvider(
  url: string | null | undefined,
  storedId: string | null | undefined = null,
): CreatorTranscriptProviderName {
  if (parseYouTubeVideoId(url, storedId) || isYouTubeUrl(url)) return 'youtube';
  const raw = String(url || storedId || '').toLowerCase();
  if (
    raw.includes('megaphone.fm') ||
    raw.includes('podcasts.apple.com') ||
    raw.includes('pca.st') ||
    raw.includes('/feed') ||
    raw.includes('podcast') ||
    raw.includes('substack.com')
  ) {
    return 'podcast';
  }
  return 'unknown';
}

export function requireYouTubeVideoId(
  url: string | null | undefined,
  storedId: string | null | undefined = null,
): string {
  const videoId = parseYouTubeVideoId(url, storedId);
  if (videoId) return videoId;
  throw malformedYouTubeUrlError();
}
