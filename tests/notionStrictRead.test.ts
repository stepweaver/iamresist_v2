import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache: (cb: () => Promise<unknown>) => cb,
}));
vi.mock('@/lib/notion/client', () => ({
  notion: {
    databases: {
      query: (...args: unknown[]) => query(...args),
    },
  },
}));
vi.mock('@/lib/env/notion', () => ({
  notionEnv: {
    NOTION_API_KEY: 'test-key',
    NOTION_VOICES_DB_ID: 'voices-db',
    NOTION_CURATED_ARTICLES_DB_ID: 'articles-db',
    NOTION_CURATED_VIDEOS_DB_ID: '0123456789abcdef0123456789abcdef',
    NOTION_PROTEST_MUSIC_DB_ID: '',
    NOTION_JOURNAL_DB_ID: '',
    NOTION_BOOKS_DB_ID: '',
    NOTION_WEEKLY_BRIEFS_DB_ID: '',
    NOTION_ENTRIES_DATABASE_ID: '',
  },
}));

afterEach(() => {
  query.mockReset();
});

describe('Notion repository failure versus an empty directory', () => {
  it('returns an empty voice list for a successful query and throws when asked to surface an API failure', async () => {
    const { getAllVoices, getEnabledVoices } = await import('@/lib/notion/voices.repo');
    query.mockResolvedValueOnce({ results: [], next_cursor: null });
    expect(await getAllVoices({ throwOnError: true })).toEqual([]);

    query.mockRejectedValueOnce(new Error('notion 503'));
    expect(await getAllVoices()).toEqual([]);
    query.mockRejectedValueOnce(new Error('notion 503'));
    await expect(getAllVoices({ throwOnError: true })).rejects.toThrow('notion 503');

    query.mockRejectedValueOnce(new Error('notion 503'));
    expect(await getEnabledVoices()).toEqual([]);
  });

  it('does not cache a failed voice directory lookup', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: () => Promise<unknown>, keyParts: string[]) => {
        const key = keyParts.join('|');
        return async () => {
          if (store.has(key)) return store.get(key);
          const value = await cb();
          store.set(key, value);
          return value;
        };
      },
    }));
    query.mockRejectedValue(new Error('notion 503'));

    const { getAllVoicesCached } = await import('@/lib/notion/voices.repo');
    await expect(getAllVoicesCached()).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
    await expect(getAllVoicesCached()).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
    expect(store.size).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns no curated videos or articles when that database is not configured, and throws on an API failure when requested', async () => {
    const { getVideos } = await import('@/lib/notion/videos.repo');
    const { getCuratedArticles } = await import('@/lib/notion/curatedArticles.repo');

    query.mockResolvedValueOnce({ results: [], next_cursor: null });
    expect(await getVideos({ limit: 8, throwOnError: true })).toEqual([]);

    query.mockRejectedValueOnce(new Error('notion 503'));
    expect(await getVideos({ limit: 8 })).toEqual([]);
    query.mockRejectedValueOnce(new Error('notion 503'));
    await expect(getVideos({ limit: 8, throwOnError: true })).rejects.toThrow('notion 503');

    query.mockResolvedValueOnce({ results: [], next_cursor: null });
    expect(await getCuratedArticles({ limit: 30, throwOnError: true })).toEqual([]);
    query.mockRejectedValueOnce(new Error('notion 503'));
    expect(await getCuratedArticles({ limit: 30 })).toEqual([]);
    query.mockRejectedValueOnce(new Error('notion 503'));
    await expect(getCuratedArticles({ limit: 30, throwOnError: true })).rejects.toThrow('notion 503');
  });
});
