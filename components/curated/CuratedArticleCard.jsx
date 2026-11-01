import Link from 'next/link';
import { curatedSourceLabel } from '@/lib/curated/resources';
import { formatJournalMetaDate } from '@/lib/utils/date';

function ArticleArtwork({ image }) {
  if (!image?.src) return null;
  return (
    <img
      src={image.src}
      alt={image.alt || ''}
      width={image.width || undefined}
      height={image.height || undefined}
      decoding="async"
      loading="lazy"
      className="mb-3 block h-auto max-h-48 w-full border border-border object-contain object-top"
    />
  );
}

export default function CuratedArticleCard({ article }) {
  const href = article?.path || '';
  if (!href) return null;
  const source = curatedSourceLabel(article);
  const dateLabel = formatJournalMetaDate(article.publishedAt);
  const meta = [source, article.resourceType, article.featured ? 'Featured' : ''].filter(Boolean);

  return (
    <article data-testid="curated-article-card" className="min-w-0 border border-border px-4 py-4">
      <ArticleArtwork image={article.image} />
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55">
        {meta.join(' · ') || 'Curated article'}
      </p>
      <h3 className="mt-1 text-xl font-semibold leading-snug text-foreground">
        <Link href={href} className="hover:text-primary">
          {article.title}
        </Link>
      </h3>
      {article.editorialNote ? (
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-foreground/75 line-clamp-4">
          {article.editorialNote}
        </p>
      ) : null}
      {dateLabel ? (
        <time
          className="mt-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/50"
          dateTime={String(article.publishedAt).slice(0, 10)}
        >
          {dateLabel}
        </time>
      ) : null}
      <Link href={href} className="nav-label mt-3 inline-flex text-xs text-primary hover:underline">
        Read on I AM [RESIST]
      </Link>
    </article>
  );
}
