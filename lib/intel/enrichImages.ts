import 'server-only';

import pLimit from 'p-limit';

import { polishFeedCardImageUrl, shouldSkipFeedImageCandidate } from '@/lib/feeds/feedItemImage.js';
import { fetchOgImageUncached } from '@/lib/feeds/ogImage.js';
import type { NormalizedItem } from '@/lib/intel/types';

type EnrichImagesOptions = {
  max?: number;
  concurrency?: number;
};

export async function enrichNormalizedItemsWithImages(
  items: NormalizedItem[],
  opts: EnrichImagesOptions = {},
): Promise<NormalizedItem[]> {
  if (!Array.isArray(items) || items.length === 0) return items;

  const max = Math.min(32, Math.max(0, Number(opts.max) || 12));
  const concurrency = Math.min(6, Math.max(1, Number(opts.concurrency) || 4));
  if (max === 0) return items;

  const missing = items.filter((it) => it?.canonicalUrl && !it.imageUrl).slice(0, max);
  if (missing.length === 0) return items;

  const limit = pLimit(concurrency);

  await Promise.all(
    missing.map((it) =>
      limit(async () => {
        try {
          const og = await fetchOgImageUncached(it.canonicalUrl);
          if (og && !shouldSkipFeedImageCandidate(og)) {
            it.imageUrl = polishFeedCardImageUrl(og) ?? og;
          }
        } catch {
          // keep null; image enrichment should never fail the ingest
        }
      }),
    ),
  );

  return items;
}
