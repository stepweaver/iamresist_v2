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
    'White House actions, Federal Register documents, GovInfo records, specialist legal and election analysis, and selected public-interest reporting.',
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
      className="hero-page-bg min-h-screen overflow-x-clip"
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs
          description="White House actions, Federal Register documents, GovInfo records, and specialist legal, election, and public-interest reporting."
        />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading…</p>
          }
        >
          <OsintContent />
        </Suspense>
      </div>
    </main>
  );
}
