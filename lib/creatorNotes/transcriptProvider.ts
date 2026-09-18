import { unsupportedProviderError } from '@/lib/creatorNotes/errors';
import type { ResolvedCreatorSource } from '@/lib/creatorNotes/types';
import {
  YouTubeTranscriptProvider,
  type FetchedCreatorTranscript,
  type TranscriptProvider,
} from '@/lib/creatorNotes/youtubeTranscript';

export type { TranscriptProvider, FetchedCreatorTranscript };

export function defaultTranscriptProviders(
  youtube: TranscriptProvider = new YouTubeTranscriptProvider(),
): TranscriptProvider[] {
  return [youtube];
}

export function selectTranscriptProvider(
  source: ResolvedCreatorSource,
  providers: TranscriptProvider[] = defaultTranscriptProviders(),
): TranscriptProvider {
  const match = providers.find((provider) => provider.supports(source));
  if (!match) throw unsupportedProviderError(source.provider);
  return match;
}

export async function fetchCreatorTranscript(
  source: ResolvedCreatorSource,
  providers: TranscriptProvider[] = defaultTranscriptProviders(),
): Promise<FetchedCreatorTranscript> {
  const provider = selectTranscriptProvider(source, providers);
  return provider.fetchTranscript(source);
}
