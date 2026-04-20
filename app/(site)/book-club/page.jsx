import IntelTabs from '@/components/IntelTabs';
import BooksSection from '@/app/(site)/telescreen/BooksSection';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Political Reading Notes and Resistance Book Club',
  description:
    'Political reading archive with book notes, reading journal entries, and resistance study context.',
  urlPath: '/book-club',
});

export default function BookClubPage() {
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
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs description="Book Club lives beside Telescreen now - the shelf, the notes, and the reading journal in their own destination." />
        <BooksSection />
      </div>
    </main>
  );
}

