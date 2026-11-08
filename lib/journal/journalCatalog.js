import 'server-only';

import { unstable_cache, unstable_noStore } from 'next/cache';
import {
  assertUpstreamAvailable,
  noteUpstreamFailure,
} from '@/lib/feeds/sharedFailureBackoff';
import {
  createFailureCooldown,
  isUpstreamFailure,
  upstreamFailure,
} from '@/lib/feeds/upstreamResult';
import {
  forgetLastKnownGood,
  hydrateLastKnownGood,
  recallLastKnownGood,
  rememberLastKnownGood,
} from '@/lib/feeds/lastKnownGood';
import {
  getJournalEntries,
  isJournalConfigured,
} from '@/lib/notion/journal.repo';

/** Successful published lists stay cached for five minutes. Failures are not stored. */
export const JOURNAL_CATALOG_REVALIDATE_SECONDS = 300;
export const JOURNAL_CATALOG_CACHE_KEY = 'journal-catalog-v2';
const JOURNAL_CATALOG_TAG = 'journal';
const FRESH_LOOKUP_SHARE_MS = 5_000;

const catalogCooldown = createFailureCooldown();
let freshLookup = null;
let freshLookupAt = 0;

function rememberFailureUncached() {
  try {
    unstable_noStore();
  } catch {
    /* Tests and scripts still receive the uncached failure result. */
  }
}

export function clearJournalCatalogStateForTests() {
  catalogCooldown.clear();
  freshLookup = null;
  freshLookupAt = 0;
}

function notionIdsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = String(a).replace(/-/g, '');
  const cb = String(b).replace(/-/g, '');
  return ca.length === 32 && cb.length === 32 && ca === cb;
}

export function findJournalEntry(entries, slugOrId) {
  const wanted = String(slugOrId || '').trim();
  if (!wanted || !Array.isArray(entries)) return null;
  return (
    entries.find((entry) => entry?.slug === wanted || notionIdsMatch(entry?.id, wanted)) || null
  );
}

function asEntryList(result) {
  if (Array.isArray(result)) return result;
  return result?.items ?? [];
}

async function loadJournalCatalog() {
  await assertUpstreamAvailable(catalogCooldown, JOURNAL_CATALOG_CACHE_KEY);
  try {
    const entries = asEntryList(await getJournalEntries({ throwOnError: true }));
    catalogCooldown.clear();
    if (entries.length) rememberLastKnownGood(JOURNAL_CATALOG_CACHE_KEY, entries);
    else forgetLastKnownGood(JOURNAL_CATALOG_CACHE_KEY);
    return entries;
  } catch (err) {
    if (isUpstreamFailure(err)) throw err;
    await noteUpstreamFailure(catalogCooldown, JOURNAL_CATALOG_CACHE_KEY, { tags: [JOURNAL_CATALOG_TAG] });
    throw upstreamFailure(JOURNAL_CATALOG_CACHE_KEY);
  }
}

function readCachedCatalog() {
  return unstable_cache(loadJournalCatalog, [JOURNAL_CATALOG_CACHE_KEY], {
    revalidate: JOURNAL_CATALOG_REVALIDATE_SECONDS,
    tags: [JOURNAL_CATALOG_TAG],
  })();
}

/**
 * Published catalog.
 * status ok: Notion confirmed this list, including a real empty journal.
 * status stale: Notion failed and the last confirmed list is still available.
 * status unavailable: Notion failed and there is no confirmed list to keep.
 * status unconfigured: the integration or database id is missing.
 */
export async function getJournalCatalog() {
  if (!isJournalConfigured()) {
    return { status: 'unconfigured', entries: [], fresh: false };
  }

  try {
    const entries = asEntryList(await readCachedCatalog());
    return { status: 'ok', entries, fresh: true };
  } catch (err) {
    if (!isUpstreamFailure(err)) throw err;
    await hydrateLastKnownGood(JOURNAL_CATALOG_CACHE_KEY);
    const snap = recallLastKnownGood(JOURNAL_CATALOG_CACHE_KEY);
    if (Array.isArray(snap) && snap.length > 0) {
      console.warn('[journal] serving the last published catalog during a Notion outage');
      return { status: 'stale', entries: snap, fresh: false };
    }
    rememberFailureUncached();
    console.warn('[journal] published catalog unavailable');
    return { status: 'unavailable', entries: [], fresh: false };
  }
}

async function readFreshPublishedEntries() {
  const now = Date.now();
  if (freshLookup && now - freshLookupAt < FRESH_LOOKUP_SHARE_MS) return freshLookup;
  freshLookupAt = now;
  freshLookup = getJournalEntries({ throwOnError: true })
    .then((result) => {
      const entries = asEntryList(result);
      if (entries.length) rememberLastKnownGood(JOURNAL_CATALOG_CACHE_KEY, entries);
      else forgetLastKnownGood(JOURNAL_CATALOG_CACHE_KEY);
      return entries;
    })
    .catch((err) => {
      freshLookup = null;
      freshLookupAt = 0;
      throw err;
    });
  return freshLookup;
}

/**
 * A cached list miss is checked against Notion before it becomes a 404.
 * A failed read is unavailable, including when an older cached essay is not
 * in memory: absence is only confirmed by a successful published query.
 */
export async function resolvePublishedJournalEntry(slugOrId) {
  const catalog = await getJournalCatalog();
  const cached = findJournalEntry(catalog.entries, slugOrId);

  if (catalog.status === 'unconfigured') {
    return { entry: null, availability: 'missing', catalog };
  }

  if (catalog.status !== 'ok') {
    if (cached) return { entry: cached, availability: 'available', catalog };
    return { entry: null, availability: 'unavailable', catalog };
  }

  if (cached) return { entry: cached, availability: 'available', catalog };

  try {
    const fresh = await readFreshPublishedEntries();
    const found = findJournalEntry(fresh, slugOrId);
    if (found) return { entry: found, availability: 'available', catalog };
    return { entry: null, availability: 'missing', catalog };
  } catch {
    console.warn('[journal] fresh published lookup failed; not treating the miss as a deletion');
    return { entry: null, availability: 'unavailable', catalog };
  }
}
