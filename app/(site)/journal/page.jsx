import EmptyState from '@/components/content/EmptyState';
import PageContainer from '@/components/content/PageContainer';

export const metadata = {
  title: "Journal | I AM [RESIST]",
  description:
    "Chronicle of resistance: reporting, analysis, and first-person accounts from the front lines of democracy's defense.",
};

export default function JournalPage() {
  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-JOURNAL-01
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                RESISTANCE JOURNAL
              </h1>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <div className="mb-8">
          <p className="mission-copy text-lg text-foreground/80 max-w-3xl">
            A chronicle of resistance. Original reporting, analysis, and
            first-person narratives documenting America's authoritarian drift and
            the people fighting back.
          </p>
        </div>

        {/* Content integration pending */}
        <EmptyState
          title="Journal Coming Soon"
          description="Our full journal archive is being prepared. Soon you'll find in-depth reporting, dispatches from the front lines, and first-person narratives of resistance."
          actionLabel="Return to Briefing"
          actionHref="/"
        />

        {/* Placeholder for future */}
        <div className="mt-12 hidden">
          {/* Future: Journal listing and filtering goes here */}
          {/* <JournalFeedSection /> */}
        </div>
      </PageContainer>
    </main>
  );
}
