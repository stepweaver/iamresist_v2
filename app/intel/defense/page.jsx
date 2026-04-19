import { Suspense } from 'react';
import IntelTabs from '@/components/IntelTabs';
import IntelLaneWarning from '@/components/intel/IntelLaneWarning';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Defense | I AM [RESIST]',
  description:
    'U.S. military and operations-adjacent public sources: official releases and specialist maritime posture context — authentic provenance, source-controlled claims.',
  urlPath: '/intel/defense',
});

async function DefenseContent() {
  const desk = await getLiveIntelDesk('defense_ops');
  return <LiveDeskSection desk={desk} laneWarningSlot={<IntelLaneWarning deskLane="defense_ops" />} />;
}

export default function IntelDefensePage() {
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
        <IntelTabs description="Defense operations stack: official releases plus specialist posture feeds (not a substitute for classified operational data)." />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading Defense desk…</p>
          }
        >
          <DefenseContent />
        </Suspense>
      </div>
    </main>
  );
}
