import { loadPersistedCreatorNotesReview } from '@/lib/creatorNotes/db';
import { formatCreatorNotesReview, parseCreatorNotesReviewArgs } from '@/lib/creatorNotes/format';
import { loadVoiceCatalogItems } from '@/lib/creatorNotes/resolveSource';

async function main() {
  const args = parseCreatorNotesReviewArgs(process.argv.slice(2));
  let catalog: Awaited<ReturnType<typeof loadVoiceCatalogItems>> = [];
  try {
    catalog = await loadVoiceCatalogItems();
  } catch (error) {
    console.warn(
      '[creator-notes-review] voice catalog lookup failed',
      error instanceof Error ? error.message : error,
    );
  }

  const result = await loadPersistedCreatorNotesReview(
    {
      limit: args.limit,
      creator: args.creator,
      kind: args.kind,
      sinceHours: args.sinceHours,
      sourceItemId: args.sourceItemId,
    },
    { catalog },
  );

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCreatorNotesReview(result));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
