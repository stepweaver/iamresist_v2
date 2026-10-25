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

const sectionShell = 'px-1 pt-4 sm:px-2 sm:pt-5 lg:px-3';

export function JournalSectionSkeleton() {
  return (
    <section className={sectionShell} role="status" aria-label="Loading essays">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5 h-3 w-28 animate-pulse bg-foreground/10" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-10">
          <div className="lg:col-span-2">
            <div className="h-8 w-40 animate-pulse bg-foreground/10" />
            <div className="mt-4 h-16 max-w-xl animate-pulse bg-foreground/10 sm:h-24" />
            <div className="mt-4 h-16 max-w-lg animate-pulse bg-foreground/5" />
          </div>
          <div className="border border-border">
            <div className="h-14 animate-pulse border-b border-border bg-foreground/5" />
            <div className="h-14 animate-pulse bg-foreground/5" />
          </div>
        </div>
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
    <article
      data-testid="home-featured-essay"
      className="relative border border-border bg-foreground/[0.03] px-4 py-5 sm:px-7 sm:py-7 lg:px-8 lg:py-9"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <EssayDate entry={entry} />
        <EssayTags tags={tags} />
      </div>
      <h2
        id="home-latest-essay"
        className="max-w-3xl text-[1.85rem] font-semibold leading-[0.94] text-foreground sm:text-4xl lg:text-5xl xl:text-6xl"
        style={displayFont}
      >
        <Link href={href} className="transition-colors hover:text-primary">
          {title}
        </Link>
      </h2>
      {excerpt ? (
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-foreground/80 sm:text-lg" style={bodyFont}>
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

function RecentEssayLink({ entry }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';

  return (
    <li>
      <Link
        href={href}
        className="group flex min-h-11 flex-col justify-center gap-1 px-4 py-3 transition-colors hover:bg-foreground/[0.04] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span
          className="text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-xl"
          style={displayFont}
        >
          {title}
        </span>
        <EssayDate entry={entry} />
      </Link>
    </li>
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
      className={`${sectionShell} ${barlowCondensed.variable} ${sourceSans3.variable}`}
    >
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-primary/70 pb-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Latest Essay</p>
          <Link
            href="/journal"
            className="nav-label shrink-0 text-xs text-foreground/60 transition-colors hover:text-primary"
          >
            Essays & Analysis
          </Link>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3 lg:gap-10 xl:gap-12">
          <div className="min-w-0 lg:col-span-2">
            <LatestEssay entry={feature} />
          </div>
          {recent.length > 0 ? (
            <div className="min-w-0">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/50">Recent</p>
              <ul
                data-testid="home-recent-essays"
                className="m-0 list-none divide-y divide-border border border-border bg-foreground/[0.03] p-0"
              >
                {recent.map((entry) => (
                  <RecentEssayLink key={entry.id || entry.slug} entry={entry} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
