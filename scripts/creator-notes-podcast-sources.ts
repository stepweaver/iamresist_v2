import { formatPodcastSourcesList, parseCreatorNotesPodcastSourcesArgs } from '@/lib/creatorNotes/format';
import { listPodcastSources } from '@/lib/creatorNotes/podcastCatalog';

async function main() {
  const args = parseCreatorNotesPodcastSourcesArgs(process.argv.slice(2));
  const items = await listPodcastSources({ limit: args.limit });
  console.log(formatPodcastSourcesList(items));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
