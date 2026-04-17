import Image from 'next/image';
import Link from 'next/link';
import Card from '@/components/Card';
import { getCurrentBook } from '@/lib/bookclub/service';

export default async function CurrentlyReadingCard() {
  const currentBook = await getCurrentBook();

  if (!currentBook) return null;

  return (
    <div className="mb-6 sm:mb-8">
      <Card className="p-4 sm:p-6 hover:border-primary transition-colors">
        <div className="flex items-start gap-3 sm:gap-4">
          {currentBook.coverImage && (
            <div className="flex-shrink-0">
              <div className="relative w-16 h-20 sm:w-20 sm:h-28 book-shadow">
                <Image
                  src={currentBook.coverImage}
                  alt={`${currentBook.title} cover`}
                  fill
                  priority
                  className="object-contain rounded-sm"
                  sizes="(max-width: 640px) 64px, 80px"
                />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="kicker text-primary text-xs sm:text-sm font-bold block mb-1">
                  Currently Reading
                </span>
                <Link
                  href={`/book-club/${currentBook.slug}`}
                  className="block hover:text-primary transition-colors"
                >
                  <h3 className="font-ui text-base sm:text-lg font-bold text-foreground mb-1 line-clamp-1">
                    {currentBook.title}
                  </h3>
                  <p className="prose-copy text-xs sm:text-sm text-foreground/60">by {currentBook.author}</p>
                </Link>
              </div>
              <Link
                href="/book-club"
                className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap"
              >
                View All →
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
