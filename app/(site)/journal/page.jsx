import PageContainer from '@/components/content/PageContainer';
import JournalCard from '@/components/journal/JournalCard';
import { getJournalIndexPayload } from '@/lib/journal';

export const metadata = {
  title: 'Journal | I AM [RESIST]',
  description:
    'Personal journal – thoughts, reflections, and observations sourced from the editorial Notion workspace.',
};

export const revalidate = 300;

export default async function JournalPage() {
  const { entries, listKind, apiError } = await getJournalIndexPayload(15);

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
            A space for thoughts, observations, and reflections.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="machine-panel border border-border p-8 text-center">
            <p className="nav-label text-primary mb-4">[ NO ENTRIES ]</p>
            {listKind === 'unconfigured' && (
              <p className="prose-copy text-foreground/70 max-w-xl mx-auto">
                Set{' '}
                <span className="font-mono text-sm text-primary/90">
                  NOTION_API_KEY
                </span>{' '}
                and{' '}
                <span className="font-mono text-sm text-primary/90">
                  NOTION_JOURNAL_DB_ID
                </span>{' '}
                in the environment, redeploy or restart the dev server, then
                reload.
              </p>
            )}
            {listKind === 'api_error' && (
              <>
                <p className="prose-copy text-foreground/70 max-w-xl mx-auto">
                  The journal database could not be read from Notion. Confirm
                  the integration is connected to the journal database and has
                  access.
                </p>
                {apiError && (
                  <p className="mt-4 font-mono text-xs text-foreground/50 max-w-xl mx-auto break-words">
                    {apiError}
                  </p>
                )}
                {process.env.NODE_ENV === 'development' && (
                  <p className="mt-4 prose-copy text-foreground/50 max-w-xl mx-auto text-sm">
                    Dev hint: token typo, wrong DB id, or integration not
                    invited to the database often show up as Notion API errors
                    above.
                  </p>
                )}
              </>
            )}
            {listKind === 'empty' && (
              <p className="prose-copy text-foreground/70 max-w-xl mx-auto">
                Notion is configured, but no rows match{' '}
                <span className="font-mono text-sm text-primary/90">
                  Status = Published
                </span>
                . Publish a row or adjust the Status option name to match
                what the site filters on.
              </p>
            )}
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
