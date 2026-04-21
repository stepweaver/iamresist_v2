import React, { Suspense } from 'react';
import IntelTabs from '@/components/IntelTabs';
import IntelLaneWarning from '@/components/intel/IntelLaneWarning';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getPublicLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Claims | I AM [RESIST]',
  description:
    'Public claims & statements lane: important political assertions and circulating claims, separated from the OSINT desk. Not confirmed evidence by itself — verify against primary records and independent reporting.',
  urlPath: '/intel/claims',
});

async function ClaimsContent() {
  const desk = await getPublicLiveIntelDesk('statements');
  return <LiveDeskSection desk={desk} laneWarningSlot={<IntelLaneWarning deskLane="statements" />} />;
}

export default function IntelClaimsPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-clip"
      style={{
        backgroundImage:
          'linear-gradient(rgba(239, 68, 68, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(239, 68, 68, 0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs description="Public claims & statements — isolated from OSINT. Not confirmed evidence by itself; verify against primary records and independent reporting." />
        <Suspense
          fallback={<p className="text-foreground/70 uppercase tracking-wider text-sm">Loading Claims lane…</p>}
        >
          <ClaimsContent />
        </Suspense>
      </div>
    </main>
  );
}

