import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import RotatingWord from '@/components/home/RotatingWord';
import HudOverlay from '@/components/home/HudOverlay';
import JournalSection from '@/components/home/JournalSection';
import HomeFeed from '@/components/home/HomeFeed.server';
import HomeFeedSkeleton from '@/components/home/HomeFeedSkeleton';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 120;

export const metadata = buildPageMetadata({
  title: 'Antifascist Journal, Democracy Timeline, and Resistance Briefing',
  description:
    'Antifascist journal, democracy timeline, independent voices, and resistance briefing tracking authoritarian drift, democratic backsliding, and the people documenting it.',
  urlPath: '/',
});

export default function Home() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-hidden hero-page-bg"
    >
      {/* Compact Header Section - Hero + Mission Combined */}
      <div className="border-b border-border pt-0 pb-3">
        <div className="w-full">
          <div className="relative overflow-hidden machine-panel scanline">
            <HudOverlay title="RESISTANCE SIGNAL" code="IAMR-BRIEF-01" />
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[400px_1fr] xl:grid-cols-[450px_1fr] gap-4 sm:gap-6 lg:gap-10 xl:gap-12 items-center py-6 px-4 sm:px-6 lg:px-8">
              {/* Left: Flag Logo */}
              <div className="flex justify-center lg:justify-start pl-0 lg:pl-6">
                <div className="relative w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96 lg:w-80 lg:h-80 xl:w-96 xl:h-96 logo-shadow-hero">
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

              {/* Right: Content */}
              <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
                <div>
                  <div className="inline-block border-l-4 border-primary pl-3 sm:pl-4">
                    <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-1.5 whitespace-nowrap text-primary">
                      RESISTANCE SIGNAL // PUBLIC RELEASE
                    </span>
                    <h1 className="hero-title text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight whitespace-nowrap">
                      I AM <RotatingWord />
                    </h1>
                  </div>
                  <p className="mission-copy text-sm sm:text-base lg:text-lg xl:text-xl text-foreground/70 mt-3 sm:mt-4 whitespace-nowrap">
                    A call to awareness. A chronicle of resistance.
                  </p>
                </div>
                <div>
                  <p className="mission-copy text-base sm:text-lg md:text-xl lg:text-xl xl:text-2xl font-bold text-primary mb-3 leading-tight">
                    Silence in the face of fascism is surrender.
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <Link
                      href="/about"
                      className="nav-label text-xs sm:text-sm md:text-base text-foreground/60 hover:text-primary transition-colors"
                    >
                      Read Full Mission →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Field Channels: aggregated content sections */}
      <div className="py-8 px-1 sm:px-2 lg:px-3">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-hud-dim font-mono text-xs mb-6 pl-1">
            // FIELD CHANNELS // UPDATES BY SECTION
          </div>
          <Suspense fallback={<HomeFeedSkeleton />}>
            <HomeFeed />
          </Suspense>
          <JournalSection />
        </div>
      </div>
    </main>
  );
}
