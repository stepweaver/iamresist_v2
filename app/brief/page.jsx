import PageContainer from '@/components/content/PageContainer';
import AtomicNotesBrief from '@/components/brief/AtomicNotesBrief';
import { buildBriefEventsCorpus } from '@/lib/briefEvents/presentation';
import { loadCreatorNotesBrief } from '@/lib/creatorNotes/db';
import { intelDbConfigured } from '@/lib/intel/db';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = {
  ...buildPageMetadata({
    title: 'Brief · Event Candidates',
    description:
      'Read-only event-centric timeline derived from persisted Atomic Creator Notes.',
    urlPath: '/brief',
  }),
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function BriefPage() {
  const configured = intelDbConfigured();
  let episodes = [];
  let corpus = {
    days: [],
    eventCount: 0,
    noteCount: 0,
    participatingNoteIds: [],
    excludedNoteCount: 0,
  };
  let loadError = null;

  if (configured) {
    try {
      episodes = await loadCreatorNotesBrief();
      corpus = buildBriefEventsCorpus(episodes);
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
                BRIEF
              </h1>
              <p className="mt-3 max-w-3xl text-sm sm:text-base text-foreground/70 leading-relaxed">
                Event-centric timeline derived from Atomic Creator Notes. Notes are evidence atoms;
                Event Candidates group notes that describe the same development. Creator analysis stays
                attributed and separate from factual developments. Verification is never inferred from
                note kind.
              </p>
            </div>
          </div>
        </div>
      </div>
      <PageContainer>
        <AtomicNotesBrief
          episodes={episodes}
          corpus={corpus}
          configured={configured}
          loadError={loadError}
        />
      </PageContainer>
    </main>
  );
}
