import PageContainer from '@/components/content/PageContainer';
import TimelineSection from '@/components/sections/TimelineSection';
import Link from 'next/link';
import { summarizeTimeline, timelineCategorySlug } from '@/lib/data/timeline';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Trump Election Undermining Timeline',
  description:
    "A documentary timeline of the Trump administration's efforts to undermine elections, adapted from the Brennan Center for Justice.",
  urlPath: '/timeline',
});

export default function TimelinePage() {
  const coverage = summarizeTimeline();

  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-TIMELINE-01
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                TRUMP ELECTION UNDERMINING TIMELINE
              </h1>
            </div>
          </div>
        </div>
      </div>

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
