import Link from 'next/link';
import VoiceCard from './VoiceCard';
import { getHomepageVoicesFeed } from '@/lib/voices';

export default async function VoicesFeedSection({
  limit = 6,
  title = 'Latest Voices',
  showViewAll = true
}) {
  const items = await getHomepageVoicesFeed(limit);

  if (!items.length) {
    return null;
  }

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-4">
        <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold">
          {title}
        </span>
        {showViewAll && (
          <Link
            href="/voices"
            className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap"
          >
            View all →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {items.map((item) => (
          <VoiceCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
