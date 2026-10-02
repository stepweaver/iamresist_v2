import PageContainer from '@/components/content/PageContainer';
import HeadlineTimeline from '@/components/brief/HeadlineTimeline';
import { loadHeadlineTimeline } from '@/lib/headlineTimeline/load';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = {
  ...buildPageMetadata({
    title: 'Brief',
    description:
      'A scannable timeline of stories drawing attention across creators and news sources. Ranking follows source convergence, not an AI importance score.',
    urlPath: '/brief',
  }),
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function BriefPage({ searchParams }) {
  const params = typeof searchParams?.then === 'function' ? await searchParams : searchParams ?? {};
  const debug = String(params.debug || '') === '1';

  let timeline = null;
  let loadError = null;
  try {
    timeline = await loadHeadlineTimeline({ newswire: 'uncached' });
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'The brief could not be loaded.';
  }

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30" />
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-4 lg:px-6">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.28em] block mb-3 text-primary">
                I AM [RESIST]
              </span>
              <h1 className="section-title text-2xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight break-words">
                BRIEF
              </h1>
              <p className="mt-3 max-w-3xl text-sm sm:text-base text-foreground/70 leading-relaxed">
                Stories drawing attention across the sources already coming in. Headlines group when recent titles
                overlap. A story appears here when at least two creators, two news sources, or a creator and a news
                source are covering it. More distinct creators and more distinct news sources raise a story. Creator
                discussion is attention, not verification.
              </p>
            </div>
          </div>
        </div>
      </div>
      <PageContainer>
        <HeadlineTimeline timeline={timeline} debug={debug} loadError={loadError} />
      </PageContainer>
    </main>
  );
}
