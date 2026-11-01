import Link from 'next/link';
import CuratedArticleCard from '@/components/curated/CuratedArticleCard';
import { selectCuratedResources } from '@/lib/curated/resources';

export default function CuratedResourceGroup({ resources, compact = false, testId }) {
  const items = selectCuratedResources(resources, compact ? { limit: 3 } : {});
  if (!items.length) return null;
  const headingId = compact ? 'home-curated-resources-title' : 'curated-resources-title';

  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId || (compact ? 'home-curated-resources' : 'curated-resources')}
      className={compact ? '' : 'space-y-3'}
    >
      <div className="flex items-end justify-between gap-4 border-b border-primary/70 pb-2">
        <div>
          <h2 id={headingId} className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
            Curated articles
          </h2>
          {compact ? null : (
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-foreground/70">
              Selected writing with an I AM [RESIST] page. The archive keeps every published article.
            </p>
          )}
        </div>
        <Link href="/curated/articles" className="nav-label shrink-0 text-xs text-foreground/60 hover:text-primary">
          Archive
        </Link>
      </div>
      <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
        {items.map((article) => (
          <li key={article.id || article.slug}>
            <CuratedArticleCard article={article} />
          </li>
        ))}
      </ul>
    </section>
  );
}
