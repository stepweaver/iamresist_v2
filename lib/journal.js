import 'server-only';
import pLimit from 'p-limit';
import { unstable_cache, unstable_noStore } from 'next/cache';
import {
  compareJournalEntries,
  journalDisplayExcerpt,
  journalLeadExcerpt,
  journalLeadPresentation,
  journalPageTouchedAfterPublish,
  journalPublishedOn,
  resolveListingImage,
} from '@/components/journal/journalFormat';
import { journalBodyHash, latestRevisedBlockTime } from '@/lib/journalBody';
import { resolveBodyEditedTimes } from '@/lib/journalBodyStore';
import { getCachedPageBlocks, loadCachedPageBlocks } from '@/lib/notion-blocks';
import { isUpstreamFailure } from '@/lib/feeds/upstreamResult';
import {
  forgetLastKnownGood,
  hydrateLastKnownGood,
  recallLastKnownGood,
  rememberLastKnownGood,
} from '@/lib/feeds/lastKnownGood';
import {
  JOURNAL_CATALOG_REVALIDATE_SECONDS,
  getJournalCatalog,
  resolvePublishedJournalEntry,
} from '@/lib/journal/journalCatalog';
import { getJournalPage } from '@/lib/notion/journal.repo';

const REVALIDATE = JOURNAL_CATALOG_REVALIDATE_SECONDS;

export { resolvePublishedJournalEntry };

async function getCachedJournalList() {
  const catalog = await getJournalCatalog();
  if (catalog.status === 'unavailable') return [];
  return catalog.entries;
}

/** Index payload. An upstream failure is not cached as an empty journal. */
export async function getJournalIndexPayload(limit = 15) {
  const catalog = await getJournalCatalog();
  if (catalog.status === 'unconfigured') {
    return { entries: [], listKind: 'unconfigured', apiError: null };
  }
  if (catalog.status === 'unavailable') {
    try {
      unstable_noStore();
    } catch {
      /* The page still receives listKind api_error. */
    }
    return { entries: [], listKind: 'api_error', apiError: 'Notion request failed' };
  }
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  return {
    entries: entries.slice(0, limit),
    listKind: entries.length ? 'ok' : 'empty',
    apiError: null,
  };
}

export async function getAllJournalEntries() {
  return getCachedJournalList();
}

export function getCachedJournalPage(pageId) {
  if (!pageId) return Promise.resolve(null);
  return unstable_cache(
    () => getJournalPage(pageId, { throwOnError: true }),
    ['journal-page-v2', String(pageId)],
    { revalidate: REVALIDATE, tags: ['journal'] },
  )();
}

function blockCacheKey(pageId) {
  return `journal-blocks:${pageId}`;
}

/**
 * Essay body. A successful empty body is real. A failed read keeps the last
 * body when one exists, and otherwise stays uncached so the article is not
 * stored without its text.
 */
export async function readJournalEntryBlocks(pageId) {
  if (!pageId) return { status: 'ok', blocks: [] };
  const key = blockCacheKey(pageId);
  try {
    const blocks = await loadCachedPageBlocks(pageId);
    const list = Array.isArray(blocks) ? blocks : [];
    if (list.length) rememberLastKnownGood(key, list);
    else forgetLastKnownGood(key);
    return { status: 'ok', blocks: list };
  } catch (err) {
    if (!isUpstreamFailure(err)) throw err;
    await hydrateLastKnownGood(key);
    const snap = recallLastKnownGood(key);
    if (Array.isArray(snap) && snap.length > 0) {
      console.warn('[journal] serving a cached essay body during a Notion outage');
      return { status: 'ok', blocks: snap, stale: true };
    }
    try {
      unstable_noStore();
    } catch {
      /* The caller still sees status unavailable. */
    }
    console.warn('[journal] essay body unavailable');
    return { status: 'unavailable', blocks: [] };
  }
}

export async function getJournalEntryById(entryId) {
  const resolved = await resolvePublishedJournalEntry(entryId);
  if (resolved.availability === 'unavailable') throw unavailableJournalEntry();
  return resolved.entry;
}

export async function getJournalEntryBySlug(slug) {
  const resolved = await resolvePublishedJournalEntry(slug);
  if (resolved.availability === 'unavailable') throw unavailableJournalEntry();
  return resolved.entry;
}

function unavailableJournalEntry() {
  const err = new Error('journal_catalog_unavailable');
  err.code = 'UPSTREAM_FAILED';
  return err;
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
          return bodyObservation(entry, blocks);
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

function bodyObservation(entry, blocks) {
  if (!entry?.id || !Array.isArray(blocks) || blocks.length === 0) return null;
  return {
    id: entry.id,
    hash: journalBodyHash(blocks),
    observedEditTime: latestRevisedBlockTime(blocks, journalPublishedOn(entry)),
  };
}

export async function journalEntryBodyEditedTime(entry, blocks) {
  if (!entry?.id || !journalPageTouchedAfterPublish(entry)) return null;
  const observation = bodyObservation(entry, blocks);
  if (!observation) return null;
  const editedAt = await resolveBodyEditedTimes([observation]);
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

/**
 * Published essays for the homepage, ordered by publication date.
 * Does not load page bodies. A total catalog failure throws so a homepage
 * revalidation does not replace a good essay list with an empty one.
 * Last-known essays are returned instead of throwing when they are still available.
 */
export async function getHomepageJournalEntries() {
  const catalog = await getJournalCatalog();
  if (catalog.status === 'unavailable') {
    try {
      unstable_noStore();
    } catch {
      /* JournalSection still treats the rejection as an unavailable section. */
    }
    throw unavailableJournalEntry();
  }
  return [...(Array.isArray(catalog.entries) ? catalog.entries : [])].sort(compareJournalEntries);
}

/** Property and cover images stay on the entry. Body art is loaded only when requested. */
export function resolveJournalListingImage(entry, options) {
  return resolveListingImage(entry, async () => getCachedPageBlocks(entry?.id), options);
}

/** Deck and reading time for one lead essay. Uses the cached body at most once. */
export async function loadJournalLeadCopy(entry) {
  if (!entry) return { excerpt: '', readingMinutes: 0 };
  return journalLeadPresentation(entry, async () => getCachedPageBlocks(entry.id));
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
