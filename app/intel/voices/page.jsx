import { Suspense } from 'react';
import Link from 'next/link';
import IntelTabs from '@/components/IntelTabs';
import IntelLaneWarning from '@/components/intel/IntelLaneWarning';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Voices | I AM [RESIST]',
  description:
    'Creator and commentary from public feeds — previews with links to sources. For video and music, see Telescreen.',
  urlPath: '/intel/voices',
});

async function VoicesDeskContent() {
  const desk = await getLiveIntelDesk('voices');
  return <LiveDeskSection desk={desk} laneWarningSlot={<IntelLaneWarning deskLane="voices" />} />;
}

export default function IntelVoicesDeskPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-clip"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs
          description={
            <>
              <strong className="text-foreground/90">Intel voices</strong> — text and audio from public feeds. Curated
              video and music live on{' '}
              <Link href="/telescreen" scroll className="text-primary hover:underline font-bold">
                Telescreen
              </Link>
              .
            </>
          }
        />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading Voices desk…</p>
          }
        >
          <VoicesDeskContent />
        </Suspense>
      </div>
    </main>
  );
}
