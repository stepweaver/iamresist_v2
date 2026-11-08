import { unstable_noStore } from 'next/cache';
import { getCachedJournalPage, resolvePublishedJournalEntry } from '@/lib/journal';
import {
  createJournalImageResponse,
  journalImageNotFound,
  journalImageResult,
  journalImageUnavailable,
} from '@/lib/journal/journalImageResponse';
import { getPageBlocks, loadCachedPageBlocks } from '@/lib/notion-blocks';
import { getJournalPage } from '@/lib/notion/journal.repo';
import {
  isJournalImageKey,
  readJournalCoverImage,
  readJournalPropertyImage,
  resolveJournalEditorialImage,
} from '@/lib/notion/journalImage';

export const revalidate = 300;

const RETRYABLE_IMAGE = new Set(['missing', 'expired', 'unavailable', 'invalid']);

function editorialFrom(entry, page, blocks) {
  return resolveJournalEditorialImage({
    propertyImage: page ? readJournalPropertyImage(page.properties) : entry?.propertyImage,
    coverImage: page ? readJournalCoverImage(page) : entry?.coverImage,
    blocks: blocks || [],
    title: entry?.title,
  });
}

async function loadEditorial(entry, fresh) {
  try {
    const page = fresh
      ? await getJournalPage(entry.id, { throwOnError: true })
      : await getCachedJournalPage(entry.id);
    const blocks = fresh
      ? await getPageBlocks(entry.id, 5, { throwOnError: true })
      : await loadCachedPageBlocks(entry.id);
    return { editorial: editorialFrom(entry, page, blocks), unavailable: false };
  } catch {
    if (!fresh) return { editorial: editorialFrom(entry, null, []), unavailable: false, stale: true };
    console.warn('[journal] image source refresh failed');
    return { editorial: null, unavailable: true };
  }
}

function imageSucceeded(response) {
  return response.status === 200 || response.status === 307;
}

export async function GET(request, { params }) {
  try {
    const { slug } = await params;
    if (!isJournalImageKey(slug)) return journalImageNotFound();

    const resolved = await resolvePublishedJournalEntry(slug);
    if (resolved.availability === 'unavailable') {
      unstable_noStore();
      return journalImageUnavailable();
    }
    if (!resolved.entry?.id) return journalImageNotFound();

    const first = await loadEditorial(resolved.entry, false);
    let response = await createJournalImageResponse({
      editorial: first.editorial,
      requestUrl: request.url,
    });
    if (imageSucceeded(response)) return response;

    const outcome = journalImageResult(response);
    if (!first.stale && !RETRYABLE_IMAGE.has(outcome)) {
      unstable_noStore();
      return response;
    }

    const second = await loadEditorial(resolved.entry, true);
    if (second.unavailable) {
      unstable_noStore();
      return journalImageUnavailable();
    }
    response = await createJournalImageResponse({
      editorial: second.editorial,
      requestUrl: request.url,
    });
    if (imageSucceeded(response)) return response;

    unstable_noStore();
    const refreshed = journalImageResult(response);
    if (refreshed === 'expired' || refreshed === 'unavailable') return journalImageUnavailable();
    return journalImageNotFound();
  } catch {
    console.warn('[journal] image route failed');
    try {
      unstable_noStore();
    } catch {
      /* The 503 response is still uncacheable via Cache-Control. */
    }
    return journalImageUnavailable();
  }
}
