import IntelTabs from '@/components/IntelTabs';
import ResourcesSection from '@/app/(site)/telescreen/ResourcesSection';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Resistance Resources and Reference Shelf',
  description:
    'Reference material, organizations, and practical resources for democratic defense, resistance study, and public accountability.',
  urlPath: '/resources',
});

export default function ResourcesPage() {
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
        <IntelTabs description="Resources live beside Telescreen now - a separate surface for references, organizations, and practical material." />
        <ResourcesSection />
      </div>
    </main>
  );
}

