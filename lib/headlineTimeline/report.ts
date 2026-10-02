import { countShownClusters } from '@/lib/headlineTimeline/build';
import type { HeadlineTimeline } from '@/lib/headlineTimeline/types';

function line(value: string): string {
  return value;
}

/** Plain-text inspection of a built timeline. No model output. */
export function formatHeadlineTimelineReport(timeline: HeadlineTimeline): string {
  const shown = countShownClusters(timeline);
  const rows = [
    'Headline timeline',
    `window: ${timeline.windowHours}h`,
    `generated: ${timeline.generatedAt}`,
    `candidates: ${timeline.candidateCount} (${timeline.creatorCandidateCount} creators, ${timeline.newsCandidateCount} news)`,
    `clusters: ${timeline.clusterCount}`,
    `shown: ${shown}`,
  ];
  if (timeline.warnings.length) {
    rows.push(`warnings: ${timeline.warnings.join(' | ')}`);
  }
  rows.push('');

  for (const day of timeline.days) {
    rows.push(day.label);
    for (const cluster of day.clusters) {
      rows.push('');
      rows.push(`[score ${cluster.score}] ${cluster.headline}`);
      rows.push(
        `  ${cluster.uniqueCreators} creators · ${cluster.uniqueNewsSources} news sources · ${cluster.itemCount} source items · ${cluster.latestLabel}`,
      );
      rows.push(
        `  rank inputs: creators ${cluster.rank.creatorPoints}, news ${cluster.rank.newsPoints}, cross-source ${cluster.rank.crossSourcePoints}, recency ${cluster.rank.recencyPoints}, repeat ${cluster.rank.repeatPoints}`,
      );
      if (cluster.sharedTokens.length) {
        rows.push(`  shared tokens: ${cluster.sharedTokens.join(', ')}`);
      }
      if (cluster.summary) {
        rows.push(`  summary (${cluster.summarySourceName || 'source'}): ${cluster.summary}`);
      }
      for (const member of cluster.members) {
        rows.push(
          `  - [${member.sourceKind}/${member.channel}] ${member.sourceName}: ${member.title}`,
        );
      }
      const noteCount = cluster.creators.reduce((sum, creator) => sum + creator.notes.length, 0);
      if (noteCount) {
        rows.push(`  atomic notes: ${noteCount}`);
        for (const creator of cluster.creators) {
          if (!creator.notes.length) continue;
          rows.push(`    ${creator.creatorName}`);
          for (const note of creator.notes) {
            rows.push(`      • ${note.text}`);
          }
        }
      }
    }
    rows.push('');
  }

  if (!shown) rows.push('No headline clusters in the window.');
  return rows.map(line).join('\n');
}
