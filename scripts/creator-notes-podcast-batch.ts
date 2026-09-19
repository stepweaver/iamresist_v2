import { runCreatorNotesPodcastBatch, creatorNotesPodcastBatchExitCode } from '@/lib/creatorNotes/podcastBatch';
import { formatCreatorNotesPodcastBatchReport, parseCreatorNotesBatchArgs } from '@/lib/creatorNotes/format';

async function main() {
  const args = parseCreatorNotesBatchArgs(process.argv.slice(2));
  const result = await runCreatorNotesPodcastBatch(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCreatorNotesPodcastBatchReport(result));
  }
  process.exit(creatorNotesPodcastBatchExitCode(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
