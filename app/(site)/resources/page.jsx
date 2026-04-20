import IntelTabs from '@/components/IntelTabs';
import ResourcesSection from '@/app/(site)/telescreen/ResourcesSection';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Resistance Resources, Organizations, and Civic Reference Shelf',
  description:
    'Curated resistance resources, organizations, rights guides, investigations, and practical reference links for democratic defense.',
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
        <IntelTabs description="Resources sit beside Telescreen as their own shelf for organizations, rights guides, and field material." />
        <section className="machine-panel border border-border relative overflow-hidden mb-6 sm:mb-8">
          <div className="absolute inset-0 hud-grid opacity-10" />
          <div className="relative z-10 p-5 sm:p-6 lg:p-8 max-w-4xl">
            <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block mb-2">
              Reference Shelf
            </span>
            <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              Resistance Resources and Civic Reference Material
            </h1>
            <p className="prose-copy mt-4 max-w-3xl text-base sm:text-lg text-foreground/75 leading-relaxed">
              A working shelf of organizations, investigations, rights guides,
              and practical reference links for democratic defense, public
              accountability, and day-to-day civic use.
            </p>
          </div>
        </section>
        <ResourcesSection />
      </div>
    </main>
  );
}

