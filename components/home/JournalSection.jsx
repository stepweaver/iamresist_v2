import Link from 'next/link';
import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import {
  homepageEssayLabel,
  journalDates,
  journalDisplayExcerpt,
  journalEntryPath,
  journalImageFit,
  journalReadingLabel,
  sameJournalEntry,
  selectHomepageEssays,
} from '@/components/journal/journalFormat';
import { getHomepageJournalEntries, loadJournalLeadCopy, resolveJournalListingImage } from '@/lib/journal';

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

function EssayDate({ entry, className = '' }) {
  const dates = journalDates(entry);
  if (!dates.displayLabel) return null;
  return (
    <time
      className={`font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/60 ${className}`.trim()}
      dateTime={dates.dateTime || undefined}
    >
      {dates.displayLabel}
    </time>
  );
}

function EssayArtwork({ image, size = 'lead' }) {
  if (!image?.src) return null;
  const fit = journalImageFit(image);
  const shared = {
    src: image.src,
    width: image.width || undefined,
    height: image.height || undefined,
    decoding: 'async',
  };

  if (size === 'compact') {
    if (fit !== 'crop') {
      return (
        <img
          {...shared}
          alt={image.alt || ''}
          className="h-auto max-h-28 w-auto max-w-full border border-border object-contain object-left-top"
        />
      );
    }
    return (
      <img
        {...shared}
        alt=""
        className="h-16 w-24 shrink-0 border border-border object-cover"
      />
    );
  }

  if (fit === 'crop') {
    return (
      <img
        {...shared}
        alt={image.alt || ''}
        className="mt-5 aspect-[16/10] w-full max-h-[28rem] border border-border object-cover object-center"
      />
    );
  }

  return (
    <img
      {...shared}
      alt={image.alt || ''}
      className="mt-5 block h-auto max-h-[32rem] w-auto max-w-full border border-border object-contain object-top"
    />
  );
}

const sectionShell = 'human-band px-1 pt-6 pb-8 sm:px-2 sm:pt-7 lg:px-3 lg:pt-8 lg:pb-10';

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
          <div className="border-t border-border">
            <div className="h-14 animate-pulse border-b border-border bg-foreground/5" />
            <div className="h-14 animate-pulse bg-foreground/5" />
          </div>
        </div>
      </div>
    </section>
  );
}

function PrimaryEssay({ entry, label }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';
  const excerpt = journalDisplayExcerpt(entry);
  const tags = essayTags(entry);
  const reading = journalReadingLabel(entry.readingMinutes);

  return (
    <article data-testid="home-featured-essay" className="relative min-w-0">
      <Link
        href={href}
        className="group relative block border border-border bg-foreground/[0.03] px-4 py-5 transition-colors hover:border-primary/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-7 sm:py-7 lg:px-8 lg:py-9"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">{label}</span>
          <EssayDate entry={entry} />
          {reading ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/60">
              {reading}
            </span>
          ) : null}
          <EssayTags tags={tags} />
        </div>
        <h2
          id="home-primary-essay"
          className="max-w-3xl text-[1.85rem] font-semibold leading-[0.94] text-foreground transition-colors group-hover:text-primary sm:text-4xl lg:text-5xl xl:text-6xl"
          style={displayFont}
        >
          {title}
        </h2>
        <EssayArtwork image={entry.image} />
        {excerpt ? (
          <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-foreground/80 sm:text-lg" style={bodyFont}>
            {excerpt}
          </p>
        ) : null}
        <span className="nav-label mt-5 inline-flex min-h-11 items-center border border-primary px-4 text-xs tracking-[0.16em] text-primary transition-colors group-hover:bg-primary group-hover:text-white">
          Read Essay
        </span>
      </Link>
    </article>
  );
}

function LatestEssay({ entry }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';
  const excerpt = journalDisplayExcerpt(entry);
  const category = essayTags(entry)[0] || '';

  return (
    <article data-testid="home-latest-essay" className="min-w-0 border-t-2 border-primary">
      <Link
        href={href}
        className="group block px-1 py-4 transition-colors hover:bg-foreground/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Latest Essay</span>
          <EssayDate entry={entry} className="shrink-0 whitespace-nowrap" />
        </span>
        {category ? (
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/55">
            {category}
          </span>
        ) : null}
        <span
          className="mt-1 block text-2xl font-semibold leading-[0.98] text-foreground transition-colors group-hover:text-primary sm:text-3xl"
          style={displayFont}
        >
          {title}
        </span>
        <EssayArtwork image={entry.image} size="compact" />
        {excerpt ? (
          <span className="mt-2 line-clamp-3 block max-w-[62ch] text-sm leading-relaxed text-foreground/75 sm:text-base" style={bodyFont}>
            {excerpt}
          </span>
        ) : null}
      </Link>
    </article>
  );
}

function RecentEssayLink({ entry }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';
  const excerpt = journalDisplayExcerpt(entry);
  const category = essayTags(entry)[0] || '';
  const fit = entry.image?.src ? journalImageFit(entry.image) : '';

  return (
    <li>
      <Link
        href={href}
        className="group flex min-h-11 flex-col gap-3 px-1 py-3 transition-colors hover:bg-foreground/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-start"
      >
        {fit === 'crop' ? <EssayArtwork image={entry.image} size="compact" /> : null}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              {category || 'Essay'}
            </span>
            <EssayDate entry={entry} className="shrink-0 whitespace-nowrap" />
          </span>
          <span
            className="text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-xl"
            style={displayFont}
          >
            {title}
          </span>
          {excerpt ? (
            <span className="line-clamp-2 text-sm leading-relaxed text-foreground/70" style={bodyFont}>
              {excerpt}
            </span>
          ) : null}
          {fit === 'contain' ? <EssayArtwork image={entry.image} size="compact" /> : null}
        </span>
      </Link>
    </li>
  );
}

async function decorate(entry, { leadCopy = false } = {}) {
  if (!entry) return null;
  let next = entry;
  if (leadCopy) {
    try {
      const copy = await loadJournalLeadCopy(entry);
      if (copy?.excerpt) next = { ...next, summary: copy.excerpt };
      if (copy?.readingMinutes) next = { ...next, readingMinutes: copy.readingMinutes };
    } catch {
      next = entry;
    }
  }
  try {
    const image = await resolveJournalListingImage(next, { allowBody: true });
    return image ? { ...next, image } : next;
  } catch {
    return { ...next, image: null };
  }
}

export default async function JournalSection() {
  let entries = [];
  try {
    entries = await getHomepageJournalEntries();
  } catch {
    return null;
  }

  const selection = selectHomepageEssays(entries);
  const primary = selection.featured || selection.latest;
  if (!primary) return null;
  const distinctLatest =
    selection.featured && selection.latest && !sameJournalEntry(selection.featured, selection.latest)
      ? selection.latest
      : null;
  const label = homepageEssayLabel(selection);

  const feature = await decorate(primary, { leadCopy: true });
  const latest = distinctLatest ? await decorate(distinctLatest, { leadCopy: true }) : null;
  const recentWithArt = await Promise.all(selection.recent.map((entry) => decorate(entry)));

  return (
    <section
      data-testid="home-essays"
      aria-labelledby="home-primary-essay"
      className={`${sectionShell} ${barlowCondensed.variable} ${sourceSans3.variable}`}
    >
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-primary/70 pb-3">
          <p data-testid="home-essay-kicker" className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
            {label}
          </p>
          <Link
            href="/journal"
            className="nav-label shrink-0 text-xs text-foreground/60 transition-colors hover:text-primary"
          >
            Essays & Analysis
          </Link>
        </div>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:gap-10 xl:gap-12">
          <div className={latest || recentWithArt.length > 0 ? 'min-w-0 lg:col-span-2' : 'min-w-0 lg:col-span-3'}>
            <PrimaryEssay entry={feature} label={label} />
          </div>
          {latest || recentWithArt.length > 0 ? (
            <div className="min-w-0">
              {latest ? <LatestEssay entry={latest} /> : null}
              {recentWithArt.length > 0 ? (
                <>
                  <p
                    className={`mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/50 ${
                      latest ? 'mt-6' : ''
                    }`}
                  >
                    Recent
                  </p>
                  <ul
                    data-testid="home-recent-essays"
                    className="m-0 list-none divide-y divide-border border-t border-border p-0"
                  >
                    {recentWithArt.map((entry) => (
                      <RecentEssayLink key={entry.id || entry.slug} entry={entry} />
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
