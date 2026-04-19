import React, { Suspense } from 'react';
import IntelTabs from '@/components/IntelTabs';
import IntelLaneWarning from '@/components/intel/IntelLaneWarning';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getPublicLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // OSINT | I AM [RESIST]',
  description:
    'Public-source intelligence desk: White House actions, Federal Register documents, GovInfo records, specialist legal/election analysis, and selected public-interest reporting — normalized into a provenance-ranked feed. Commentary stays on Voices.',
  urlPath: '/intel/osint',
});

async function OsintContent() {
  const desk = await getPublicLiveIntelDesk('osint');
  return <LiveDeskSection desk={desk} laneWarningSlot={<IntelLaneWarning deskLane="osint" />} />;
}

export default function IntelOsintPage() {
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
          description="Public-source intelligence desk: White House actions, Federal Register documents, GovInfo records, specialist legal/election analysis, and selected public-interest reporting — provenance-ranked. Commentary stays on Voices."
        />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading OSINT desk…</p>
          }
        >
          <OsintContent />
        </Suspense>
      </div>
    </main>
  );
}
