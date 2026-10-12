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
      fetchFeedItemsWithMeta: vi.fn(async (feedUrl: string) => {
        if (feedUrl.includes('a.test')) {
          return {
            ok: true,
            reason: null,
            items: [
              {
                id: 'voice-a-old',
                sourceId: 'voice-a-old',
                title: 'Older post',
                url: 'https://voice-a.test/older',
                publishedAt: '2026-04-17T09:00:00.000Z',
              },
            ],
          };
        }

        return {
          ok: true,
          reason: null,
          items: [
            {
              id: 'voice-b-new',
              sourceId: 'voice-b-new',
              title: 'Newer post',
              url: 'https://voice-b.test/newer',
              publishedAt: '2026-04-18T09:00:00.000Z',
            },
          ],
        };
      }),
      fetchFeedItems: vi.fn(),
    }));

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    const items = await getHomepageVoicesPool();

    expect(items.map((item: { id: string }) => item.id)).toEqual(['voice-b-new', 'voice-a-old']);
  });

  it('does not cache a total upstream failure and replays the last good pool', async () => {
    vi.resetModules();

    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: unknown) => cb,
    }));

    let fail = false;
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: vi.fn(async () => [
        {
          id: 'voice-a',
          slug: 'voice-a',
          title: 'Voice A',
          homeUrl: null,
          platform: 'YouTube',
          feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=abc',
        },
      ]),
      getVoiceBySlug: vi.fn(),
    }));

    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: vi.fn(async () => {
        if (fail) return { ok: false, reason: 'http_404', items: [] };
        return {
          ok: true,
          reason: null,
          items: [
            {
              id: 'voice-a-post',
              sourceId: 'voice-a-post',
              title: 'Known post',
              url: 'https://www.youtube.com/watch?v=abcdefghijk',
              publishedAt: '2026-04-18T09:00:00.000Z',
            },
          ],
        };
      }),
    }));

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    const first = await getHomepageVoicesPool();
    expect(first.map((item: { id: string }) => item.id)).toEqual(['voice-a-post']);

    fail = true;
    const second = await getHomepageVoicesPool();
    expect(second.map((item: { id: string }) => item.id)).toEqual(['voice-a-post']);
  });
});