import { getCuratedArticleBySlug, presentCuratedArticle } from '@/lib/curated/articles';
import { createJournalImageResponse, journalImageNotFound } from '@/lib/journal/journalImageResponse';
import { getCachedPageBlocks, getPageBlocks } from '@/lib/notion-blocks';
import { getCuratedResourcePage } from '@/lib/notion/curatedArticles.repo';
import { isJournalImageKey } from '@/lib/notion/journalImage';

export const revalidate = 300;

async function editorialFor(article, fresh) {
  if (fresh) {
    const loaded = await getCuratedResourcePage(article.id);
    if (loaded?.editorial?.url) return loaded.editorial;
  }
  const hasFieldImage = Boolean(article.propertyImage?.url || article.coverImage?.url);
  const blocks = hasFieldImage
    ? []
    : fresh
      ? await getPageBlocks(article.id)
      : await getCachedPageBlocks(article.id);
  return presentCuratedArticle(article, blocks).editorial;
}

export async function GET(request, { params }) {
  try {
    const { slug } = await params;
    if (!isJournalImageKey(slug)) return journalImageNotFound();
    const article = await getCuratedArticleBySlug(slug);
    if (!article?.id) return journalImageNotFound();

    let editorial = await editorialFor(article, false);
    let response = await createJournalImageResponse({
      editorial,
      requestUrl: request.url,
    });
    if (response.status === 404 && editorial?.hosting === 'notion-file') {
      editorial = await editorialFor(article, true);
      response = await createJournalImageResponse({
        editorial,
        requestUrl: request.url,
      });
    }
    return response;
  } catch {
    return journalImageNotFound();
  }
}
