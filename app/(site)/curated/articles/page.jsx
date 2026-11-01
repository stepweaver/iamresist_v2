import Link from 'next/link';
import CuratedArticleCard from '@/components/curated/CuratedArticleCard';
import { loadPublishedCuratedArticles } from '@/lib/curated/articles';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Curated Articles',
  description:
    'Articles and resources selected by I AM [RESIST], with editorial notes and links back to the original sources.',
  urlPath: '/curated/articles',
});

export const revalidate = 300;

export default async function CuratedArticlesArchivePage() {
  const result = await loadPublishedCuratedArticles();
  const unavailable = result.status !== 'ok';
  const articles = unavailable ? [] : result.items;

  return (
    <main className="hero-page-bg min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16 lg:px-12">
        <nav className="nav-label mb-8 text-sm" aria-label="Breadcrumb">
          <Link href="/" className="font-bold text-foreground/60 transition-colors hover:text-primary">
            Home
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <span className="font-bold text-foreground">Curated Articles</span>
        </nav>
        <header className="mb-8 border-b border-primary/70 pb-4">
          <p className="kicker text-xs font-bold tracking-[0.4em] text-primary sm:text-sm">Archive</p>
          <h1 className="mt-2 font-ui text-3xl font-bold text-foreground sm:text-4xl">Curated articles</h1>
          <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-foreground/70">
            Outside writing selected for this site. Each page carries an I AM [RESIST] note and a link to the original.
          </p>
        </header>
        {unavailable ? (
          <p role="status" className="text-sm text-foreground/70">
            Curated articles are unavailable right now.
          </p>
        ) : null}
        {!unavailable && articles.length === 0 ? (
          <p role="status" className="text-sm text-foreground/70">
            No curated articles are published yet.
          </p>
        ) : null}
        {articles.length > 0 ? (
          <ul className="m-0 grid list-none gap-4 p-0">
            {articles.map((article) => (
              <li key={article.id || article.slug}>
                <CuratedArticleCard article={article} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
