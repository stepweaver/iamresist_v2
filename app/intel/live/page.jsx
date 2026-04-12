import { Suspense } from 'react';
import IntelTabs from '@/components/IntelTabs';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Live | I AM [RESIST]',
  description:
    'Live intel desk: primary institutional feeds, optional wires, and specialist sources — ranked by provenance, not hype.',
  urlPath: '/intel/live',
});

async function LiveContent() {
  const desk = await getLiveIntelDesk();
  return <LiveDeskSection desk={desk} />;
}

export default function IntelLivePage() {
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
          description="Primary and wire-grade signals, normalized and ranked by provenance. Commentary stays on Voices."
        />
        <Suspense
          fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading live desk…</p>}
        >
          <LiveContent />
        </Suspense>
      </div>
    </main>
  );
}
