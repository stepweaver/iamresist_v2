import EmptyState from '@/components/content/EmptyState';
import PageContainer from '@/components/content/PageContainer';

export const metadata = {
  title: "Intel | I AM [RESIST]",
  description:
    "Voice and perspective feed from contributors and allies. Coming soon: curated intelligence and first-person accounts.",
};

export default function VoicesPage() {
  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-INTEL-01
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                INTEL FEED
              </h1>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <div className="mb-8">
          <p className="mission-copy text-lg text-foreground/80 max-w-3xl">
            First-person accounts, witness reports, and curated intelligence on
            the ground. Voices of resistance from across the movement.
          </p>
        </div>

        {/* Content integration pending */}
        <EmptyState
          title="Intel Feed Under Construction"
          description="We are actively building out our Voices feed. Check back soon for first-person accounts and curated intelligence from the resistance movement."
          actionLabel="Return to Briefing"
          actionHref="/"
        />

        {/* Placeholder for future */}
        <div className="mt-12 hidden">
          {/* Future: VoicesFeedSection component goes here */}
          {/* <VoicesFeedSection /> */}
        </div>
      </PageContainer>
    </main>
  );
}
