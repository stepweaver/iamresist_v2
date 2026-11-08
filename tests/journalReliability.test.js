import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLastKnownGoodForTests } from '@/lib/feeds/lastKnownGood';

const { query, retrieve, pagesRetrieve, listBlocks, store } = vi.hoisted(() => ({
  query: vi.fn(),
  retrieve: vi.fn(),
  pagesRetrieve: vi.fn(),
  listBlocks: vi.fn(),
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
vi.mock('@/lib/notion/client', () => ({
  notion: {
    databases: {
      query: (...args) => query(...args),
      retrieve: (...args) => retrieve(...args),
    },
    pages: {
      retrieve: (...args) => pagesRetrieve(...args),
    },
    blocks: {
      children: {
        list: (...args) => listBlocks(...args),
      },
    },
  },
}));
vi.mock('@/lib/env/notion', () => ({
  notionEnv: {
    NOTION_API_KEY: 'test-key',
    NOTION_JOURNAL_DB_ID: '0123456789abcdef0123456789abcdef',
    NOTION_VOICES_DB_ID: '',
    NOTION_CURATED_ARTICLES_DB_ID: '',
    NOTION_CURATED_VIDEOS_DB_ID: '',
    NOTION_PROTEST_MUSIC_DB_ID: '',
    NOTION_BOOKS_DB_ID: '',
    NOTION_WEEKLY_BRIEFS_DB_ID: '',
    NOTION_ENTRIES_DATABASE_ID: '',
  },
}));

function notionPage(id, title) {
  return {
    id,
    created_time: '2026-04-01T00:00:00.000Z',
    last_edited_time: '2026-04-02T00:00:00.000Z',
    properties: {
      Name: { type: 'title', title: [{ plain_text: title }] },
      Date: { type: 'date', date: { start: '2026-04-01' } },
    },
  };
}

function notionFailure(message, code = 'service_unavailable', status = 503) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.body = { code, status, message };
  return err;
}

afterEach(async () => {
  query.mockReset();
  retrieve.mockReset();
  pagesRetrieve.mockReset();
  listBlocks.mockReset();
  store.clear();
  clearLastKnownGoodForTests();
  const repo = await import('@/lib/notion/journal.repo');
  repo.clearJournalPublishedFilterForTests();
  const blocks = await import('@/lib/notion-blocks');
  blocks.clearNotionBlockCacheStateForTests();
  vi.restoreAllMocks();
});

describe('journal published filter', () => {
  it('caches a status filter from the schema and does not guess select', async () => {
    retrieve.mockResolvedValue({ properties: { Status: { type: 'status' } } });
    query.mockResolvedValue({ results: [notionPage('page-1', 'One Essay')], has_more: false });
    const { getJournalEntries } = await import('@/lib/notion/journal.repo');

    const first = await getJournalEntries({ throwOnError: true });
    const second = await getJournalEntries({ throwOnError: true });

    expect(first.map((entry) => entry.slug)).toEqual(['one-essay']);
    expect(second).toHaveLength(1);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].filter).toEqual({
      property: 'Status',
      status: { equals: 'Published' },
    });
    expect(query.mock.calls[1][0].filter).toEqual({
      property: 'Status',
      status: { equals: 'Published' },
    });
  });

  it('caches a select filter only after the schema says the property is select', async () => {
    retrieve.mockResolvedValue({ properties: { Status: { type: 'select' } } });
    query.mockResolvedValue({ results: [], has_more: false });
    const { getJournalEntries } = await import('@/lib/notion/journal.repo');

    expect(await getJournalEntries({ throwOnError: true })).toEqual([]);
    await getJournalEntries({ throwOnError: true });

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].filter).toEqual({
      property: 'Status',
      select: { equals: 'Published' },
    });
  });

  it('does not cache a schema failure, and accepts a status property when select would be invalid', async () => {
    retrieve.mockRejectedValue(notionFailure('schema down'));
    query.mockImplementation(async ({ filter }) => {
      if (filter.select) throw notionFailure('Status is expected to be status', 'validation_error', 400);
      return { results: [notionPage('page-2', 'Kept Essay')], has_more: false };
    });
    const { getJournalEntries } = await import('@/lib/notion/journal.repo');

    const entries = await getJournalEntries({ throwOnError: true });
    await getJournalEntries({ throwOnError: true });

    expect(entries.map((entry) => entry.title)).toEqual(['Kept Essay']);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].filter.status).toEqual({ equals: 'Published' });
    expect(query.mock.calls.every((call) => !call[0].filter.select)).toBe(true);
  });

  it('retries with select when a status filter is rejected, then remembers that verified filter', async () => {
    retrieve.mockRejectedValue(notionFailure('schema down'));
    query.mockImplementation(async ({ filter }) => {
      if (filter.status) throw notionFailure('Status is expected to be select', 'validation_error', 400);
      return { results: [], has_more: false };
    });
    const { getJournalEntries } = await import('@/lib/notion/journal.repo');

    expect(await getJournalEntries({ throwOnError: true })).toEqual([]);
    await getJournalEntries({ throwOnError: true });

    expect(query.mock.calls[0][0].filter.status).toEqual({ equals: 'Published' });
    expect(query.mock.calls[1][0].filter.select).toEqual({ equals: 'Published' });
    expect(query.mock.calls[2][0].filter.select).toEqual({ equals: 'Published' });
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('does not remember a fallback when schema and the published query both fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const leaked = 'down X-Amz-Signature=leakvalue https://prod-files-secure.s3.us-west-2.amazonaws.com/a.png';
    retrieve.mockRejectedValue(notionFailure('schema down'));
    query.mockRejectedValue(notionFailure(leaked));
    const { getJournalEntries, sanitizeJournalDiagnostic } = await import('@/lib/notion/journal.repo');

    await expect(getJournalEntries({ throwOnError: true })).rejects.toThrow('[url]');
    await expect(getJournalEntries()).resolves.toEqual([]);
    await expect(getJournalEntries({ throwOnError: true })).rejects.toThrow('[signature]');

    expect(retrieve.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(query.mock.calls[0][0].filter.status).toEqual({ equals: 'Published' });
    expect(sanitizeJournalDiagnostic(notionFailure('token secret_abc')).message).toBe('token [secret]');
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('X-Amz-Signature=leakvalue');
    expect(logged).not.toContain('prod-files-secure');
    expect(logged).not.toContain('secret_abc');
  });

  it('does not cache an unexpected Status type as a select filter', async () => {
    retrieve.mockResolvedValue({ properties: { Status: { type: 'rich_text' } } });
    const { getJournalEntries } = await import('@/lib/notion/journal.repo');

    await expect(getJournalEntries({ throwOnError: true })).rejects.toThrow(/Status property/);
    await expect(getJournalEntries({ throwOnError: true })).rejects.toThrow(/Status property/);

    expect(query).not.toHaveBeenCalled();
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('returns null for a missing page and throws for a page read that failed', async () => {
    const { getJournalPage } = await import('@/lib/notion/journal.repo');
    pagesRetrieve.mockRejectedValueOnce(notionFailure('missing', 'object_not_found', 404));
    await expect(getJournalPage('page-1', { throwOnError: true })).resolves.toBeNull();

    pagesRetrieve.mockRejectedValueOnce(notionFailure('timeout'));
    await expect(getJournalPage('page-1')).resolves.toBeNull();
    pagesRetrieve.mockRejectedValueOnce(notionFailure('timeout'));
    await expect(getJournalPage('page-1', { throwOnError: true })).rejects.toThrow('timeout');
  });
});

describe('journal block cache', () => {
  it('does not store a failed block read, and keeps the last real body', async () => {
    const paragraph = {
      id: 'block-1',
      type: 'paragraph',
      paragraph: { rich_text: [{ plain_text: 'The argument.' }] },
    };
    listBlocks.mockResolvedValueOnce({ results: [paragraph], has_more: false });
    const { readJournalEntryBlocks } = await import('@/lib/journal');
    const { clearNotionBlockCacheStateForTests } = await import('@/lib/notion-blocks');

    const first = await readJournalEntryBlocks('page-1');
    expect(first).toMatchObject({ status: 'ok', blocks: [paragraph] });
    expect(store.size).toBe(1);

    store.clear();
    clearNotionBlockCacheStateForTests();
    listBlocks.mockRejectedValue(notionFailure('blocks down'));
    const duringOutage = await readJournalEntryBlocks('page-1');
    expect(duringOutage.status).toBe('ok');
    expect(duringOutage.blocks).toEqual([paragraph]);
    expect(duringOutage.stale).toBe(true);
    expect(store.size).toBe(0);

    const swallowed = await import('@/lib/notion-blocks');
    clearNotionBlockCacheStateForTests();
    await expect(swallowed.getCachedPageBlocks('page-2')).resolves.toEqual([]);
    expect([...store.keys()].some((key) => String(key).includes('page-2'))).toBe(false);
  });
});
