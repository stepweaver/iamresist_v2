import SourcesAuditSection from '@/components/intel/SourcesAuditSection';
import IntelTabs from '@/components/IntelTabs';
import { getIntelSourcesAudit } from '@/lib/feeds/intelSourcesAudit.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 60;

export const metadata = buildPageMetadata({
  title: 'Intel // Sources | I AM [RESIST]',
  description:
    'Source governance and ingest health for the I AM [RESIST] OSINT desk. See what is enabled, stale, failing, disabled, or unproven — and why.',
  urlPath: '/intel/sources',
});

export default async function IntelSourcesPage() {
  const audit = await getIntelSourcesAudit();

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
        <IntelTabs description="Source governance, ingest health, failure reasons, and audit visibility for the OSINT desk." />
        <SourcesAuditSection audit={audit} />
      </div>
    </main>
  );
}