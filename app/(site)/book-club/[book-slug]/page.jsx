import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildPageMetadata } from '@/lib/metadata';
import { getBookBySlug, getNotesForBook } from '@/lib/bookclub/service';
import { formatJournalMetaDate } from '@/lib/utils/date';

export const revalidate = 300;

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const bookSlug = resolvedParams['book-slug'];
  const book = await getBookBySlug(bookSlug);

  if (!book) {
    return buildPageMetadata({
      title: 'Book Not Found | I AM [RESIST]',
      description: 'This book could not be found.',
      urlPath: `/book-club/${bookSlug}`,
    });
  }

  const description =
    book.synopsis ||
    (book.author
      ? `Notes and context for ${book.title} by ${book.author}.`
      : `Notes and context for ${book.title}.`);

  return buildPageMetadata({
    title: `${book.title} | Book Club | I AM [RESIST]`,
    description,
    urlPath: `/book-club/${book.slug}`,
    images: book.coverImage
      ? [{ url: book.coverImage, width: 1200, height: 1600, alt: `${book.title} cover` }]
      : undefined,
  });
}

export default async function BookDetailPage({ params }) {
  const resolvedParams = await params;
  const bookSlug = resolvedParams['book-slug'];
  const book = await getBookBySlug(bookSlug);
  const notes = await getNotesForBook(bookSlug);

  if (!book) notFound();

  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-clip"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="max-w-[1100px] mx-auto px-2 sm:px-3 lg:px-4 pt-6 pb-10">
        <nav className="mb-5">
          <Link
            href="/voices?source=books"
            className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold"
          >
            ← Back to Books Intel
          </Link>
        </nav>

        <section className="machine-panel border border-border relative overflow-hidden">
          <div className="absolute inset-0 hud-grid opacity-15" />
          <div className="relative z-10 p-6 sm:p-8">
            <div className="grid gap-6 lg:gap-8 lg:grid-cols-[260px_1fr] items-start">
              <div className="space-y-4">
                {book.coverImage ? (
                  <div className="w-full">
                    <div className="relative aspect-[2/3] w-full max-w-[240px] mx-auto lg:mx-0">
                      <Image
                        src={book.coverImage}
                        alt={`${book.title} cover`}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 240px, 240px"
                        priority
                      />
                    </div>
                  </div>
                ) : null}

                {book.status ? (
                  <div className="flex items-center justify-center lg:justify-start">
                    <span className="px-3 py-1 border border-primary text-primary text-xs font-bold uppercase tracking-wider">
                      {book.status}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-5">
                <header className="border-b border-border pb-4">
                  <h1 className="section-title text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground break-words">
                    {book.title || 'Untitled'}
                  </h1>
                  {book.author ? (
                    <p className="prose-copy text-base sm:text-lg text-foreground/70 mt-2">
                      by {book.author}
                    </p>
                  ) : null}
                </header>

                <div className="space-y-3">
                  <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase block">
                    Synopsis
                  </span>
                  {book.synopsis ? (
                    <p className="prose-copy text-foreground/80 leading-relaxed whitespace-pre-wrap">
                      {book.synopsis}
                    </p>
                  ) : (
                    <p className="prose-copy text-foreground/60 italic">
                      No synopsis on file.
                    </p>
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase block">
                      Reading journal
                    </span>
                    <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
                      [{notes.length} ENTRIES]
                    </span>
                  </div>

                  {notes.length === 0 ? (
                    <p className="prose-copy text-foreground/60">
                      No journal entries are published for this book yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {notes.map((note) => {
                        const dateLabel = note.createdTime
                          ? formatJournalMetaDate(note.createdTime)
                          : note.lastEditedTime
                            ? formatJournalMetaDate(note.lastEditedTime)
                            : '';
                        return (
                          <li key={note.id} className="border border-border/40 hover:border-border/70 transition-colors">
                            <Link
                              href={`/book-club/${book.slug}/entries/${note.slug}`}
                              className="block p-4 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
                            >
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                                <span className="section-title text-base font-bold text-foreground">
                                  {note.title || 'Untitled entry'}
                                </span>
                                {dateLabel ? (
                                  <span className="font-mono text-[10px] text-hud-dim tracking-wider">
                                    {dateLabel}
                                  </span>
                                ) : null}
                              </div>
                              {note.chapterPage ? (
                                <p className="font-mono text-[10px] text-foreground/60 uppercase tracking-wider">
                                  {note.chapterPage}
                                </p>
                              ) : null}
                              {note.content ? (
                                <p className="prose-copy text-foreground/70 mt-2 line-clamp-3">
                                  {note.content}
                                </p>
                              ) : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

