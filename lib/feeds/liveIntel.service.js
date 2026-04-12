import 'server-only';

import { unstable_cache } from 'next/cache';
import { intelDbConfigured, fetchRecentSourceItemsForLive } from '@/lib/intel/db';
import { compareLiveRows } from '@/lib/intel/rank';
import { whyItMattersStub } from '@/lib/intel/whyItMatters';

async function buildLiveIntelDesk() {
  if (!intelDbConfigured()) {
    return {
      configured: false,
      stale: false,
      items: [],
      message: 'Supabase credentials not configured.',
    };
  }

  try {
    const rows = await fetchRecentSourceItemsForLive(220);
    const items = rows
      .filter((r) => r.sources)
      .map((r) => {
        const s = r.sources;
        const provenanceClass = s.provenance_class;
        const clusterKeys =
          r.cluster_keys && typeof r.cluster_keys === 'object' && !Array.isArray(r.cluster_keys)
            ? r.cluster_keys
            : {};
        return {
          id: r.id,
          title: r.title,
          summary: r.summary,
          canonicalUrl: r.canonical_url,
          publishedAt: r.published_at,
          fetchedAt: r.fetched_at,
          provenanceClass,
          sourceName: s.name,
          sourceSlug: s.slug,
          stateChangeType: r.state_change_type,
          clusterKeys,
          whyItMatters: whyItMattersStub(provenanceClass, r.state_change_type, clusterKeys),
        };
      });

    items.sort(compareLiveRows);

    return {
      configured: true,
      stale: false,
      items,
      message: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      configured: true,
      stale: true,
      items: [],
      message: msg,
    };
  }
}

export const getLiveIntelDesk = unstable_cache(buildLiveIntelDesk, ['intel-live-desk-v1'], {
  revalidate: 45,
  tags: ['intel-live'],
});
