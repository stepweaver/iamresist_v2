import Link from 'next/link';
import Image from 'next/image';
import EmptyState from '@/components/content/EmptyState';
import { listBooks } from '@/lib/bookclub/service';

export default async function BooksSection() {
  const books = await listBooks();

  if (!books || books.length === 0) {
    return (
      <EmptyState
        title="[ No Books Yet ]"
        description="Add books to your Notion books database to populate this section."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
      {books.map((book) => (
        <Link
          key={book.id}
          href={`/book-club/${book.slug}`}
          className="machine-panel border border-border relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
        >
          <div className="absolute inset-0 hud-grid opacity-0 group-hover:opacity-10 transition-opacity duration-300" />

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

            <h3 className="section-title text-xl lg:text-2xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors break-words">
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
              <span className="font-mono text-xs text-hud-dim uppercase tracking-wider">
                {book.status ? book.status : 'Book'}
              </span>
              <span className="nav-label text-xs px-3 py-1 border border-primary text-primary group-hover:bg-primary group-hover:text-background transition-colors">
                OPEN →
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
