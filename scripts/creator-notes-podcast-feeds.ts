import { formatPodcastFeedsReport } from '@/lib/creatorNotes/format';
import { diagnosePodcastFeeds } from '@/lib/creatorNotes/podcastCatalog';

async function main() {
  const report = await diagnosePodcastFeeds();
  console.log(formatPodcastFeedsReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
