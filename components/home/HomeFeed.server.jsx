import { Suspense } from 'react';
import ShopPromoSection from '@/components/home/ShopPromoSection';
import CurrentlyReadingCard from '@/components/home/CurrentlyReadingCard';
import CurrentlyReadingCardSkeleton from '@/components/home/CurrentlyReadingCardSkeleton';
import FeaturedNewswireSection from '@/components/home/FeaturedNewswireSection';
import VoicesFeedSection from '@/components/voices/VoicesFeedSection';
import ProtestMusicSection from '@/components/home/ProtestMusicSection';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getLatestProtestMusicItem } from '@/lib/feeds/protestMusicFeed.service';
import { getNewswireStories, pickDiverseTopStories } from '@/lib/newswire';

export default async function HomeFeed() {
  const [feedItems, latestProtestMusicItem, newswireStories] = await Promise.all([
    getHomepageIntelFeed(),
    getLatestProtestMusicItem(),
    getNewswireStories(),
  ]);
  const homepageNewswireStories = pickDiverseTopStories(newswireStories ?? [], 3, 1);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-4 sm:py-6">
      <ShopPromoSection />

      <Suspense fallback={<CurrentlyReadingCardSkeleton />}>
        <CurrentlyReadingCard />
      </Suspense>

      <FeaturedNewswireSection featuredStories={homepageNewswireStories} />

      {feedItems?.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <VoicesFeedSection items={feedItems} title="Intel" showViewAll={true} />
        </div>
      )}

      <ProtestMusicSection item={latestProtestMusicItem} />
    </div>
  );
}
