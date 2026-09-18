import { formatCreatorSourcesList, parseCreatorNotesSourcesArgs } from '@/lib/creatorNotes/format';
import { listCreatorSources } from '@/lib/creatorNotes/resolveSource';

async function main() {
  const args = parseCreatorNotesSourcesArgs(process.argv.slice(2));
  const items = await listCreatorSources({ limit: args.limit });
  console.log(formatCreatorSourcesList(items));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
