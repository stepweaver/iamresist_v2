import { formatCreatorNotesReport, parseCreatorNotesExtractArgs } from '@/lib/creatorNotes/format';
import { prepareCreatorNotesTranscript } from '@/lib/creatorNotes/prepare';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';

async function main() {
  const args = parseCreatorNotesExtractArgs(process.argv.slice(2));
  const prepared = await prepareCreatorNotesTranscript(args);

  const result = await runCreatorNoteExtraction({
    transcript: prepared.transcript,
    dryRun: args.dryRun,
    force: args.force,
    limitNotes: args.limitNotes,
    maxWindows: args.maxWindows,
    bypassExtractionCache: args.bypassExtractionCache,
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
