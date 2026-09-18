import { resolve } from 'node:path';

import { durationCoveredSeconds } from '@/lib/creatorNotes/normalizeCaptions';
import { fetchCreatorTranscript, type TranscriptProvider } from '@/lib/creatorNotes/transcriptProvider';
import { resolveCreatorSource, type ResolveCreatorSourceDeps } from '@/lib/creatorNotes/resolveSource';
import { loadCreatorSourceMetadata, shouldLookupCreatorSourceMetadata } from '@/lib/creatorNotes/source';
import { loadTranscriptFile, mergeTranscriptMetadata } from '@/lib/creatorNotes/transcript';
import { transcriptCharCount } from '@/lib/creatorNotes/identity';
import type {
  CreatorNotesExtractArgs,
  CreatorTranscriptInput,
  TranscriptAcquisitionDiagnostics,
} from '@/lib/creatorNotes/types';

export type PrepareCreatorNotesDeps = ResolveCreatorSourceDeps & {
  providers?: TranscriptProvider[];
  fetchTranscript?: typeof fetchCreatorTranscript;
  loadFile?: typeof loadTranscriptFile;
  lookupSourceMetadata?: typeof loadCreatorSourceMetadata;
};

function applyCliMetadata(
  transcript: CreatorTranscriptInput,
  args: CreatorNotesExtractArgs,
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

function fileAcquisition(transcript: CreatorTranscriptInput): TranscriptAcquisitionDiagnostics {
  return {
    source: 'file',
    language: null,
    generated: 'unknown',
    rawSegments: transcript.segments.length,
    normalizedSegments: transcript.segments.length,
    durationCoveredSeconds: durationCoveredSeconds(transcript.segments),
    characters: transcriptCharCount(transcript.segments),
  };
}

function logTranscript(event: string, extra?: Record<string, unknown>) {
  if (extra) console.info('[creator-notes-transcript]', event, extra);
  else console.info('[creator-notes-transcript]', event);
}

export async function prepareCreatorNotesTranscript(
  args: CreatorNotesExtractArgs,
  deps: PrepareCreatorNotesDeps = {},
): Promise<{
  transcript: CreatorTranscriptInput;
  acquisition: TranscriptAcquisitionDiagnostics;
}> {
  if (args.transcriptFile) {
    const loadFile = deps.loadFile || loadTranscriptFile;
    const transcriptPath = resolve(process.cwd(), args.transcriptFile);
    let transcript = loadFile(transcriptPath, args.sourceItemId);

    if (shouldLookupCreatorSourceMetadata(args.dryRun)) {
      try {
        const lookup = deps.lookupSourceMetadata || loadCreatorSourceMetadata;
        const sourceMeta = await lookup(args.sourceItemId);
        transcript = mergeTranscriptMetadata(transcript, sourceMeta);
      } catch (error) {
        console.warn(
          '[creator-notes] source metadata lookup failed',
          error instanceof Error ? error.message : error,
        );
      }
    }

    transcript = applyCliMetadata(transcript, args, 'fill-missing');
    return { transcript, acquisition: fileAcquisition(transcript) };
  }

  logTranscript('resolving source', { sourceItemId: args.sourceItemId });
  const source = await resolveCreatorSource(args.sourceItemId, deps);
  logTranscript(`provider ${source.provider}`, {
    sourceItemId: source.sourceItemId,
    url: source.url,
  });

  const fetchTranscript = deps.fetchTranscript || fetchCreatorTranscript;
  const fetched = await fetchTranscript(source, deps.providers);
  const mode = args.dryRun ? 'override' : 'fill-missing';
  const transcript = applyCliMetadata(fetched.transcript, args, mode);
  return { transcript, acquisition: fetched.acquisition };
}
