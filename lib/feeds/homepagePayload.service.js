import 'server-only';

import { unstable_cache } from 'next/cache';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getRecentProtestMusicItems } from '@/lib/feeds/protestMusicFeed.service';
import { getHomeLiveBriefing } from '@/lib/feeds/homepageBriefing.service';

async function buildHomepagePayload() {
  const [feedItems, protestMusicItems, briefing] = await Promise.all([
    getHomepageIntelFeed(),
    getRecentProtestMusicItems(),
    getHomeLiveBriefing(),
  ]);

  return {
    feedItems,
    protestMusicItems,
    briefing,
  };
}

export const getHomepagePayload = unstable_cache(buildHomepagePayload, ['homepage-payload-v2'], {
  revalidate: 120,
  tags: ['homepage-briefing', 'homepage-intel-feed', 'protest-music'],
});
