import PageContainer from '@/components/content/PageContainer';
import TimelineSection from '@/components/sections/TimelineSection';
import Link from 'next/link';
import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import { summarizeTimeline, timelineCategorySlug } from '@/lib/data/timeline';
import { buildPageMetadata } from '@/lib/metadata';
import './timeline.css';

export const metadata = buildPageMetadata({
  title: 'Trump Election Undermining Timeline',
  description:
    "A documentary timeline of the Trump administration's efforts to undermine elections, adapted from the Brennan Center for Justice.",
  urlPath: '/timeline',
});

export default function TimelinePage() {
  const coverage = summarizeTimeline();

  return (
    <main className={`human-masthead-page min-h-screen ${barlowCondensed.variable} ${sourceSans3.variable}`}>
      <header className="human-masthead">
        <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
          <span className="human-masthead__kicker">DOC ID: IAMR-TIMELINE-01</span>
          <h1 className="human-masthead__title">Trump election undermining timeline</h1>
          <p className="human-masthead__meta">
            <span>{coverage.count} documented events</span>
          </p>
        </div>
      </header>

      <PageContainer>
        <div className="mb-8 max-w-3xl space-y-4">
          <p className="mission-copy text-lg text-foreground/80">
            Adapted from the{' '}
            <Link
              href="https://www.brennancenter.org/our-work/research-reports/timeline-trump-administrations-efforts-undermine-elections"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Brennan Center election timeline
            </Link>
            {coverage.startLabel && coverage.endLabel
              ? `, covering ${coverage.startLabel} through ${coverage.endLabel}.`
              : '.'}
          </p>
          {coverage.categories.length > 0 ? (
            <nav aria-label="Timeline categories" className="flex flex-wrap gap-2">
              {coverage.categories.map((category) => (
                <a
                  key={category}
                  href={`#timeline-${timelineCategorySlug(category)}`}
                  className="nav-label inline-flex min-h-11 items-center border border-border px-3 text-xs font-bold tracking-wider text-foreground/70 hover:border-primary hover:text-primary"
                >
                  {category}
                </a>
              ))}
            </nav>
          ) : null}
        </div>

        <TimelineSection />
      </PageContainer>
    </main>
  );
}
