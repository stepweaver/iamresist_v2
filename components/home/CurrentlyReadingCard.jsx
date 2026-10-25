import Image from 'next/image';
import Link from 'next/link';
import Card from '@/components/Card';
import { selectFeaturedShelfBook } from '@/components/home/homepagePresentation';
import { listBooks } from '@/lib/bookclub/service';

export default async function CurrentlyReadingCard({ book, embedded = false } = {}) {
  const featured = book !== undefined ? book : selectFeaturedShelfBook(await listBooks());

  if (!featured?.slug) return null;

  return (
    <div className={embedded ? undefined : 'mb-6 sm:mb-8'} data-testid="home-shelf-book">
      <Card className="p-4 sm:p-6 hover:border-primary transition-colors">
        <div className="flex items-stretch gap-3 sm:gap-4">
          {featured.coverImage && (
            <div className="flex-shrink-0 w-16 sm:w-20 self-stretch">
              <div className="relative h-full min-h-20 sm:min-h-28 book-shadow">
                <Image
                  src={featured.coverImage}
                  alt={`${featured.title} cover`}
                  fill
                  className="object-contain rounded-sm"
                  sizes="(max-width: 640px) 64px, 80px"
                />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0">
                <span className="kicker text-primary text-xs sm:text-sm font-bold block mb-1">
                  The Resistance Shelf
                </span>
                {featured.status ? (
                  <span className="mb-2 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/55">
                    {featured.status}
                  </span>
                ) : null}
                <Link
                  href={`/book-club/${featured.slug}`}
                  className="block hover:text-primary transition-colors"
                >
                  <h3 className="font-ui text-base sm:text-lg font-bold text-foreground mb-1 break-words">
                    {featured.title}
                  </h3>
                  {featured.author ? (
                    <p className="prose-copy text-xs sm:text-sm text-foreground/60">by {featured.author}</p>
                  ) : null}
                </Link>
              </div>
              <Link
                href="/book-club"
                className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap shrink-0 self-start"
              >
                Browse the shelf -&gt;
              </Link>
            </div>
            <Link
              href={`/book-club/${featured.slug}`}
              className="nav-label mt-3 inline-flex min-h-11 items-center text-xs font-bold text-primary"
            >
              View book
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
