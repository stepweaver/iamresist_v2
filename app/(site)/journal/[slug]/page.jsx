import { notFound } from 'next/navigation';
import NotionBlocksBody from '@/components/content/NotionBlocksBody';
import {
  getJournalEntryBySlug,
  getJournalEntryById,
  getAllJournalEntries,
} from '@/lib/journal';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import { formatJournalMetaDate } from '@/lib/utils/date';

export const revalidate = 300;

function getDisplayDateLabel(entry) {
  const baseDate =
    entry.date ||
    (entry.createdTime ? String(entry.createdTime).slice(0, 10) : '');
  const editedDate = entry.lastEditedTime
    ? String(entry.lastEditedTime).slice(0, 10)
    : '';
  const wasEdited = baseDate && editedDate && editedDate > baseDate;
  if (wasEdited && entry.lastEditedTime) {
    return `Updated: ${formatJournalMetaDate(entry.lastEditedTime)}`;
  }
  if (entry.date) return formatJournalMetaDate(entry.date);
  if (entry.createdTime) return formatJournalMetaDate(entry.createdTime);
  if (entry.lastEditedTime) return formatJournalMetaDate(entry.lastEditedTime);
  return '';
}

export async function generateStaticParams() {
  try {
    const entries = await getAllJournalEntries();
    return (entries || [])
      .slice(0, 10)
      .map((entry) => ({ slug: entry.slug || entry.id }))
      .filter((p) => p.slug);
  } catch {
    return [];
  }
}

export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  let entry = await getJournalEntryBySlug(slug);
  if (!entry) entry = await getJournalEntryById(slug);
  if (!entry) return { title: 'Journal Entry Not Found | I AM [RESIST]' };
  const title = entry.title || 'Journal Entry';
  return {
    title: `${title} | I AM [RESIST]`,
    description: title,
  };
}

export default async function JournalEntryPage({ params }) {
  const { slug } = await params;
  let entry = await getJournalEntryBySlug(slug);
  if (!entry) entry = await getJournalEntryById(slug);

  if (!entry) notFound();

  const blocks = await getCachedPageBlocks(entry.id);
  const displayDate = getDisplayDateLabel(entry);

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
              {displayDate && (
                <p className="font-mono text-[10px] text-hud-dim mb-3">
                  <span className="text-hud-dim/80">DATE</span> // {displayDate}
                </p>
              )}
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                {entry.title || 'Untitled Entry'}
              </h1>
              {entry.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {entry.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="text-[10px] px-2 py-1 border border-primary/30 text-primary uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3 pb-12">
        {blocks.length > 0 ? (
          <div className="machine-panel border border-border p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute inset-0 hud-grid opacity-10"></div>
            <div className="relative z-10">
              <NotionBlocksBody blocks={blocks} />
            </div>
          </div>
        ) : (
          <div className="machine-panel border border-border p-6 sm:p-8">
            <p className="prose-copy text-foreground/60 font-mono text-sm">
              [ NO BODY BLOCKS ] — The entry is published in Notion but has no
              block content yet, or blocks could not be loaded.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
