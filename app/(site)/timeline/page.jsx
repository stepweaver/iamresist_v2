import PageContainer from '@/components/content/PageContainer';
import TimelineSection from '@/components/sections/TimelineSection';

export const metadata = {
  title: 'Timeline | I AM [RESIST]',
  description:
    'A chronological record of authoritarian overreach, resistance actions, and key moments in the struggle for democracy.',
};

export default function TimelinePage() {
  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-TIMELINE-01
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                RESISTANCE TIMELINE
              </h1>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <div className="mb-8">
          <p className="mission-copy text-lg text-foreground/80 max-w-3xl">
            A chronological record of authoritarian overreach and the resistance
            movements that fought back. Understanding our past is essential to
            protecting our future.
          </p>
        </div>

        <TimelineSection />
      </PageContainer>
    </main>
  );
}
