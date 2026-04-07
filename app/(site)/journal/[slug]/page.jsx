import { notFound } from 'next/navigation';
import JournalEntryBody from '@/components/content/JournalEntryBody';
import { getJournalEntryBySlug, getAllJournalSlugs } from '@/lib/data/journal';

export async function generateStaticParams() {
  const slugs = getAllJournalSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }) {
  const entry = getJournalEntryBySlug(params.slug);
  
  if (!entry) {
    return {
      title: 'Journal Entry Not Found | I AM [RESIST]',
    };
  }

  return {
    title: `${entry.title} | I AM [RESIST]`,
    description: entry.excerpt,
  };
}

export default async function JournalEntryPage({ params }) {
  const entry = getJournalEntryBySlug(params.slug);

  if (!entry) {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-JOURNAL-DETAIL
              </span>
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                {entry.title}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3 pb-12">
        <JournalEntryBody entry={entry} showTitle={false} />
      </div>
    </main>
  );
}
