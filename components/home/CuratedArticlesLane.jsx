import Link from 'next/link';
import CuratedArticleCard from '@/components/curated/CuratedArticleCard';

/**
 * Reserved curated-article lane inside the homepage content feed.
 * Selection happens before this component renders. See selectHomepageCuratedArticles.
 */
export default function CuratedArticlesLane({ articles }) {
  const items = Array.isArray(articles) ? articles.filter((article) => article?.path) : [];
  if (!items.length) return null;

  return (
    <section data-testid="home-curated-articles" aria-labelledby="home-curated-articles-title" className="mb-6 sm:mb-8">
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-primary/70 pb-3">
        <div>
          <span id="home-curated-articles-title" className="kicker text-xs font-bold tracking-[0.4em] text-primary sm:text-sm">
            Curated articles
          </span>
        </div>
        <Link href="/curated/articles" className="nav-label shrink-0 text-xs text-foreground/60 hover:text-primary">
          Archive
        </Link>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0">
        {items.map((article) => (
          <li key={article.id || article.slug}>
            <CuratedArticleCard article={article} />
          </li>
        ))}
      </ul>
    </section>
  );
}
