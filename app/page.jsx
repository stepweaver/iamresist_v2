import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import RotatingWord from '@/components/home/RotatingWord';
import HudOverlay, { TargetReticle } from '@/components/home/HudOverlay';
import HeroEssayLink from '@/components/home/HeroEssayLink';
import JournalSection, { JournalSectionSkeleton } from '@/components/home/JournalSection';
import HomeFeed from '@/components/home/HomeFeed.server';
import StructuredData from '@/components/seo/StructuredData';
import { buildPageMetadata } from '@/lib/metadata';
import { buildOrganizationSchema, buildWebSiteSchema } from '@/lib/seo/schema';

export const revalidate = 120;

export const metadata = buildPageMetadata({
  title: 'Antifascist Journal, Democracy Timeline, and Resistance Briefing',
  description:
    'Antifascist journal, democracy timeline, independent voices, and resistance briefing tracking authoritarian drift, democratic backsliding, and the people documenting it.',
  urlPath: '/',
});

const homeSchema = [
  buildOrganizationSchema({
    description:
      'Independent editorial project documenting authoritarian drift, democratic backsliding, and public resistance.',
  }),
  buildWebSiteSchema({
    description:
      'Antifascist journal, democracy timeline, independent voices, and resistance briefing from I AM [RESIST].',
  }),
];

export default function Home() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-hidden hero-page-bg"
    >
      <StructuredData data={homeSchema} />
      <header data-testid="home-masthead" className="border-b border-border pt-0 pb-3">
        <div className="machine-panel scanline hud-stage relative isolate overflow-hidden">
          <HudOverlay title="RESISTANCE SIGNAL" code="IAMR-BRIEF-01" />
          <div className="relative z-10 grid grid-cols-1 items-center gap-4 px-4 pt-9 pb-5 sm:gap-5 sm:px-6 sm:pt-10 sm:pb-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-x-12 lg:gap-y-3 lg:px-8 lg:py-10 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:gap-x-16 xl:px-10">
            <div className="order-1 min-w-0 lg:col-start-2 lg:row-start-1 lg:self-end">
              <div className="inline-block max-w-full border-l-4 border-primary pl-3 sm:pl-4">
                <span className="doc-id mb-2 block max-w-full text-[10px] leading-relaxed tracking-[0.14em] text-primary sm:text-xs sm:tracking-[0.24em] lg:text-sm lg:tracking-[0.28em]">
                  RESISTANCE SIGNAL // PUBLIC RELEASE
                </span>
                <h1 className="hero-title max-w-full text-[clamp(1.65rem,4.8vw,3.75rem)] font-bold leading-[0.95]">
                  <span className="inline-block">I AM</span> <RotatingWord />
                </h1>
              </div>
              <p className="mission-copy mt-3 max-w-[40rem] text-sm leading-relaxed text-foreground/70 sm:mt-4 sm:text-base lg:text-lg xl:text-xl">
                A call to awareness. A chronicle of resistance.
              </p>
            </div>

            <div className="order-2 flex min-w-0 justify-center lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-center lg:justify-start lg:pl-2">
              <div className="relative aspect-square w-[9.25rem] sm:w-44 md:w-52 lg:w-full lg:max-w-[22rem] xl:max-w-[24rem]">
                <TargetReticle />
                <div className="logo-shadow-hero absolute inset-[18%] z-10">
                  <Image
                    src="/resist_sticker.png"
                    alt="I AM [RESIST] - The flag of resistance"
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 120px, (max-width: 768px) 144px, (max-width: 1024px) 168px, 320px"
                    priority
                    quality={90}
                  />
                </div>
              </div>
            </div>

            <div className="order-3 min-w-0 lg:col-start-2 lg:row-start-2 lg:self-start">
              <p className="mission-copy max-w-[36rem] text-base leading-snug font-bold text-primary sm:text-lg lg:text-xl xl:text-2xl">
                Silence in the face of fascism is surrender.
              </p>
              <div className="mt-3 flex flex-col items-start gap-1 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
                <Link
                  href="/about"
                  className="nav-label inline-flex min-h-11 items-center text-xs text-foreground/60 transition-colors hover:text-primary sm:text-sm"
                >
                  Read Full Mission →
                </Link>
                <Suspense fallback={null}>
                  <HeroEssayLink />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </header>

      <Suspense fallback={<JournalSectionSkeleton />}>
        <JournalSection />
      </Suspense>

      <div data-testid="home-channels" className="px-1 py-8 sm:px-2 lg:px-3">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-6 pl-1 font-mono text-xs text-hud-dim">
            // FIELD CHANNELS // UPDATES BY SECTION
          </div>
          <HomeFeed />
        </div>
      </div>
    </main>
  );
}
