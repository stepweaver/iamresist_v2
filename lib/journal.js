import 'server-only';
import { unstable_cache } from 'next/cache';
import { getJournalEntries as repoGetJournalEntries } from '@/lib/notion/journal.repo';

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

async function fetchInitialJournalEntries(limit) {
  const result = await repoGetJournalEntries({ pageSize: limit });
  return result?.items ?? (Array.isArray(result) ? result : []);
}

function getCachedJournalList() {
  return unstable_cache(fetchAllJournalEntries, ['journal-list-full'], {
    revalidate: REVALIDATE,
  })();
}

export function getInitialJournalEntries(limit = 15) {
  return unstable_cache(
    () => fetchInitialJournalEntries(limit),
    ['journal-initial', String(limit)],
    { revalidate: REVALIDATE },
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
