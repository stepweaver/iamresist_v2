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

    vi.doMock('@/lib/voicesManualTikTokItems', () => ({
      manualTikTokItems: [],
    }));

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    const items = await getHomepageVoicesPool();

    expect(items.map((item) => item.id)).toEqual(['voice-b-new', 'voice-a-old']);
  });

  it('includes curated manual TikTok items tied to existing voice slugs', async () => {
    vi.resetModules();

    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: unknown) => cb,
    }));

    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: vi.fn(async (_args?: unknown) => [
        {
          id: 'voice-tt',
          slug: 'voice-tt',
          title: 'Voice TT',
          homeUrl: 'https://www.tiktok.com/@voice',
          platform: 'TikTok',
          feedUrl: null,
        },
      ]),
      getVoiceBySlug: vi.fn(),
    }));

    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: vi.fn(async () => ({
        ok: true,
        reason: null,
        items: [],
      })),
      fetchFeedItems: vi.fn(),
    }));

    vi.doMock('@/lib/voicesManualTikTokItems', () => ({
      manualTikTokItems: [
        {
          voiceSlug: 'voice-tt',
          url: 'https://www.tiktok.com/@voice/video/1234567890123456789',
          title: 'A TikTok post',
          publishedAt: '2026-04-19T09:00:00.000Z',
        },
      ],
    }));

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    const items = await getHomepageVoicesPool();

    expect(items).toHaveLength(1);
    expect(items[0].voice?.slug).toBe('voice-tt');
    expect(items[0].url).toBe('https://www.tiktok.com/@voice/video/1234567890123456789');
    expect(items[0].sourceId).toBe('tt:video:1234567890123456789');
  });
});