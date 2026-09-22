import { buildEventThreads, EVENT_THREADS_PERSISTENCE_DISABLED } from '@/lib/eventThreads/build';
import {
  createSupabaseAtomicNotesReader,
  createSupabaseIntelOsintSearch,
} from '@/lib/eventThreads/db';
import { formatEventThreadsReport, parseEventThreadsBuildArgs } from '@/lib/eventThreads/format';
import { createDryRunEventThreadsWriter } from '@/lib/eventThreads/store';
import { resolvePodcastEpisode } from '@/lib/creatorNotes/podcastCatalog';

async function main() {
  const args = parseEventThreadsBuildArgs(process.argv.slice(2));
  if (!args.dryRun) {
    throw new Error(EVENT_THREADS_PERSISTENCE_DISABLED);
  }

  let sourceMeta = null;
  try {
    const episode = await resolvePodcastEpisode(args.sourceItemId);
    sourceMeta = {
      sourceItemId: args.sourceItemId,
      creatorId: episode.creatorId,
      creatorName: episode.creatorName,
      title: episode.title,
      url: episode.episodeUrl,
      publishedAt: episode.publishedAt,
    };
  } catch {
    sourceMeta = null;
  }

  const result = await buildEventThreads({
    sourceItemId: args.sourceItemId,
    dryRun: true,
    reader: createSupabaseAtomicNotesReader(),
    writer: createDryRunEventThreadsWriter(),
    searchIntel: createSupabaseIntelOsintSearch(),
    loadSourceMeta: sourceMeta
      ? async () => sourceMeta
      : undefined,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatEventThreadsReport(result));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
