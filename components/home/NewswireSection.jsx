import NewswireHeadlineCard from '@/components/newswire/NewswireHeadlineCard';
import { getNewswireStories } from '@/lib/newswire';
import Link from 'next/link';

export default async function NewswireSection({ limit = 3 }) {
  const stories = await getNewswireStories();
  const items = stories.slice(0, limit);

  if (!items.length) {
    return null;
  }

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-4">
        <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold">
          Newswire
        </span>
        <Link
          href="/intel/newswire"
          className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {items.map((story) => (
          <NewswireHeadlineCard key={story.id} story={story} compact />
        ))}
      </div>
    </section>
  );
}
