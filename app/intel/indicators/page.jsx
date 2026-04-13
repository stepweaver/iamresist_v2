import { Suspense } from 'react';
import IntelTabs from '@/components/IntelTabs';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Indicators | I AM [RESIST]',
  description:
    'Scheduled macro releases and indicator placeholders (BLS/BEA calendars, future SAM/OFAC wiring). Anecdotal signals stay registry-only until paired with hard indicators.',
  urlPath: '/intel/indicators',
});

async function IndicatorsContent() {
  const desk = await getLiveIntelDesk('indicators');
  return <LiveDeskSection desk={desk} />;
}

export default function IntelIndicatorsPage() {
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
        <IntelTabs description="Scheduled landmines and structured indicator hooks — not a trading terminal; read releases at the source." />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading Indicators desk…</p>
          }
        >
          <IndicatorsContent />
        </Suspense>
      </div>
    </main>
  );
}
