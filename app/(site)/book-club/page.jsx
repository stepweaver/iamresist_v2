import BooksSection from '@/app/(site)/telescreen/BooksSection';
import PageMast from '@/components/design/PageMast';
import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'The Resistance Shelf',
  description: 'Political books and published reading notes.',
  urlPath: '/book-club',
});

export default function BookClubPage() {
  return (
    <main
      id="main-content"
      className={`hero-page-bg min-h-screen overflow-x-clip ${barlowCondensed.variable} ${sourceSans3.variable}`}
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <PageMast
          variant="record"
          kicker="Shelf"
          title="The Resistance Shelf"
          lede="Political books and published reading notes."
        />
        <BooksSection />
      </div>
    </main>
  );
}
