import SourcesAuditSection from '@/components/intel/SourcesAuditSection';
import IntelTabs from '@/components/IntelTabs';
import { getIntelSourcesAudit } from '@/lib/feeds/intelSourcesAudit.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 60;

export const metadata = buildPageMetadata({
  title: 'Intel // Sources | I AM [RESIST]',
  description:
    'Which sources are active, stale, or failing.',
  urlPath: '/intel/sources',
});

export default async function IntelSourcesPage() {
  const audit = await getIntelSourcesAudit();

  return (
    <main
      id="main-content"
      className="hero-page-bg min-h-screen overflow-x-clip"
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs description="Which sources are active, stale, or failing." />
        <SourcesAuditSection audit={audit} />
      </div>
    </main>
  );
}