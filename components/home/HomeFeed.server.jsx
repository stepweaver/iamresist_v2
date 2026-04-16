import { Suspense } from 'react';
import ShopPromoSection from '@/components/home/ShopPromoSection';
import CurrentlyReadingCard from '@/components/home/CurrentlyReadingCard';
import CurrentlyReadingCardSkeleton from '@/components/home/CurrentlyReadingCardSkeleton';
import HomeLiveBriefingSection from '@/components/home/HomeLiveBriefingSection';
import VoicesFeedSection from '@/components/voices/VoicesFeedSection';
import ProtestMusicSection from '@/components/home/ProtestMusicSection';
import ResistanceBriefSignup from '@/components/subscribe/ResistanceBriefSignup';
import { getHomepagePayload } from '@/lib/feeds/homepagePayload.service';

export default async function HomeFeed() {
  const { feedItems, latestProtestMusicItem, briefing } = await getHomepagePayload();

  return (
    <div className="w-full max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-4 sm:py-6">
      <ShopPromoSection />

      <div className="mb-6 sm:mb-8">
        <ResistanceBriefSignup source="home" />
      </div>

      <Suspense fallback={<CurrentlyReadingCardSkeleton />}>
        <CurrentlyReadingCard />
      </Suspense>

      <HomeLiveBriefingSection briefing={briefing} />

      {feedItems?.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <VoicesFeedSection
            items={feedItems}
            title="Telescreen"
            showViewAll={true}
            description="Commentary and media — how people are framing events, not the same pool as the live briefing desk."
          />
        </div>
      )}

      <ProtestMusicSection item={latestProtestMusicItem} />
    </div>
  );
}