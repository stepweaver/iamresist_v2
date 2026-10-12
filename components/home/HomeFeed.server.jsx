import { Suspense } from 'react';
import ShopPromoSection from '@/components/home/ShopPromoSection';
import CurrentlyReadingCard from '@/components/home/CurrentlyReadingCard';
import CurrentlyReadingCardSkeleton from '@/components/home/CurrentlyReadingCardSkeleton';
import HomeLiveBriefingSection from '@/components/home/HomeLiveBriefingSection';
import VoicesFeedSection from '@/components/voices/VoicesFeedSection';
import ProtestMusicSection from '@/components/home/ProtestMusicSection';
import {
  HomeLiveBriefingSkeleton,
  HomeProtestMusicSkeleton,
  HomeTelescreenSkeleton,
} from '@/components/home/HomeFeedSkeleton';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getHomeLiveBriefing } from '@/lib/feeds/homepageBriefing.service';
import { getRecentProtestMusicItemsWithFallback } from '@/lib/feeds/protestMusicFeed.service';
import { isUpstreamFailure } from '@/lib/feeds/upstreamResult';
import { timeAsync } from '@/lib/ops/perfTiming';

export const TELESCREEN_SECTION_CLASS = 'order-1 mb-6 sm:mb-8 lg:order-2';

export async function HomeLiveBriefingSlot() {
  try {
    const briefing = await timeAsync('homepage-section:live-briefing', () => getHomeLiveBriefing());
    return <HomeLiveBriefingSection briefing={briefing} />;
  } catch (err) {
    if (isUpstreamFailure(err) && Array.isArray(err.fallback) && err.fallback.length > 0) {
      return <HomeLiveBriefingSection briefing={{ items: err.fallback }} />;
    }
    if (!isUpstreamFailure(err)) {
      console.warn('[homepage-section:live-briefing] failed');
    }
    return null;
  }
}

export async function HomeTelescreenSlot() {
  try {
    let feedItems;
    try {
      feedItems = await timeAsync('homepage-section:telescreen', () => getHomepageIntelFeed());
    } catch (err) {
      if (!isUpstreamFailure(err)) {
        console.warn('[homepage-section:telescreen] failed');
        return null;
      }
      feedItems = Array.isArray(err.fallback) ? err.fallback : [];
    }
    if (!feedItems?.length) return null;

    return (
      <div className={TELESCREEN_SECTION_CLASS}>
        <VoicesFeedSection
          items={feedItems}
          title="Telescreen"
          showViewAll={true}
          description="Commentary and media — how people are framing events, not the same pool as the live briefing desk."
        />
      </div>
    );
  } catch (err) {
    if (!isUpstreamFailure(err)) {
      console.warn('[homepage-section:telescreen] failed');
    }
    return null;
  }
}

export async function HomeProtestMusicSlot() {
  try {
    const items = await timeAsync('homepage-section:protest-music', () =>
      getRecentProtestMusicItemsWithFallback(),
    );
    return <ProtestMusicSection items={items || []} />;
  } catch (err) {
    if (!isUpstreamFailure(err)) {
      console.warn('[homepage-section:protest-music] failed');
    }
    return null;
  }
}

export default function HomeFeed() {
  return (
    <div className="w-full max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-4 sm:py-6">
      <ShopPromoSection />

      <Suspense fallback={<CurrentlyReadingCardSkeleton />}>
        <CurrentlyReadingCard />
      </Suspense>

      <div className="flex flex-col">
        <div className="order-2 lg:order-1">
          <Suspense fallback={<HomeLiveBriefingSkeleton />}>
            <HomeLiveBriefingSlot />
          </Suspense>
        </div>
        <Suspense fallback={<HomeTelescreenSkeleton className={TELESCREEN_SECTION_CLASS} />}>
          <HomeTelescreenSlot />
        </Suspense>
      </div>

      <Suspense fallback={<HomeProtestMusicSkeleton />}>
        <HomeProtestMusicSlot />
      </Suspense>
    </div>
  );
}
