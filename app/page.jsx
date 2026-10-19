import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import RotatingWord from '@/components/home/RotatingWord';
import HudOverlay from '@/components/home/HudOverlay';
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
        <div className="relative overflow-hidden machine-panel scanline hud-stage">
          <HudOverlay title="RESISTANCE SIGNAL" code="IAMR-BRIEF-01" />
          <div className="relative z-10 grid grid-cols-1 items-center gap-4 px-4 py-6 sm:gap-6 sm:px-6 lg:grid-cols-[400px_1fr] lg:gap-10 lg:px-8 xl:grid-cols-[450px_1fr] xl:gap-12">
            <div className="flex justify-center lg:justify-start lg:pl-6">
              <div className="logo-shadow-hero relative h-72 w-72 sm:h-80 sm:w-80 md:h-96 md:w-96 lg:h-80 lg:w-80 xl:h-96 xl:w-96">
                <Image
                  src="/resist_sticker.png"
                  alt="I AM [RESIST] - The flag of resistance"
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 288px, (max-width: 768px) 320px, (max-width: 1024px) 384px, (max-width: 1280px) 320px, 384px"
                  priority
                  quality={90}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
              <div>
                <div className="inline-block border-l-4 border-primary pl-3 sm:pl-4">
                  <span className="doc-id mb-1.5 block whitespace-nowrap text-[10px] tracking-[0.2em] text-primary sm:text-sm sm:tracking-[0.4em]">
                    RESISTANCE SIGNAL // PUBLIC RELEASE
                  </span>
                  <h1 className="hero-title whitespace-nowrap text-2xl font-bold leading-tight sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl">
                    I AM <RotatingWord />
                  </h1>
                </div>
                <p className="mission-copy mt-3 whitespace-nowrap text-sm text-foreground/70 sm:mt-4 sm:text-base lg:text-lg xl:text-xl">
                  A call to awareness. A chronicle of resistance.
                </p>
              </div>
              <div>
                <p className="mission-copy mb-3 text-base font-bold leading-tight text-primary sm:text-lg md:text-xl lg:text-xl xl:text-2xl">
                  Silence in the face of fascism is surrender.
                </p>
                <Link
                  href="/about"
                  className="nav-label text-xs text-foreground/60 transition-colors hover:text-primary sm:text-sm md:text-base"
                >
                  Read Full Mission →
                </Link>
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
