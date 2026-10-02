import { formatHeadlineTimelineReport } from '@/lib/headlineTimeline/report';
import { loadHeadlineTimeline } from '@/lib/headlineTimeline/load';

async function main() {
  const timeline = await loadHeadlineTimeline({ newswire: 'uncached' });
  console.log(formatHeadlineTimelineReport(timeline));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
