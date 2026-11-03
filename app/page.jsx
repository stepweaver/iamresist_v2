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
      <header data-testid="home-masthead" className="border-b border-border pt-0 pb-1">
        <div className="machine-panel signal-stage hud-stage relative isolate overflow-hidden">
          <HudOverlay title="RESISTANCE SIGNAL" code="IAMR-BRIEF-01" />
          {/*
            Mobile stacks a landscape flag masthead. Desktop keeps the two-column
            reticle. `contents` lets the shared heading and links reorder below lg
            without a second accessible copy.
          */}
          <div className="relative z-10 grid grid-cols-1 items-center gap-3 px-4 pt-8 pb-4 sm:gap-4 sm:px-6 sm:pt-9 sm:pb-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-3 lg:px-8 lg:py-10 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:gap-x-14 xl:px-10">
            <div className="order-1 min-w-0 lg:hidden">
              <span className="doc-id block max-w-full border-l-4 border-primary pl-3 text-[10px] leading-snug text-primary sm:pl-4 sm:text-xs">
                RESISTANCE SIGNAL // PUBLIC RELEASE
              </span>
            </div>

            <div className="order-2 flex w-full min-w-0 justify-center lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-center lg:justify-start lg:pl-2">
              <div className="relative w-full md:max-w-[42rem] lg:max-w-[22rem] xl:max-w-[24rem]">
                <div className="relative w-full px-3 pt-3 pb-4 lg:aspect-square lg:p-0">
                  <div className="signal-plate pointer-events-none absolute lg:hidden" aria-hidden="true">
                    <span className="signal-plate__corner signal-plate__corner--tl" />
                    <span className="signal-plate__corner signal-plate__corner--tr" />
                    <span className="signal-plate__corner signal-plate__corner--bl" />
                    <span className="signal-plate__corner signal-plate__corner--br" />
                    <span className="signal-plate__rail" />
                    <span className="signal-plate__pip" />
                  </div>
                  <div className="hidden lg:contents">
                    <TargetReticle />
                  </div>

                  <div className="logo-shadow-hero relative z-10 aspect-[1500/839] w-full lg:absolute lg:inset-[18%] lg:aspect-auto lg:h-auto lg:w-auto">
                    <Image
                      src="/resist_sticker.png"
                      alt="I AM [RESIST] - The flag of resistance"
                      fill
                      className="object-contain"
                      sizes="(max-width: 1023px) 92vw, 320px"
                      priority
                      quality={90}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="contents lg:order-1 lg:col-start-2 lg:row-start-1 lg:block lg:min-w-0 lg:self-end">
              <div className="order-3 min-w-0">
                <div className="inline-block max-w-full border-l-4 border-primary pl-3 sm:pl-4">
                  <span className="doc-id mb-2 hidden max-w-full text-[10px] leading-relaxed tracking-[0.14em] text-primary sm:text-xs sm:tracking-[0.24em] lg:block lg:text-sm lg:tracking-[0.28em]">
                    RESISTANCE SIGNAL // PUBLIC RELEASE
                  </span>
                  <h1 className="hero-title hero-monument max-w-full">
                    <span className="hero-monument__identity">I AM</span>
                    <RotatingWord />
                  </h1>
                </div>
              </div>
              <p className="mission-copy order-4 max-w-[40rem] text-sm leading-relaxed text-foreground/70 sm:text-base lg:mt-2 lg:text-lg xl:text-xl">
                A call to awareness. A chronicle of resistance.
              </p>
            </div>

            <div className="contents lg:order-3 lg:col-start-2 lg:row-start-2 lg:block lg:min-w-0 lg:self-start">
              <p className="mission-copy order-5 max-w-[36rem] text-base leading-snug font-bold text-primary sm:text-lg lg:text-xl xl:text-2xl">
                Silence in the face of fascism is surrender.
              </p>
              <div className="order-6 mt-1 flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2 lg:mt-2">
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

      <div data-testid="home-channels" className="obs-desk px-1 py-3 sm:px-2 sm:py-4 lg:px-3">
        <div className="mx-auto max-w-[1600px]">
          <HomeFeed />
        </div>
      </div>
    </main>
  );
}
