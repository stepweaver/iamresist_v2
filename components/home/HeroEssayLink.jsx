import Link from 'next/link';
import { journalEntryPath, selectHomepageEssays } from '@/components/journal/journalFormat';
import { getHomepageJournalEntries } from '@/lib/journal';

export default async function HeroEssayLink() {
  try {
    const entries = await getHomepageJournalEntries();
    const { latest } = selectHomepageEssays(entries);
    if (!latest) return null;

    return (
      <Link
        href={journalEntryPath(latest)}
        data-testid="hero-latest-essay"
        className="nav-label inline-flex min-h-11 items-center border border-hud-red/40 px-3 text-xs tracking-[0.16em] text-primary transition-colors hover:border-primary hover:bg-primary/10"
      >
        Read Latest Essay
      </Link>
    );
  } catch {
    return null;
  }
}
