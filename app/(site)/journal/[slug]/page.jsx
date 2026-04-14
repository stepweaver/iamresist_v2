import { notFound } from 'next/navigation';
import NotionBlocksBody from '@/components/content/NotionBlocksBody';
import {
  getJournalEntryBySlug,
  getJournalEntryById,
  getAllJournalEntries,
} from '@/lib/journal';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import { formatJournalMetaDate } from '@/lib/utils/date';
import { buildPageMetadata, defaultOgImage } from '@/lib/metadata';

export const revalidate = 300;

function primaryYmd(entry) {
  if (entry.date) {
    const m = String(entry.date).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (entry.createdTime) return String(entry.createdTime).slice(0, 10);
  return '';
}

function journalDetailDates(entry) {
  const primaryKey = primaryYmd(entry);
  const editedKey = entry.lastEditedTime
    ? String(entry.lastEditedTime).slice(0, 10)
    : '';
  const showUpdated =
    Boolean(primaryKey && editedKey && editedKey > primaryKey && entry.lastEditedTime);

  let primaryLabel = '';
  if (entry.date) primaryLabel = formatJournalMetaDate(entry.date);
  else if (entry.createdTime) primaryLabel = formatJournalMetaDate(entry.createdTime);

  const updatedLabel =
    showUpdated && entry.lastEditedTime
      ? formatJournalMetaDate(entry.lastEditedTime)
      : '';

  const fallbackSingle =
    !primaryLabel && entry.lastEditedTime
      ? formatJournalMetaDate(entry.lastEditedTime)
      : '';

  return { primaryLabel, showUpdated, updatedLabel, fallbackSingle };
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
  return buildPageMetadata({
    title: `${title} | I AM [RESIST]`,
    description: title,
    urlPath: `/journal/${slug}`,
    images: [defaultOgImage],
  });
}

export default async function JournalEntryPage({ params }) {
  const { slug } = await params;
  let entry = await getJournalEntryBySlug(slug);
  if (!entry) entry = await getJournalEntryById(slug);

  if (!entry) notFound();

  const blocks = await getCachedPageBlocks(entry.id);
  const { primaryLabel, showUpdated, updatedLabel, fallbackSingle } =
    journalDetailDates(entry);

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
              {primaryLabel && (
                <p
                  className={`font-mono text-[10px] text-hud-dim ${showUpdated ? 'mb-1' : 'mb-3'}`}
                >
                  <span className="text-hud-dim/80">DATE</span> // {primaryLabel}
                </p>
              )}
              {showUpdated && updatedLabel && (
                <p
                  className="font-mono text-[10px] text-primary/90 mb-3 tracking-wider uppercase"
                  title="Last edited in Notion"
                >
                  Updated: {updatedLabel}
                </p>
              )}
              {!primaryLabel && !showUpdated && fallbackSingle && (
                <p className="font-mono text-[10px] text-hud-dim mb-3">
                  <span className="text-hud-dim/80">DATE</span> // {fallbackSingle}
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
