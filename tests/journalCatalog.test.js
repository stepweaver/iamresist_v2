import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLastKnownGoodForTests } from '@/lib/feeds/lastKnownGood';

const { getJournalEntries, store } = vi.hoisted(() => ({
  getJournalEntries: vi.fn(),
  store: new Map(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache: (cb, keyParts = []) => {
    const key = keyParts.join('|');
    return async () => {
      if (store.has(key)) return store.get(key);
      const value = await cb();
      store.set(key, value);
      return value;
    };
  },
  unstable_noStore: vi.fn(),
}));
vi.mock('@/lib/notion/journal.repo', () => ({
  getJournalEntries: (...args) => getJournalEntries(...args),
  isJournalConfigured: () => true,
  getJournalPage: vi.fn(),
}));

const older = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  slug: 'older-essay',
  title: 'Older Essay',
  date: '2026-01-01',
};
const newer = {
  id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  slug: 'newer-essay',
  title: 'Newer Essay',
  date: '2026-08-01',
};

afterEach(async () => {
  getJournalEntries.mockReset();
  store.clear();
  clearLastKnownGoodForTests();
  const catalog = await import('@/lib/journal/journalCatalog');
  catalog.clearJournalCatalogStateForTests();
});

describe('journal catalog availability', () => {
  it('does not cache a failed list as an empty journal, then recovers', async () => {
    getJournalEntries.mockRejectedValueOnce(new Error('notion 503'));
    const { getJournalIndexPayload } = await import('@/lib/journal');
    const { getJournalCatalog, clearJournalCatalogStateForTests } = await import('@/lib/journal/journalCatalog');

    const failed = await getJournalCatalog();
    expect(failed).toMatchObject({ status: 'unavailable', entries: [] });
    expect(store.size).toBe(0);
    await expect(getJournalIndexPayload()).resolves.toMatchObject({ listKind: 'api_error', entries: [] });

    clearJournalCatalogStateForTests();
    getJournalEntries.mockResolvedValueOnce([older]);
    const recovered = await getJournalCatalog();
    expect(recovered.status).toBe('ok');
    expect(recovered.entries).toEqual([older]);
    expect(store.size).toBe(1);
  });

  it('keeps an older essay available during an outage and does not call that miss a deletion', async () => {
    getJournalEntries.mockResolvedValueOnce([older]);
    const { resolvePublishedJournalEntry } = await import('@/lib/journal');
    const { getJournalCatalog, clearJournalCatalogStateForTests } = await import('@/lib/journal/journalCatalog');

    expect((await getJournalCatalog()).entries).toEqual([older]);
    store.clear();
    clearJournalCatalogStateForTests();
    getJournalEntries.mockRejectedValue(new Error('notion 503'));

    const duringOutage = await getJournalCatalog();
    expect(duringOutage.status).toBe('stale');
    expect(duringOutage.entries).toEqual([older]);

    const known = await resolvePublishedJournalEntry('older-essay');
    const unknown = await resolvePublishedJournalEntry('missing-essay');
    expect(known).toMatchObject({ availability: 'available', entry: older });
    expect(unknown.availability).toBe('unavailable');
    expect(unknown.entry).toBeNull();
    expect(getJournalEntries).toHaveBeenCalledTimes(2);
  });

  it('finds a newly published essay when the listing cache is stale, and 404s a real miss', async () => {
    getJournalEntries.mockResolvedValueOnce([older]);
    const { resolvePublishedJournalEntry } = await import('@/lib/journal');

    await resolvePublishedJournalEntry('older-essay');
    getJournalEntries.mockResolvedValueOnce([older, newer]);
    const published = await resolvePublishedJournalEntry('newer-essay');
    expect(published).toMatchObject({ availability: 'available', entry: newer });

    getJournalEntries.mockResolvedValueOnce([older, newer]);
    const missing = await resolvePublishedJournalEntry('not-a-real-essay');
    expect(missing).toMatchObject({ availability: 'missing', entry: null });
  });

  it('does not treat a failed refresh of a cache miss as confirmation the essay is gone', async () => {
    getJournalEntries.mockResolvedValueOnce([older]);
    const { resolvePublishedJournalEntry } = await import('@/lib/journal');

    await resolvePublishedJournalEntry('older-essay');
    getJournalEntries.mockRejectedValueOnce(new Error('notion 503'));
    const missed = await resolvePublishedJournalEntry('newer-essay');
    expect(missed.availability).toBe('unavailable');
  });

  it('forgets the last good catalog after a successful empty read', async () => {
    getJournalEntries.mockResolvedValueOnce([older]);
    const { getJournalCatalog, clearJournalCatalogStateForTests } = await import('@/lib/journal/journalCatalog');

    await getJournalCatalog();
    store.clear();
    clearJournalCatalogStateForTests();
    getJournalEntries.mockResolvedValueOnce([]);
    expect(await getJournalCatalog()).toMatchObject({ status: 'ok', entries: [] });

    store.clear();
    clearJournalCatalogStateForTests();
    getJournalEntries.mockRejectedValueOnce(new Error('notion 503'));
    expect(await getJournalCatalog()).toMatchObject({ status: 'unavailable', entries: [] });
  });
});
