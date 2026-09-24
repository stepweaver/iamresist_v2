import PageContainer from '@/components/content/PageContainer';
import AtomicNotesBrief from '@/components/brief/AtomicNotesBrief';
import { loadCreatorNotesBrief } from '@/lib/creatorNotes/db';
import { intelDbConfigured } from '@/lib/intel/db';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = {
  ...buildPageMetadata({
    title: 'Atomic Creator Notes Brief',
    description: 'Internal experimental viewer for persisted Atomic Creator Notes.',
    urlPath: '/brief',
  }),
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function BriefPage() {
  const configured = intelDbConfigured();
  let episodes = [];
  let loadError = null;

  if (configured) {
    try {
      episodes = await loadCreatorNotesBrief();
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Atomic Creator Notes could not be read.';
    }
  }

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30" />
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-4 lg:px-6">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.28em] block mb-3 text-primary">
                EXPERIMENTAL
              </span>
              <h1 className="section-title text-2xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight break-words">
                ATOMIC CREATOR NOTES
              </h1>
              <p className="mt-3 max-w-3xl text-sm sm:text-base text-foreground/70 leading-relaxed">
                Read-only notebook of notes already stored from the ingestion pipeline. Claims and creator
                analysis are source-derived. They are not independently verified fact.
              </p>
            </div>
          </div>
        </div>
      </div>
      <PageContainer>
        <AtomicNotesBrief episodes={episodes} configured={configured} loadError={loadError} />
      </PageContainer>
    </main>
  );
}
