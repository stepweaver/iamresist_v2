import Link from 'next/link';
import Image from 'next/image';
import EmptyState from '@/components/content/EmptyState';
import { splitShelfBooks } from '@/components/home/homepagePresentation';
import { listBooks } from '@/lib/bookclub/service';

function BookCard({ book }) {
  return (
        <Link
          href={`/book-club/${book.slug}`}
          className="group record-panel overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
        >
          <div className="relative z-10 p-6">
            {book.coverImage ? (
              <div className="mb-4">
                <div className="relative aspect-[2/3] w-full max-w-[180px] mx-auto">
                  <Image
                    src={book.coverImage}
                    alt={`${book.title} cover`}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 180px, 180px"
                  />
                </div>
              </div>
            ) : null}

            <h3 className="record-title mb-2 transition-colors group-hover:text-primary break-words">
              {book.title || 'Untitled'}
            </h3>

            {book.author ? (
              <p className="prose-copy text-sm text-foreground/70 mb-3">
                by {book.author}
              </p>
            ) : null}

            {book.synopsis ? (
              <p className="prose-copy text-foreground/70 mb-4 line-clamp-3">
                {book.synopsis}
              </p>
            ) : null}

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <span className="record-meta">
                {book.status ? book.status : 'Book'}
              </span>
              <span className="nav-label text-xs px-3 py-1 border border-primary text-primary group-hover:bg-primary group-hover:text-background transition-colors">
                View book
              </span>
            </div>
          </div>
        </Link>
  );
}

export default async function BooksSection() {
  const books = await listBooks();

  if (!books || books.length === 0) {
    console.warn('[shelf] No books returned. Add books to the Notion books database.');
    return (
      <EmptyState
        title="[ No Books Yet ]"
        description="No books are listed yet."
      />
    );
  }

  const { featured, rest } = splitShelfBooks(books);

  return (
    <div className="space-y-8">
      {featured ? (
        <section aria-labelledby="shelf-featured-title">
          <h2 id="shelf-featured-title" className="human-record__label mb-3">
            Featured
          </h2>
          <div className="max-w-xl">
            <BookCard book={featured} />
          </div>
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section aria-labelledby="shelf-collection-title">
          <h2 id="shelf-collection-title" className="record-title mb-4">
            The collection
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {rest.map((book) => (
              <BookCard key={book.id || book.slug} book={book} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
