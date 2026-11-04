import ResourcesSection from '@/app/(site)/telescreen/ResourcesSection';
import PageMast from '@/components/design/PageMast';
import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import { loadPublishedCuratedArticles } from '@/lib/curated/articles';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Resistance Resources, Organizations, and Civic Reference Shelf',
  description:
    'Curated resistance resources, organizations, rights guides, investigations, and practical reference links for democratic defense.',
  urlPath: '/resources',
});

export const revalidate = 300;

export default async function ResourcesPage() {
  const curatedResult = await loadPublishedCuratedArticles();
  const curated = curatedResult.status === 'ok' ? curatedResult.items : [];
  return (
    <main
      id="main-content"
      className={`hero-page-bg min-h-screen overflow-x-clip ${barlowCondensed.variable} ${sourceSans3.variable}`}
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <PageMast
          className="page-mast--wide"
          variant="record"
          kicker="Reference Shelf"
          title="Resistance Resources and Civic Reference Material"
        />
        <ResourcesSection curated={curated} />
      </div>
    </main>
  );
}

