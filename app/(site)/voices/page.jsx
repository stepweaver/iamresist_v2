import EmptyState from '@/components/content/EmptyState';
import PageContainer from '@/components/content/PageContainer';
import IntelTabs from '@/components/IntelTabs';
import VoiceCard from '@/components/voices/VoiceCard';
import { getVoicesFeed } from '@/lib/voices';

export const metadata = {
  title: "Intel | I AM [RESIST]",
  description:
    "First-person accounts, witness reports, and curated intelligence on the ground. Voices of resistance from across the movement.",
};

export default async function VoicesPage() {
  const feed = await getVoicesFeed();
  const hasContent = feed.length > 0;

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
        <div className="mb-6">
          <p className="mission-copy text-lg text-foreground/80 max-w-3xl">
            First-person accounts, witness reports, and curated intelligence on
            the ground. Voices of resistance from across the movement.
          </p>
        </div>

        <IntelTabs description="Browse latest updates from voices and news sources." />

        {hasContent ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {feed.map((item) => (
              <VoiceCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Intel Yet"
            description="We are gathering voices. Check back soon for first-hand accounts and curated intelligence."
            actionLabel="Return to Briefing"
            actionHref="/"
          />
        )}
      </PageContainer>
    </main>
  );
}
