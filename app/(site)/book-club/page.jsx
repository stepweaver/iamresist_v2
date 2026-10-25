import BooksSection from '@/app/(site)/telescreen/BooksSection';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'The Resistance Shelf',
  description:
    'The Resistance Shelf: political books with context, and reading notes when they have been published.',
  urlPath: '/book-club',
});

export default function BookClubPage() {
  return (
    <main
      id="main-content"
      className="hero-page-bg min-h-screen overflow-x-clip"
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <section className="machine-panel border border-border relative overflow-hidden mb-6 sm:mb-8">
          <div className="absolute inset-0 hud-grid opacity-10" />
          <div className="relative z-10 p-5 sm:p-6 lg:p-8 max-w-4xl">
            <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block mb-2">
              Shelf
            </span>
            <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              The Resistance Shelf
            </h1>
            <p className="prose-copy mt-4 max-w-3xl text-base sm:text-lg text-foreground/75 leading-relaxed">
              A shelf of political books. Open a title for its context. Reading
              notes appear on a book when they have been published.
            </p>
          </div>
        </section>
        <BooksSection />
      </div>
    </main>
  );
}
