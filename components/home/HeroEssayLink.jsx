import Link from 'next/link';
import { homepageEssayLabel, journalEntryPath, selectHomepageEssays } from '@/components/journal/journalFormat';
import { getHomepageJournalEntries } from '@/lib/journal';

export default async function HeroEssayLink() {
  try {
    const entries = await getHomepageJournalEntries();
    const selection = selectHomepageEssays(entries);
    if (!selection.latest) return null;

    return (
      <Link
        href={journalEntryPath(selection.latest)}
        data-testid="hero-latest-essay"
        className="nav-label inline-flex min-h-11 items-center border border-hud-red/40 px-3 text-xs tracking-[0.16em] text-primary transition-colors hover:border-primary hover:bg-primary/10"
      >
        Read {homepageEssayLabel(selection)}
      </Link>
    );
  } catch {
    return null;
  }
}
