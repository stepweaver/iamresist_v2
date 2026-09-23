import { formatCreatorNotesReport, parseCreatorNotesPodcastExtractArgs } from '@/lib/creatorNotes/format';
import { preparePodcastCreatorNotesTranscript } from '@/lib/creatorNotes/podcastPrepare';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';

async function main() {
  const startedAt = Date.now();
  const args = parseCreatorNotesPodcastExtractArgs(process.argv.slice(2));
  const prepared = await preparePodcastCreatorNotesTranscript(args);
  const extractionStartedAt = Date.now();

  const result = await runCreatorNoteExtraction({
    transcript: prepared.transcript,
    dryRun: args.dryRun,
    force: args.force,
    limitNotes: args.limitNotes,
    maxWindows: args.maxWindows,
    windowOffset: args.windowOffset,
    bypassExtractionCache: args.bypassExtractionCache,
    contentRoleDiagnostics: args.contentRoleDiagnostics,
  });
  const finishedAt = Date.now();
  result.transcriptAcquisition = {
    ...prepared.acquisition,
    timings: {
      audioDownloadMs: prepared.acquisition.timings?.audioDownloadMs ?? null,
      transcriptionMs: prepared.acquisition.timings?.transcriptionMs ?? null,
      extractionMs: finishedAt - extractionStartedAt,
      totalMs: finishedAt - startedAt,
      cacheHit: prepared.acquisition.timings?.cacheHit ?? prepared.acquisition.cacheHit ?? null,
    },
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCreatorNotesReport(result));
  }

  if (result.persistence.status === 'failed') process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
