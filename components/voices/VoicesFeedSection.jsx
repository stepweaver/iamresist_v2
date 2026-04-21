import Link from 'next/link';
import VoicesGridWithPlayerClient from '@/components/voices/VoicesGridWithPlayerClient';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';

export default async function VoicesFeedSection({
  limit = 8,
  title = 'Latest Voices',
  showViewAll = true,
  items: itemsProp,
  /** Secondary rail copy (e.g. Telescreen on home — interpretation-grade, not the live briefing). */
  description = null,
} = {}) {
  const feed = itemsProp ?? (await getHomepageIntelFeed());
  const items = itemsProp !== undefined ? feed : feed.slice(0, limit);

  if (!items.length) {
    return null;
  }

  return (
    <section className="mb-6 sm:mb-8 border-t border-border/60 pt-6 sm:pt-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
        <div className="min-w-0">
          <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block">
            {title}
          </span>
          {description ? (
            <p className="text-[11px] sm:text-xs text-foreground/60 font-mono mt-1 max-w-2xl leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {showViewAll && (
          <Link
            href="/telescreen"
            className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap shrink-0"
          >
            Browse video archive -&gt;
          </Link>
        )}
      </div>
      <VoicesGridWithPlayerClient items={items} />
    </section>
  );
}
