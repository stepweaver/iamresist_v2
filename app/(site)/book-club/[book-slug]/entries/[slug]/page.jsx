import Link from 'next/link';
import { notFound } from 'next/navigation';
import NotionBlocksBody from '@/components/content/NotionBlocksBody';
import PageMast from '@/components/design/PageMast';
import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import StructuredData from '@/components/seo/StructuredData';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import { buildPageMetadata } from '@/lib/metadata';
import { formatJournalMetaDate } from '@/lib/utils/date';
import { getBookBySlug, getNoteBySlug } from '@/lib/bookclub/service';
import { buildArticleSchema, buildBreadcrumbListSchema } from '@/lib/seo/schema';
import {
  buildSeoExcerptFromBlocks,
  joinSeoDescriptionParts,
  pickSeoDescription,
} from '@/lib/seo/text';

export const revalidate = 300;
export const dynamicParams = true;

function buildReadingNoteDescription(book, note, blocks) {
  return pickSeoDescription(
    [note?.content, buildSeoExcerptFromBlocks(blocks, { maxBlocks: 4, maxLength: 180 })],
    joinSeoDescriptionParts([
      `Reading journal entry for ${book?.title || 'this book'}.`,
      book?.author ? `Book by ${book.author}.` : null,
      note?.chapterPage || null,
    ]),
    180,
  );
}

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
  const blocks = await getCachedPageBlocks(note.id);
  const description = buildReadingNoteDescription(book, note, blocks);

  return buildPageMetadata({
    title: `${title} | ${book.title} | The Resistance Shelf | I AM [RESIST]`,
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
  const canonicalPath = `/book-club/${book.slug}/entries/${note.slug}`;
  const description = buildReadingNoteDescription(book, note, blocks);
  const dateLabel = note.createdTime
    ? formatJournalMetaDate(note.createdTime)
    : note.lastEditedTime
      ? formatJournalMetaDate(note.lastEditedTime)
      : '';
  const schema = [
    buildBreadcrumbListSchema([
      { name: 'Home', url: '/' },
      { name: 'The Resistance Shelf', url: '/book-club' },
      { name: book.title || 'Book', url: `/book-club/${book.slug}` },
      { name: note.title || 'Reading Journal Entry', url: canonicalPath },
    ]),
    buildArticleSchema({
      headline: note.title || `Reading journal entry for ${book.title}`,
      description,
      url: canonicalPath,
      image: book.coverImage || undefined,
      datePublished: note.createdTime || undefined,
      dateModified: note.lastEditedTime || undefined,
    }),
  ];

  return (
    <main className={`min-h-screen ${barlowCondensed.variable} ${sourceSans3.variable}`}>
      <StructuredData data={schema} />
      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3">
        <PageMast
          className="page-mast--wide"
          variant="record"
          kicker="DOC ID: IAMR-BOOK-JOURNAL"
          title={note.title || 'Untitled Entry'}
          lede={`${book.title}${book.author ? ` — ${book.author}` : ''}`}
        >
          {dateLabel ? <p className="record-meta mt-3">Date // {dateLabel}</p> : null}
          {note.chapterPage ? <p className="record-meta mt-2">{note.chapterPage}</p> : null}
          {note.tags?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {note.tags.map((tag, idx) => (
                <span
                  key={`${tag}-${idx}`}
                  className="border border-primary/30 px-2 py-1 text-[10px] uppercase tracking-wider text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-5">
            <Link
              href={`/book-club/${book.slug}`}
              className="nav-label text-xs font-bold text-foreground/60 transition-colors hover:text-primary"
            >
              ← Back to book
            </Link>
          </div>
        </PageMast>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-1 sm:px-2 lg:px-3 pb-12">
        {note.content ? (
          <div className="record-panel record-panel--pad mb-5">
            <div>
              <p className="prose-copy text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {note.content}
              </p>
            </div>
          </div>
        ) : null}

        {blocks.length > 0 ? (
          <div className="record-panel record-panel--pad">
            <div>
              <NotionBlocksBody blocks={blocks} />
            </div>
          </div>
        ) : (
          <div className="record-panel record-panel--pad">
            <p className="prose-copy text-foreground/60 font-mono text-sm">
              [ NO BODY BLOCKS ] — The entry is published in Notion but has no block content yet, or blocks could not be loaded.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

