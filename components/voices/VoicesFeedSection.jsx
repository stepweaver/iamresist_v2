import Link from 'next/link';
import VoicesGridWithPlayerClient from '@/components/voices/VoicesGridWithPlayerClient';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';

/**
 * @param {{
 *   limit?: number,
 *   title?: string,
 *   showViewAll?: boolean,
 *   items?: Array<{ id?: string, title?: string }>,
 * }} [props]
 */
export default async function VoicesFeedSection({
  limit = 8,
  title = 'Latest Voices',
  showViewAll = true,
  items: itemsProp,
} = {}) {
  const feed = itemsProp ?? (await getHomepageIntelFeed());
  const items = itemsProp !== undefined ? feed : feed.slice(0, limit);

  if (!items.length) {
    return null;
  }

  return (
    <section className="mb-6 sm:mb-8 border-t border-border/60 pt-6 sm:pt-8">
      <div className="obs-section-head">
        <div className="min-w-0">
          <span className="obs-section-head__title">
            {title}
          </span>
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
