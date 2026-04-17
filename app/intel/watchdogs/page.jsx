import { Suspense } from 'react';
import IntelTabs from '@/components/IntelTabs';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Watchdogs | I AM [RESIST]',
  description:
    'Foreign independent and investigative outlets - corroboration-gated selection; not merged with the core U.S. institutional OSINT desk.',
  urlPath: '/intel/watchdogs',
});

async function WatchdogsContent() {
  const desk = await getLiveIntelDesk('watchdogs');
  return <LiveDeskSection desk={desk} />;
}

export default function IntelWatchdogsPage() {
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
        <IntelTabs description="Independent and regional watchdog reporting - specialist provenance; lead slots require corroboration (shared cluster key or cross-family mission tag)." />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading Watchdogs desk...</p>
          }
        >
          <WatchdogsContent />
        </Suspense>
      </div>
    </main>
  );
}
