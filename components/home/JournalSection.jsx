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
        className="human-record__figure aspect-[16/9] max-h-[30rem] object-cover object-center"
      />
    );
  }

  return (
    <img
      {...shared}
      alt={image.alt || ''}
      className="human-record__figure h-auto max-h-[32rem] w-auto max-w-full object-contain object-top"
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
        className="group relative block border-l-[3px] border-primary py-1 pl-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:pl-6"
      >
        <div className="human-record__meta">
          <span className="human-record__label">{label}</span>
          <EssayDate entry={entry} />
          {reading ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/60">
              {reading}
            </span>
          ) : null}
        </div>
        <h2
          id="home-primary-essay"
          className="human-record__title transition-colors group-hover:text-primary"
          style={displayFont}
        >
          {title}
        </h2>
        {tags.length ? <div className="mt-3"><EssayTags tags={tags} /></div> : null}
        <EssayArtwork image={entry.image} />
        {excerpt ? (
          <p className="human-record__excerpt max-w-[62ch]" style={bodyFont}>
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
    <article data-testid="home-latest-essay" className="human-rail__latest min-w-0">
      <Link
        href={href}
        className="group block px-1 py-4 transition-colors hover:bg-foreground/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="human-record__label">Latest Essay</span>
          <EssayDate entry={entry} className="shrink-0 whitespace-nowrap" />
        </span>
        {category ? (
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/55">
            {category}
          </span>
        ) : null}
        <span
          className="human-rail__title transition-colors group-hover:text-primary"
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

function RecentThumbnail({ image }) {
  const fit = image?.src ? journalImageFit(image) : '';
  return (
    <span className="flex h-[4.5rem] w-full items-center justify-center overflow-hidden border border-border bg-foreground/[0.03] sm:h-20">
      {image?.src ? (
        <img
          src={image.src}
          alt=""
          width={image.width || undefined}
          height={image.height || undefined}
          decoding="async"
          className={
            fit === 'crop'
              ? 'h-full w-full object-cover'
              : 'h-full w-full object-contain object-center'
          }
        />
      ) : null}
    </span>
  );
}

function RecentEssayLink({ entry }) {
  const href = journalEntryPath(entry);
  const title = entry.title || 'Untitled Essay';
  const excerpt = journalDisplayExcerpt(entry);
  const category = essayTags(entry)[0] || '';

  return (
    <li>
      <Link
        href={href}
        className="group grid min-h-11 grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-3 px-1 py-3 transition-colors hover:bg-foreground/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-4"
      >
        <RecentThumbnail image={entry.image} />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              {category || 'Essay'}
            </span>
            <EssayDate entry={entry} className="shrink-0 whitespace-nowrap" />
          </span>
          <span
            className="human-rail__item-title break-words transition-colors group-hover:text-primary"
            style={displayFont}
          >
            {title}
          </span>
          {excerpt ? (
            <span className="line-clamp-3 break-words text-sm leading-relaxed text-foreground/75" style={bodyFont}>
              {excerpt}
            </span>
          ) : null}
          <span className="nav-label mt-1 inline-flex text-[11px] tracking-[0.14em] text-primary/80 transition-colors group-hover:text-primary">
            Read
          </span>
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
  const recentWithArt = await Promise.all(
    selection.recent.map((entry) => decorate(entry, { leadCopy: true })),
  );

  return (
    <section
      data-testid="home-essays"
      aria-labelledby="home-primary-essay"
      className={`${sectionShell} ${barlowCondensed.variable} ${sourceSans3.variable}`}
    >
      <div className="mx-auto max-w-[1600px]">
        <header className="human-record__mast">
          <div>
            <p className="human-record__eyebrow">Journal</p>
            <p data-testid="home-essay-kicker" className="human-record__kicker">
              {label}
            </p>
          </div>
          <Link
            href="/journal"
            className="nav-label shrink-0 text-xs text-foreground/60 transition-colors hover:text-primary"
          >
            Essays & Analysis
          </Link>
        </header>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3 lg:gap-10 xl:grid-cols-[minmax(0,1.7fr)_minmax(18.5rem,0.95fr)] xl:gap-14">
          <div className={latest || recentWithArt.length > 0 ? 'human-record__lead min-w-0 lg:col-span-2 xl:col-span-1' : 'human-record__lead min-w-0 lg:col-span-3 xl:col-span-1'}>
            <PrimaryEssay entry={feature} label={label} />
          </div>
          {latest || recentWithArt.length > 0 ? (
            <aside className="human-rail">
              {latest ? <LatestEssay entry={latest} /> : null}
              {recentWithArt.length > 0 ? (
                <>
                  <p className={`human-rail__label ${latest ? '' : 'mt-0'}`}>
                    Recent
                  </p>
                  <ul
                    data-testid="home-recent-essays"
                    className="human-rail__list"
                  >
                    {recentWithArt.map((entry) => (
                      <RecentEssayLink key={entry.id || entry.slug} entry={entry} />
                    ))}
                  </ul>
                </>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>
    </section>
  );
}
