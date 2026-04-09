import 'server-only';
import { unstable_cache } from 'next/cache';
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

export async function getRecentJournalEntries(limit = 5) {
  const list = await getCachedJournalList();
  return list.slice(0, limit);
}
