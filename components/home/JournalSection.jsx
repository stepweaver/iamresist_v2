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

const sectionShell = 'px-1 pt-6 sm:px-2 sm:pt-8 lg:px-3';

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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1">
            <div className="h-36 animate-pulse border border-border bg-foreground/5" />
            <div className="h-36 animate-pulse border border-border bg-foreground/5" />
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

function RecentEssay({ entry }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';
  const excerpt = journalDisplayExcerpt(entry);
  const tags = essayTags(entry);

  return (
    <article className="flex h-full flex-col border border-border bg-foreground/[0.03] px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <EssayDate entry={entry} />
        <EssayTags tags={tags} />
      </div>
      <h3 className="mt-2 text-xl font-semibold leading-[1.05] text-foreground sm:text-2xl" style={displayFont}>
        <Link href={href} className="transition-colors hover:text-primary">
          {title}
        </Link>
      </h3>
      {excerpt ? (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/75 sm:text-base" style={bodyFont}>
          {excerpt}
        </p>
      ) : null}
      <Link
        href={href}
        className="mt-auto inline-flex min-h-11 items-center self-start pt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-primary"
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
            <div
              data-testid="home-recent-essays"
              className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:flex lg:h-full lg:flex-col"
            >
              {recent.map((entry) => (
                <div key={entry.id || entry.slug} className="min-w-0 lg:flex-1">
                  <RecentEssay entry={entry} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
