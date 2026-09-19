import { formatCreatorNotesReport, parseCreatorNotesPodcastExtractArgs } from '@/lib/creatorNotes/format';
import { preparePodcastCreatorNotesTranscript } from '@/lib/creatorNotes/podcastPrepare';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';

async function main() {
  const args = parseCreatorNotesPodcastExtractArgs(process.argv.slice(2));
  const prepared = await preparePodcastCreatorNotesTranscript(args);

  const result = await runCreatorNoteExtraction({
    transcript: prepared.transcript,
    dryRun: args.dryRun,
    force: args.force,
    limitNotes: args.limitNotes,
  });
  result.transcriptAcquisition = prepared.acquisition;

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
