import Link from 'next/link';
import { notFound } from 'next/navigation';
import ShareButton from '@/components/ShareButton';
import StructuredData from '@/components/seo/StructuredData';
import {
  curatedArticleActionLabel,
  getCuratedArticleBySlug,
  presentCuratedArticle,
} from '@/lib/curated/articles';
import { curatedSourceLabel } from '@/lib/curated/resources';
import { buildPageMetadata, defaultOgImage } from '@/lib/metadata';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import { buildArticleSchema, buildBreadcrumbListSchema } from '@/lib/seo/schema';
import { pickSeoDescription } from '@/lib/seo/text';
import { getCanonicalBaseUrl } from '@/lib/siteConfig';
import { barlowCondensed, sourceSans3 } from '@/app/fonts';
import { formatJournalMetaDate } from '@/lib/utils/date';

export const revalidate = 300;
export const dynamicParams = true;

function articleDescription(article) {
  const source = curatedSourceLabel(article);
  return pickSeoDescription(
    [article?.editorialNote, article?.description],
    [
      article?.title ? `${article.title}.` : null,
      source ? `Curated from ${source}.` : null,
      'Editorial context from I AM [RESIST].',
    ].filter(Boolean).join(' '),
    180,
  );
}

async function loadPresentedArticle(slug) {
  const article = await getCuratedArticleBySlug(slug);
  if (!article) return null;
  const blocks = article.image?.src ? [] : await getCachedPageBlocks(article.id);
  return {
    article,
    presented: presentCuratedArticle(article, blocks),
    description: articleDescription(article),
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const loaded = await loadPresentedArticle(slug);
  if (!loaded) return { title: 'Curated Article | I AM [RESIST]' };
  const { article, presented, description } = loaded;
  return buildPageMetadata({
    title: `${article.title || 'Curated Article'} | Curated`,
    description,
    urlPath: article.path,
    images: presented.metadataImage ? [presented.metadataImage] : [defaultOgImage],
  });
}

export default async function CuratedArticlePage({ params }) {
  const { slug } = await params;
  const loaded = await loadPresentedArticle(slug);
  if (!loaded) notFound();

  const { article, presented, description } = loaded;
  const source = curatedSourceLabel(article);
  const actionLabel = curatedArticleActionLabel(article);
  const publishedLabel = formatJournalMetaDate(article.publishedAt);
  const shareUrl = `${getCanonicalBaseUrl()}${article.path}`;
  const schema = [
    buildBreadcrumbListSchema([
      { name: 'Home', url: '/' },
      { name: 'Curated Articles', url: '/curated/articles' },
      { name: article.title || 'Curated Article', url: article.path },
    ]),
    buildArticleSchema({
      headline: article.title || 'Curated Article',
      description,
      url: article.path,
      image: presented.metadataImage || defaultOgImage,
      datePublished: article.publishedAt || undefined,
      dateModified: article.lastEditedTime || undefined,
    }),
  ];

  return (
    <main className={`hero-page-bg min-h-screen overflow-x-hidden ${barlowCondensed.variable} ${sourceSans3.variable}`}>
      <StructuredData data={schema} />
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16">
        <nav className="nav-label mb-8 text-sm" aria-label="Breadcrumb">
          <Link href="/" className="text-foreground/60 hover:text-primary transition-colors font-bold">
            Home
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <Link href="/curated/articles" className="text-foreground/60 hover:text-primary transition-colors font-bold">
            Curated Articles
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <span className="text-foreground font-bold">{article.title}</span>
        </nav>

        <article className="record-panel overflow-hidden">
          {presented.displayImage?.src ? (
            <img
              src={presented.displayImage.src}
              alt={presented.displayImage.alt || ''}
              width={presented.displayImage.width || undefined}
              height={presented.displayImage.height || undefined}
              decoding="async"
              className="block h-auto max-h-[32rem] w-full border-b border-border object-contain object-top"
            />
          ) : null}
          <div className="p-4 sm:p-6">
            <p className="human-record__label">
              Curated article
            </p>
            <h1 className="record-title mt-2 mb-4">
              {article.title}
            </h1>
            <dl className="mb-5 space-y-2 text-sm text-foreground/80">
              {source ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/50">From</dt>
                  <dd>{source}</dd>
                </div>
              ) : null}
              {article.resourceType ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/50">Resource type</dt>
                  <dd>{article.resourceType}</dd>
                </div>
              ) : null}
              {publishedLabel ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/50">Published</dt>
                  <dd>
                    <time dateTime={String(article.publishedAt).slice(0, 10)}>{publishedLabel}</time>
                  </dd>
                </div>
              ) : null}
            </dl>
            {article.editorialNote ? (
              <>
                <span className="kicker text-xs sm:text-sm font-bold text-primary mb-2 block">
                  I AM [RESIST] editorial note
                </span>
                <div className="journal-copy text-sm sm:text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {article.editorialNote}
                </div>
              </>
            ) : null}
            <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-foreground/60">
              This page curates and attributes the original. It does not republish the source text.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {article.url ? (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-label inline-flex min-h-11 items-center border border-primary px-4 text-xs font-bold uppercase tracking-[0.14em] text-primary hover:bg-primary hover:text-white"
                >
                  {actionLabel}
                </a>
              ) : null}
              <ShareButton
                url={shareUrl}
                title={article.title}
                description={description.slice(0, 160)}
                iconOnly={false}
                heading="Share article"
              />
            </div>
          </div>
        </article>

        <p className="mt-6 text-center">
          <Link
            href="/curated/articles"
            className="nav-label text-sm text-foreground/60 hover:text-primary transition-colors font-bold"
          >
            ← More curated articles
          </Link>
        </p>
      </div>
    </main>
  );
}
