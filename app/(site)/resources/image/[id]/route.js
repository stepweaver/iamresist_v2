import { createJournalImageResponse, journalImageNotFound } from '@/lib/journal/journalImageResponse';
import { getCuratedResourcePage } from '@/lib/notion/curatedArticles.repo';
import { isJournalImageKey } from '@/lib/notion/journalImage';

export const revalidate = 300;

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!isJournalImageKey(id)) return journalImageNotFound();
    const loaded = await getCuratedResourcePage(id);
    if (!loaded?.editorial) return journalImageNotFound();
    return createJournalImageResponse({
      editorial: loaded.editorial,
      requestUrl: request.url,
    });
  } catch {
    return journalImageNotFound();
  }
}
