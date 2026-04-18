import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('homepage voices pool', () => {
  it('returns voice posts in reverse publish order without commentary scoring gates', async () => {
    vi.resetModules();

    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: unknown) => cb,
    }));

    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: vi.fn(async () => [
        {
          id: 'voice-a',
          slug: 'voice-a',
          title: 'Voice A',
          homeUrl: null,
          platform: 'Substack',
          feedUrl: 'https://a.test/feed',
        },
        {
          id: 'voice-b',
          slug: 'voice-b',
          title: 'Voice B',
          homeUrl: null,
          platform: 'Substack',
          feedUrl: 'https://b.test/feed',
        },
      ]),
      getVoiceBySlug: vi.fn(),
    }));

    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItems: vi.fn(async (feedUrl: string) => {
        if (feedUrl.includes('a.test')) {
          return [
            {
              id: 'voice-a-old',
              sourceId: 'voice-a-old',
              title: 'Older post',
              url: 'https://voice-a.test/older',
              publishedAt: '2026-04-17T09:00:00.000Z',
            },
          ];
        }
        return [
          {
            id: 'voice-b-new',
            sourceId: 'voice-b-new',
            title: 'Newer post',
            url: 'https://voice-b.test/newer',
            publishedAt: '2026-04-18T09:00:00.000Z',
          },
        ];
      }),
    }));

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    const items = await getHomepageVoicesPool();

    expect(items.map((item) => item.id)).toEqual(['voice-b-new', 'voice-a-old']);
  });
});
