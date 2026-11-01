import 'server-only';
import { unstable_cache } from 'next/cache';
import { selectCuratedResources } from '@/lib/curated/resources';
import { getCuratedArticles } from '@/lib/notion/curatedArticles.repo';

const getCachedPublishedCuratedResources = unstable_cache(
  () => getCuratedArticles({ throwOnError: true }),
  ['curated-resources-v1'],
  { revalidate: 300, tags: ['curated-resources'] },
);

/** Published curated resources, featured first. Failures stay uncached and render as none. */
export async function getCuratedResourceDirectory() {
  try {
    const items = await getCachedPublishedCuratedResources();
    return selectCuratedResources(items);
  } catch {
    return [];
  }
}
