import 'server-only';

import { unstable_cache } from 'next/cache';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getLatestProtestMusicItem } from '@/lib/feeds/protestMusicFeed.service';
import { getHomeLiveBriefing } from '@/lib/feeds/homepageBriefing.service';

async function buildHomepagePayload() {
  const [feedItems, latestProtestMusicItem, briefing] = await Promise.all([
    getHomepageIntelFeed(),
    getLatestProtestMusicItem(),
    getHomeLiveBriefing(),
  ]);

  return {
    feedItems,
    latestProtestMusicItem,
    briefing,
  };
}

export const getHomepagePayload = unstable_cache(buildHomepagePayload, ['homepage-payload-v1'], {
  revalidate: 120,
  tags: ['homepage-briefing', 'homepage-intel-feed', 'protest-music'],
});