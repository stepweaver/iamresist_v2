import JournalCard from '@/components/journal/JournalCard';
import { getRecentJournalEntries } from '@/lib/journal';
import Link from 'next/link';

export function JournalSectionSkeleton() {
  return (
    <section className="mb-8 sm:mb-12" role="status" aria-label="Loading journal">
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-28 bg-foreground/10 rounded animate-pulse" />
        <div className="h-3 w-24 bg-foreground/10 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 border border-border bg-foreground/5 animate-pulse" />
        ))}
      </div>
    </section>
  );
}

export default async function JournalSection({ limit = 1 }) {
  const entries = await getRecentJournalEntries(limit);

  if (!entries.length) {
    return null;
  }

  const single = limit === 1;

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-4">
        <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold">
          Latest Journal
        </span>
        <Link
          href="/journal"
          className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap"
        >
          Browse journal -&gt;
        </Link>
      </div>
      <div
        className={
          single
            ? 'max-w-3xl mx-auto grid grid-cols-1 gap-4 sm:gap-5'
            : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5'
        }
      >
        {entries.map((entry) => (
          <JournalCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
