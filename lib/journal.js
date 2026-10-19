import 'server-only';
import pLimit from 'p-limit';
import { unstable_cache } from 'next/cache';
import {
  compareJournalEntries,
  journalDisplayExcerpt,
  journalLeadExcerpt,
  journalPageTouchedAfterPublish,
} from '@/components/journal/journalFormat';
import { journalBodyHash } from '@/lib/journalBody';
import { resolveBodyEditedTimes } from '@/lib/journalBodyStore';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import {
  getJournalEntries as repoGetJournalEntries,
  fetchJournalFirstPage,
} from '@/lib/notion/journal.repo';

const REVALIDATE = 300;

function notionIdsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = String(a).replace(/-/g, '');
  const cb = String(b).replace(/-/g, '');
  return ca.length === 32 && cb.length === 32 && ca === cb;
}

async function fetchAllJournalEntries() {
  const result = await repoGetJournalEntries();
  return Array.isArray(result) ? result : result?.items ?? [];
}

async function fetchJournalIndexPayload(limit) {
  const snapshot = await fetchJournalFirstPage(limit);
  let listKind = 'ok';

  if (!snapshot.configured) {
    listKind = 'unconfigured';
  } else if (snapshot.apiError) {
    listKind = 'api_error';
  } else if (!snapshot.items.length) {
    listKind = 'empty';
  }

  return {
    entries: snapshot.items,
    listKind,
    apiError: snapshot.apiError,
  };
}

function getCachedJournalList() {
  return unstable_cache(fetchAllJournalEntries, ['journal-list-full'], {
    revalidate: REVALIDATE,
    tags: ['journal'],
  })();
}

/** Cached index payload: entries + why the list might be empty (for accurate UI copy). */
export function getJournalIndexPayload(limit = 15) {
  return unstable_cache(
    () => fetchJournalIndexPayload(limit),
    ['journal-initial', String(limit)],
    { revalidate: REVALIDATE, tags: ['journal'] },
  )();
}

export async function getAllJournalEntries() {
  return getCachedJournalList();
}

export async function getJournalEntryById(entryId) {
  const list = await getCachedJournalList();
  return list.find((e) => notionIdsMatch(e.id, entryId)) ?? null;
}

export async function getJournalEntryBySlug(slug) {
  const list = await getCachedJournalList();
  return (
    list.find((e) => e.slug === slug || notionIdsMatch(e.id, slug)) ?? null
  );
}

async function withBodyEditTimes(entries) {
  const limit = pLimit(3);
  const touched = (entries || []).filter(
    (entry) => entry?.id && journalPageTouchedAfterPublish(entry),
  );
  const hashed = (
    await Promise.all(
      touched.map((entry) =>
        limit(async () => {
          const blocks = await getCachedPageBlocks(entry.id);
          if (!Array.isArray(blocks) || blocks.length === 0) return null;
          return { id: entry.id, hash: journalBodyHash(blocks) };
        }),
      ),
    )
  ).filter(Boolean);
  const editedAt = await resolveBodyEditedTimes(hashed);
  return (entries || []).map((entry) => {
    const bodyEditedTime = editedAt.get(entry?.id);
    return bodyEditedTime ? { ...entry, bodyEditedTime } : entry;
  });
}

export async function journalEntryBodyEditedTime(entry, blocks) {
  if (!entry?.id || !journalPageTouchedAfterPublish(entry)) return null;
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const editedAt = await resolveBodyEditedTimes([
    { id: entry.id, hash: journalBodyHash(blocks) },
  ]);
  return editedAt.get(entry.id) || null;
}

/** Publication order. Updated appears only when the body text changed. */
export async function presentJournalEntries(entries) {
  const withBody = await withBodyEditTimes(entries);
  return [...withBody].sort(compareJournalEntries);
}

export async function getRecentJournalEntries(limit = 5) {
  const presented = await presentJournalEntries(await getCachedJournalList());
  return presented.slice(0, limit);
}

/** Published essays for the homepage, ordered by publication date. Does not load page bodies. */
export async function getHomepageJournalEntries() {
  try {
    const list = await getCachedJournalList();
    return [...(Array.isArray(list) ? list : [])].sort(compareJournalEntries);
  } catch {
    return [];
  }
}

/** Prefer a written Summary. Otherwise use one cached body excerpt for the featured essay. */
export async function featuredEssayExcerpt(entry) {
  const summary = String(entry?.summary || '').replace(/\s+/g, ' ').trim();
  if (summary) return summary;
  if (!entry?.id) return journalDisplayExcerpt(entry);
  try {
    const blocks = await getCachedPageBlocks(entry.id);
    return journalDisplayExcerpt(entry, journalLeadExcerpt(blocks));
  } catch {
    return journalDisplayExcerpt(entry);
  }
}
