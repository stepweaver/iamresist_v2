import { createDavidPakmanAdapter, davidPakmanAdapter } from '@/lib/creatorNotes/adapters/davidPakman';
import { slugifyCreatorName } from '@/lib/creatorNotes/podcastIdentity';
import type { CreatorTranscriptInput, PodcastEpisodeSource } from '@/lib/creatorNotes/types';

export interface OfficialTranscriptAdapter {
  supports(episode: PodcastEpisodeSource): boolean;
  resolveTranscript(episode: PodcastEpisodeSource): Promise<CreatorTranscriptInput | null>;
  podcastFeedUrls?(voice?: {
    slug?: string | null;
    title?: string | null;
    homeUrl?: string | null;
    feedUrl?: string | null;
  }): string[];
}

export type VoiceLike = {
  slug?: string | null;
  title?: string | null;
  homeUrl?: string | null;
  feedUrl?: string | null;
};

export function defaultOfficialTranscriptAdapters(): OfficialTranscriptAdapter[] {
  return [davidPakmanAdapter];
}

export function voiceMatchesDavidPakman(voice: VoiceLike): boolean {
  const slug = String(voice.slug || slugifyCreatorName(voice.title) || '').toLowerCase();
  if (slug === 'david-pakman') return true;
  const blob = `${voice.title || ''} ${voice.homeUrl || ''} ${voice.feedUrl || ''}`.toLowerCase();
  return blob.includes('davidpakman') || blob.includes('david pakman');
}

export function extraPodcastFeedUrlsForVoice(
  voice: VoiceLike,
  adapters: OfficialTranscriptAdapter[] = defaultOfficialTranscriptAdapters(),
): string[] {
  if (!voiceMatchesDavidPakman(voice)) return [];
  const urls: string[] = [];
  for (const adapter of adapters) {
    const extra = adapter.podcastFeedUrls?.(voice) || [];
    urls.push(...extra);
  }
  return [...new Set(urls)];
}

export { createDavidPakmanAdapter };
