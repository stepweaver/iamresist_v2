import Link from 'next/link';
import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import { journalDates, journalDisplayExcerpt, journalEntryPath, selectHomepageEssays } from '@/components/journal/journalFormat';
import { getHomepageJournalEntries, featuredEssayExcerpt } from '@/lib/journal';

const displayFont = {
  fontFamily: 'var(--font-journal-display), "Arial Narrow", "Segoe UI", sans-serif',
};
const bodyFont = {
  fontFamily: 'var(--font-journal-body), "Segoe UI", "Helvetica Neue", sans-serif',
};

function essayTags(entry) {
  const seen = new Set();
  const tags = [];
  for (const tag of entry?.tags || []) {
    const name = String(tag || '').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    tags.push(name);
  }
  return tags;
}

function EssayTags({ tags }) {
  if (!tags.length) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {tags.map((tag) => (
        <li
          key={tag}
          className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/60"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

function EssayDate({ entry }) {
  const dates = journalDates(entry);
  if (!dates.displayLabel) return null;
  return (
    <time className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/60" dateTime={dates.dateTime || undefined}>
      {dates.displayLabel}
    </time>
  );
}

export function JournalSectionSkeleton() {
  return (
    <section className="mx-auto mb-2 max-w-5xl px-3 pt-5 sm:px-4 sm:pt-8 lg:px-6" role="status" aria-label="Loading essays">
      <div className="mb-5 h-3 w-28 animate-pulse bg-foreground/10" />
      <div className="h-16 max-w-3xl animate-pulse bg-foreground/10 sm:h-24" />
      <div className="mt-4 h-16 max-w-2xl animate-pulse bg-foreground/5" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-36 animate-pulse border border-border bg-foreground/5" />
        <div className="h-36 animate-pulse border border-border bg-foreground/5" />
      </div>
    </section>
  );
}

function LatestEssay({ entry }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';
  const excerpt = journalDisplayExcerpt(entry);
  const tags = essayTags(entry);

  return (
    <article>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <EssayDate entry={entry} />
        <EssayTags tags={tags} />
      </div>
      <h2
        id="home-latest-essay"
        className="text-[2rem] font-semibold leading-[0.92] text-foreground sm:text-5xl lg:text-6xl"
        style={displayFont}
      >
        <Link href={href} className="transition-colors hover:text-primary">
          {title}
        </Link>
      </h2>
      {excerpt ? (
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-foreground/80 sm:text-lg" style={bodyFont}>
          {excerpt}
        </p>
      ) : null}
      <Link
        href={href}
        className="nav-label mt-5 inline-flex min-h-11 items-center border border-primary px-4 text-xs tracking-[0.16em] text-primary transition-colors hover:bg-primary hover:text-white"
      >
        Read Essay
      </Link>
    </article>
  );
}

function RecentEssay({ entry }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';
  const excerpt = journalDisplayExcerpt(entry);
  const tags = essayTags(entry);

  return (
    <article className="flex flex-col border border-border bg-foreground/[0.03] px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <EssayDate entry={entry} />
        <EssayTags tags={tags} />
      </div>
      <h3 className="mt-2 text-2xl font-semibold leading-[1.02] text-foreground sm:text-[1.7rem]" style={displayFont}>
        <Link href={href} className="transition-colors hover:text-primary">
          {title}
        </Link>
      </h3>
      {excerpt ? (
        <p className="mt-3 line-clamp-3 text-base leading-relaxed text-foreground/75" style={bodyFont}>
          {excerpt}
        </p>
      ) : null}
      <Link
        href={href}
        className="mt-4 inline-flex min-h-11 items-center self-start font-mono text-[11px] uppercase tracking-[0.16em] text-primary"
      >
        Read Essay
      </Link>
    </article>
  );
}

export default async function JournalSection() {
  let entries = [];
  try {
    entries = await getHomepageJournalEntries();
  } catch {
    return null;
  }

  const { latest, recent } = selectHomepageEssays(entries);
  if (!latest) return null;

  let feature = latest;
  if (!String(latest.summary || '').trim()) {
    try {
      const excerpt = await featuredEssayExcerpt(latest);
      if (excerpt) feature = { ...latest, summary: excerpt };
    } catch {
      feature = latest;
    }
  }

  return (
    <section
      data-testid="home-essays"
      aria-labelledby="home-latest-essay"
      className={`mx-auto mb-2 max-w-5xl px-3 pt-5 sm:px-4 sm:pt-8 lg:px-6 ${barlowCondensed.variable} ${sourceSans3.variable}`}
    >
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-primary/70 pb-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Latest Essay</p>
        <Link
          href="/journal"
          className="nav-label whitespace-nowrap text-xs text-foreground/60 transition-colors hover:text-primary"
        >
          Essays & Analysis
        </Link>
      </div>
      <LatestEssay entry={feature} />
      {recent.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
          {recent.map((entry) => (
            <RecentEssay key={entry.id || entry.slug} entry={entry} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
