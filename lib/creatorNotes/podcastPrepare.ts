import { mergeTranscriptMetadata } from '@/lib/creatorNotes/transcript';
import { resolvePodcastEpisode, type PodcastCatalogDeps } from '@/lib/creatorNotes/podcastCatalog';
import { resolvePodcastTranscript, type PodcastHttpGet } from '@/lib/creatorNotes/podcastTranscript';
import { PodcastTranscriptError } from '@/lib/creatorNotes/errors';
import type { OfficialTranscriptAdapter } from '@/lib/creatorNotes/podcastAdapters';
import type {
  CreatorNotesPodcastExtractArgs,
  CreatorTranscriptInput,
  TranscriptAcquisitionDiagnostics,
} from '@/lib/creatorNotes/types';

export type PreparePodcastNotesDeps = PodcastCatalogDeps & {
  resolveTranscript?: typeof resolvePodcastTranscript;
  adapters?: OfficialTranscriptAdapter[];
  get?: PodcastHttpGet;
};

function applyCliMetadata(
  transcript: CreatorTranscriptInput,
  args: CreatorNotesPodcastExtractArgs,
  mode: 'fill-missing' | 'override',
): CreatorTranscriptInput {
  const extra = {
    creatorName: args.creatorName,
    sourceTitle: args.sourceTitle,
    sourceUrl: args.sourceUrl,
  };
  if (mode === 'fill-missing') return mergeTranscriptMetadata(transcript, extra);
  return {
    ...transcript,
    creatorName: extra.creatorName || transcript.creatorName,
    sourceTitle: extra.sourceTitle || transcript.sourceTitle,
    sourceUrl: extra.sourceUrl || transcript.sourceUrl,
  };
}

export async function preparePodcastCreatorNotesTranscript(
  args: CreatorNotesPodcastExtractArgs,
  deps: PreparePodcastNotesDeps = {},
): Promise<{
  transcript: CreatorTranscriptInput;
  acquisition: TranscriptAcquisitionDiagnostics;
}> {
  const episode = await resolvePodcastEpisode(args.sourceItemId, deps);
  const resolveTranscript = deps.resolveTranscript || resolvePodcastTranscript;
  const resolved = await resolveTranscript(episode, { get: deps.get, adapters: deps.adapters });
  if (resolved.status !== 'TRANSCRIPT_AVAILABLE' || !resolved.transcript || !resolved.acquisition) {
    const status = resolved.status === 'TRANSCRIPT_AVAILABLE' ? 'TRANSCRIPT_UNAVAILABLE' : resolved.status;
    throw new PodcastTranscriptError(status, resolved.error || status);
  }

  const mode = args.dryRun ? 'override' : 'fill-missing';
  return {
    transcript: applyCliMetadata(resolved.transcript, args, mode),
    acquisition: resolved.acquisition,
  };
}
