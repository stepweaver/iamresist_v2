import { runCreatorNotesBatch, creatorNotesBatchExitCode } from '@/lib/creatorNotes/batch';
import { formatCreatorNotesBatchReport, parseCreatorNotesBatchArgs } from '@/lib/creatorNotes/format';

async function main() {
  const args = parseCreatorNotesBatchArgs(process.argv.slice(2));
  const result = await runCreatorNotesBatch(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCreatorNotesBatchReport(result));
  }
  process.exit(creatorNotesBatchExitCode(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
