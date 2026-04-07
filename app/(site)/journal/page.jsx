import PageContainer from '@/components/content/PageContainer';
import JournalCard from '@/components/journal/JournalCard';
import { getInitialJournalEntries } from '@/lib/journal';

export const metadata = {
  title: 'Journal | I AM [RESIST]',
  description:
    'Personal journal – thoughts, reflections, and observations sourced from the editorial Notion workspace.',
};

export const revalidate = 300;

export default async function JournalPage() {
  const entries = await getInitialJournalEntries(15);

  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-JOURNAL-02
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
            A space for thoughts, observations, and reflections. Entries below are
            loaded from Notion when{' '}
            <span className="font-mono text-sm text-primary/90">
              NOTION_API_KEY
            </span>{' '}
            and{' '}
            <span className="font-mono text-sm text-primary/90">
              NOTION_JOURNAL_DB_ID
            </span>{' '}
            are configured; only pages with Status = Published are shown.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="machine-panel border border-border p-8 text-center">
            <p className="nav-label text-primary mb-4">[ NO ENTRIES ]</p>
            <p className="prose-copy text-foreground/70 max-w-xl mx-auto">
              Journal entries will appear here once Notion is configured and
              entries are set to Published.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {entries.map((entry) => (
              <JournalCard
                key={entry.id}
                entry={{ ...entry, slug: entry.slug || entry.id }}
              />
            ))}
          </div>
        )}
      </PageContainer>
    </main>
  );
}
