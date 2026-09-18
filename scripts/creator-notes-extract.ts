import { resolve } from 'node:path';

import { formatCreatorNotesReport, parseCreatorNotesExtractArgs } from '@/lib/creatorNotes/format';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { loadCreatorSourceMetadata } from '@/lib/creatorNotes/source';
import { loadTranscriptFile, mergeTranscriptMetadata } from '@/lib/creatorNotes/transcript';

async function main() {
  const args = parseCreatorNotesExtractArgs(process.argv.slice(2));
  const transcriptPath = resolve(process.cwd(), args.transcriptFile);
  let transcript = loadTranscriptFile(transcriptPath, args.sourceItemId);

  try {
    const sourceMeta = await loadCreatorSourceMetadata(args.sourceItemId);
    transcript = mergeTranscriptMetadata(transcript, sourceMeta);
  } catch (error) {
    console.warn(
      '[creator-notes] source metadata lookup failed',
      error instanceof Error ? error.message : error,
    );
  }

  const result = await runCreatorNoteExtraction({
    transcript,
    dryRun: args.dryRun,
    force: args.force,
    limitNotes: args.limitNotes,
  });

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
