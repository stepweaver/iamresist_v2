import Link from 'next/link';
import { notFound } from 'next/navigation';
import NotionBlocksBody from '@/components/content/NotionBlocksBody';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import { buildPageMetadata } from '@/lib/metadata';
import { formatJournalMetaDate } from '@/lib/utils/date';
import { getBookBySlug, getNoteBySlug } from '@/lib/bookclub/service';

export const revalidate = 300;
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const bookSlug = resolvedParams['book-slug'];
  const noteSlug = resolvedParams.slug;

  const book = await getBookBySlug(bookSlug);
  const note = await getNoteBySlug(bookSlug, noteSlug);

  if (!book || !note) {
    return buildPageMetadata({
      title: 'Journal Entry Not Found | I AM [RESIST]',
      description: 'This journal entry could not be found.',
      urlPath: `/book-club/${bookSlug}/entries/${noteSlug}`,
    });
  }

  const title = note.title || 'Reading Journal Entry';
  const description =
    note.content?.slice(0, 160).replace(/\s+/g, ' ').trim() ||
    `Reading reflections on ${book.title}${book.author ? ` by ${book.author}` : ''}.`;

  return buildPageMetadata({
    title: `${title} | ${book.title} | Book Club | I AM [RESIST]`,
    description,
    urlPath: `/book-club/${book.slug}/entries/${note.slug}`,
    images: book.coverImage
      ? [{ url: book.coverImage, width: 1200, height: 1600, alt: `${book.title} cover` }]
      : undefined,
  });
}

export default async function BookJournalEntryPage({ params }) {
  const resolvedParams = await params;
  const bookSlug = resolvedParams['book-slug'];
  const noteSlug = resolvedParams.slug;

  const book = await getBookBySlug(bookSlug);
  const note = await getNoteBySlug(bookSlug, noteSlug);

  if (!book || !note) notFound();

  const blocks = await getCachedPageBlocks(note.id);
  const dateLabel = note.createdTime
    ? formatJournalMetaDate(note.createdTime)
    : note.lastEditedTime
      ? formatJournalMetaDate(note.lastEditedTime)
      : '';

  return (
    <main className="min-h-screen">
      <div className="machine-panel py-8 mb-8">
        <div className="hud-grid opacity-30"></div>
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
            <div className="border-l-4 border-primary pl-4 sm:pl-6">
              <span className="doc-id text-[10px] sm:text-sm tracking-[0.2em] sm:tracking-[0.4em] block mb-3 text-primary">
                DOC ID: IAMR-BOOK-JOURNAL
              </span>
              {dateLabel ? (
                <p className="font-mono text-[10px] text-hud-dim mb-3">
                  <span className="text-hud-dim/80">DATE</span> // {dateLabel}
                </p>
              ) : null}
              <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                {note.title || 'Untitled Entry'}
              </h1>
              <p className="prose-copy text-foreground/70 mt-3">
                {book.title}
                {book.author ? ` — ${book.author}` : ''}
              </p>
              {note.chapterPage ? (
                <p className="font-mono text-[10px] text-foreground/60 uppercase tracking-wider mt-2">
                  {note.chapterPage}
                </p>
              ) : null}
              {note.tags?.length ? (
                <div className="flex flex-wrap gap-2 mt-4">
                  {note.tags.map((tag, idx) => (
                    <span
                      key={`${tag}-${idx}`}
                      className="text-[10px] px-2 py-1 border border-primary/30 text-primary uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-5">
                <Link
                  href={`/book-club/${book.slug}`}
                  className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold"
                >
                  ← Back to book
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3 pb-12">
        {note.content ? (
          <div className="machine-panel border border-border p-6 sm:p-8 relative overflow-hidden mb-5">
            <div className="absolute inset-0 hud-grid opacity-10"></div>
            <div className="relative z-10">
              <p className="prose-copy text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {note.content}
              </p>
            </div>
          </div>
        ) : null}

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
              [ NO BODY BLOCKS ] — The entry is published in Notion but has no block content yet, or blocks could not be loaded.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

