import PageContainer from '@/components/content/PageContainer';
import TimelineSection from '@/components/sections/TimelineSection';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Trump Election Undermining Timeline',
  description:
    "A documentary timeline of the Trump administration's efforts to undermine elections, adapted from the Brennan Center for Justice and organized for quick review.",
  urlPath: '/timeline',
});

export default function TimelinePage() {
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
        <div className="mb-8 space-y-4 max-w-3xl">
          <p className="mission-copy text-lg text-foreground/80">
            A documentary timeline of the Trump administration&apos;s efforts
            to undermine elections, adapted from the{' '}
            <Link
              href="https://www.brennancenter.org/our-work/research-reports/timeline-trump-administrations-efforts-undermine-elections"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-semibold"
            >
              Brennan Center&apos;s election undermining timeline
            </Link>{' '}
            . It tracks documented actions across election rules, pressure on
            officials, support for underminers, and the retreat from the
            federal role in election security.
          </p>
          <p className="prose-copy text-foreground/70 text-sm leading-relaxed">
            For the full interactive source material, visit the{' '}
            <Link
              href="https://www.brennancenter.org/our-work/research-reports/timeline-trump-administrations-efforts-undermine-elections"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              full Brennan Center timeline
            </Link>
            . Content is used for educational and documentary purposes with
            full attribution. This page is a static summary manually synced from
            that source — not scraped automatically.
          </p>
        </div>

        <TimelineSection />
      </PageContainer>
    </main>
  );
}
