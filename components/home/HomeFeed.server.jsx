import { Suspense } from 'react';
import ShopPromoSection from '@/components/home/ShopPromoSection';
import CurrentlyReadingCard from '@/components/home/CurrentlyReadingCard';
import HomeLiveBriefingSection from '@/components/home/HomeLiveBriefingSection';
import VoicesFeedSection from '@/components/voices/VoicesFeedSection';
import ProtestMusicSection from '@/components/home/ProtestMusicSection';
import {
  HOME_PROTEST_MUSIC_LIMIT,
  selectFeaturedShelfBook,
  takeDistinctCreatorVideos,
} from '@/components/home/homepagePresentation';
import {
  HomeCultureSkeleton,
  HomeLiveBriefingSkeleton,
  HomeTelescreenSkeleton,
} from '@/components/home/HomeFeedSkeleton';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getHomeLiveBriefing } from '@/lib/feeds/homepageBriefing.service';
import { getRecentProtestMusicItemsWithFallback } from '@/lib/feeds/protestMusicFeed.service';
import { listBooks } from '@/lib/bookclub/service';
import { isUpstreamFailure } from '@/lib/feeds/upstreamResult';
import { timeAsync } from '@/lib/ops/perfTiming';

export const TELESCREEN_SECTION_CLASS = 'mb-6 sm:mb-8';

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
    const videos = takeDistinctCreatorVideos(feedItems);
    if (!videos.length) return null;

    return (
      <div className={TELESCREEN_SECTION_CLASS}>
        <VoicesFeedSection
          items={videos}
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
    const tracks = (items || []).slice(0, HOME_PROTEST_MUSIC_LIMIT);
    if (!tracks.length) return null;
    return <ProtestMusicSection items={tracks} embedded />;
  } catch (err) {
    if (!isUpstreamFailure(err)) {
      console.warn('[homepage-section:protest-music] failed');
    }
    return null;
  }
}

export async function HomeCultureSlot() {
  const [music, book] = await Promise.all([
    HomeProtestMusicSlot(),
    listBooks()
      .then((books) => selectFeaturedShelfBook(books))
      .catch((err) => {
        if (!isUpstreamFailure(err)) {
          console.warn('[homepage-section:shelf] failed');
        }
        return null;
      }),
  ]);

  if (!music && !book) return null;

  return (
    <section data-testid="home-culture" aria-label="Culture" className="mb-6 sm:mb-8">
      <div className="mb-4 border-b border-primary/70 pb-3">
        <span className="kicker text-xs font-bold tracking-[0.4em] text-primary sm:text-sm">Culture</span>
      </div>
      <div
        className={
          music && book
            ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6'
            : 'grid grid-cols-1 items-start gap-4'
        }
      >
        {music}
        {book ? <CurrentlyReadingCard book={book} embedded /> : null}
      </div>
    </section>
  );
}

export default function HomeFeed() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-1 py-2 sm:px-2 sm:py-3 lg:px-3">
      <Suspense fallback={<HomeLiveBriefingSkeleton />}>
        <HomeLiveBriefingSlot />
      </Suspense>
      <Suspense fallback={<HomeTelescreenSkeleton className={TELESCREEN_SECTION_CLASS} />}>
        <HomeTelescreenSlot />
      </Suspense>
      <Suspense fallback={<HomeCultureSkeleton />}>
        <HomeCultureSlot />
      </Suspense>
      <ShopPromoSection />
    </div>
  );
}
