import 'server-only';

import { unstable_cache, unstable_noStore } from 'next/cache';
import { selectCuratedResources, selectHomepageCuratedArticles } from '@/lib/curated/resources';
import {
  classifyCuratedArticlesError,
  getCuratedArticles,
} from '@/lib/notion/curatedArticles.repo';
import { defaultOgImage } from '@/lib/metadata';
import {
  journalEditorialDisplaySrc,
  journalEditorialOmitBlockIds,
  journalShareImage,
  resolveJournalEditorialImage,
} from '@/lib/notion/journalImage';
import { readPublicEditorialSize } from '@/lib/journal/publicEditorialSize';

/**
 * Published curated articles are cached for five minutes.
 * Tag `curated-articles` covers the archive, detail pages, and homepage lane.
 * A failed read throws inside the cache callback, so it is not stored as an
 * empty directory. Callers opt out of rendering that failure as a cached page.
 */
export const CURATED_ARTICLES_REVALIDATE_SECONDS = 300;
export const CURATED_ARTICLES_CACHE_KEY = 'curated-articles-v2';
export const CURATED_ARTICLES_CACHE_TAG = 'curated-articles';

export { selectHomepageCuratedArticles };

let cachedRead;
function readPublishedCuratedArticles() {
  if (!cachedRead) {
    cachedRead = unstable_cache(
      () => getCuratedArticles({ throwOnError: true }),
      [CURATED_ARTICLES_CACHE_KEY],
      {
        revalidate: CURATED_ARTICLES_REVALIDATE_SECONDS,
        tags: [CURATED_ARTICLES_CACHE_TAG, 'homepage-intel-feed'],
      },
    );
  }
  return cachedRead();
}

function rememberFailureUncached() {
  try {
    unstable_noStore();
  } catch {
    /* Non-Next callers still receive the uncached failure result. */
  }
}

export async function loadPublishedCuratedArticles() {
  try {
    const items = await readPublishedCuratedArticles();
    return {
      status: 'ok',
      items: selectCuratedResources(Array.isArray(items) ? items : []),
    };
  } catch (err) {
    const status = classifyCuratedArticlesError(err);
    console.warn(`[curated-articles] ${status}`);
    rememberFailureUncached();
    return { status, items: [] };
  }
}

export async function getCuratedArticleBySlug(slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return null;
  const result = await loadPublishedCuratedArticles();
  if (result.status !== 'ok') return null;
  return result.items.find((article) => article.slug === normalized) || null;
}

export function curatedArticleActionLabel(article) {
  const type = String(article?.resourceType || '').toLowerCase();
  const title = String(article?.title || '').toLowerCase();
  if (type.includes('guide') || title.includes('guide')) return 'Get the Guide';
  return 'Read Original';
}

export function presentCuratedArticle(article, blocks = []) {
  const path = article?.path || '';
  const editorial = resolveJournalEditorialImage({
    propertyImage: article?.propertyImage,
    coverImage: article?.coverImage,
    blocks,
    title: article?.title,
  });
  const shareImage = journalShareImage(editorial, path);
  const src = journalEditorialDisplaySrc(editorial, path);
  if (!shareImage || !src) {
    return {
      editorial: null,
      metadataImage: defaultOgImage,
      displayImage: article?.image?.src ? article.image : null,
      omitBlockIds: [],
    };
  }
  const size = readPublicEditorialSize(src);
  return {
    editorial,
    metadataImage: {
      url: shareImage.url,
      alt: shareImage.alt,
      ...(size ? { width: size.width, height: size.height } : {}),
    },
    displayImage: {
      src,
      alt: editorial.alt || '',
      width: size?.width,
      height: size?.height,
    },
    omitBlockIds: journalEditorialOmitBlockIds(editorial),
  };
}
