import { Suspense } from 'react';
import IntelTabs from '@/components/IntelTabs';
import SourcesAuditSection from '@/components/intel/SourcesAuditSection';
import { getIntelSourcesAudit } from '@/lib/feeds/intelSourcesAudit.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 90;

export const metadata = buildPageMetadata({
  title: 'Intel // Sources | I AM [RESIST]',
  description:
    'Operational audit of OSINT feed sources: provenance class, ingest health, contribution counts, and governance notes.',
  urlPath: '/intel/sources',
});

async function SourcesContent() {
  const audit = await getIntelSourcesAudit();
  return <SourcesAuditSection audit={audit} />;
}

export default function IntelSourcesPage() {
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
        <IntelTabs description="Source registry audit: configured feeds, ingest outcomes, volume, and governance copy synced from the manifest." />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm py-8">Loading sources…</p>
          }
        >
          <SourcesContent />
        </Suspense>
      </div>
    </main>
  );
}
