import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const retrieve = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/notion/client', () => ({
  notion: {
    databases: {
      query: (...args) => query(...args),
      retrieve: (...args) => retrieve(...args),
    },
  },
}));
vi.mock('@/lib/env/notion', () => ({
  notionEnv: {
    NOTION_API_KEY: 'test-key',
    NOTION_CURATED_ARTICLES_DB_ID: 'articles-db',
    NOTION_JOURNAL_DB_ID: '',
    NOTION_VOICES_DB_ID: '',
    NOTION_BOOKS_DB_ID: '',
    NOTION_CURATED_VIDEOS_DB_ID: '',
    NOTION_PROTEST_MUSIC_DB_ID: '',
    NOTION_WEEKLY_BRIEFS_DB_ID: '',
    NOTION_ENTRIES_DATABASE_ID: '',
  },
}));

function publishedPage(id, status = 'Published') {
  return {
    id,
    created_time: '2026-10-01T00:00:00.000Z',
    properties: {
      Title: { type: 'title', title: [{ plain_text: `Resource ${id}` }] },
      URL: { type: 'url', url: `https://example.com/${id}` },
      Status: { type: 'status', status: { name: status } },
      Source: { type: 'rich_text', rich_text: [{ plain_text: 'Example' }] },
    },
  };
}

describe('curated article queries', () => {
  beforeEach(async () => {
    query.mockReset();
    retrieve.mockReset();
    const { clearCuratedArticlesCacheForTests } = await import('@/lib/notion/curatedArticles.repo');
    clearCuratedArticlesCacheForTests();
  });

  it('queries a status property when the database uses one and drops drafts', async () => {
    retrieve.mockResolvedValue({
      properties: {
        Status: { type: 'status', status: { options: [{ name: 'Published' }] } },
        'Published At': { type: 'date' },
      },
    });
    query.mockResolvedValue({
      results: [publishedPage('kept'), publishedPage('draft', 'Draft')],
      next_cursor: null,
      has_more: false,
    });

    const { getCuratedArticles } = await import('@/lib/notion/curatedArticles.repo');
    const items = await getCuratedArticles({ limit: 30, throwOnError: true });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { property: 'Status', status: { equals: 'Published' } },
      }),
    );
    expect(items.map((item) => item.id)).toEqual(['kept']);
  });

  it('retries with a status filter when a select filter is rejected', async () => {
    retrieve.mockResolvedValue({ properties: {} });
    query
      .mockRejectedValueOnce({ code: 'validation_error', message: 'property type mismatch' })
      .mockResolvedValueOnce({
        results: [publishedPage('kept')],
        next_cursor: null,
        has_more: false,
      });

    const { getCuratedArticles } = await import('@/lib/notion/curatedArticles.repo');
    const items = await getCuratedArticles({ limit: 10, throwOnError: true });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        filter: { property: 'Status', status: { equals: 'Published' } },
      }),
    );
    expect(items).toHaveLength(1);
  });

  it('does not treat a missing database as an empty published directory when errors are requested', async () => {
    retrieve.mockRejectedValue({ code: 'object_not_found', message: 'missing' });
    const { getCuratedArticles } = await import('@/lib/notion/curatedArticles.repo');
    await expect(getCuratedArticles({ throwOnError: true })).rejects.toMatchObject({
      code: 'object_not_found',
      reason: 'permission_denied',
    });
    expect(query).not.toHaveBeenCalled();
    retrieve.mockRejectedValue({ code: 'object_not_found', message: 'missing' });
    expect(await getCuratedArticles()).toEqual([]);
  });
});
