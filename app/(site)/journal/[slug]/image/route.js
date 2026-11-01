import { getCachedJournalPage, getJournalEntryById, getJournalEntryBySlug } from '@/lib/journal';
import { createJournalImageResponse, journalImageNotFound } from '@/lib/journal/journalImageResponse';
import { getCachedPageBlocks, getPageBlocks } from '@/lib/notion-blocks';
import { getJournalPage } from '@/lib/notion/journal.repo';
import {
  isJournalImageKey,
  readJournalCoverImage,
  readJournalPropertyImage,
  resolveJournalEditorialImage,
} from '@/lib/notion/journalImage';

export const revalidate = 300;

async function resolvePublishedEntry(slug) {
  const bySlug = await getJournalEntryBySlug(slug);
  if (bySlug) return bySlug;
  return getJournalEntryById(slug);
}

async function loadEditorial(entry, fresh) {
  const page = fresh ? await getJournalPage(entry.id) : await getCachedJournalPage(entry.id);
  const blocks = fresh ? await getPageBlocks(entry.id) : await getCachedPageBlocks(entry.id);
  return resolveJournalEditorialImage({
    propertyImage: page ? readJournalPropertyImage(page.properties) : entry?.propertyImage,
    coverImage: page ? readJournalCoverImage(page) : entry?.coverImage,
    blocks: blocks || [],
    title: entry?.title,
  });
}

export async function GET(request, { params }) {
  try {
    const { slug } = await params;
    if (!isJournalImageKey(slug)) return journalImageNotFound();
    const entry = await resolvePublishedEntry(slug);
    if (!entry?.id) return journalImageNotFound();

    let editorial = await loadEditorial(entry, false);
    let response = await createJournalImageResponse({
      editorial,
      requestUrl: request.url,
    });
    if (response.status === 404 && editorial?.hosting === 'notion-file') {
      editorial = await loadEditorial(entry, true);
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
