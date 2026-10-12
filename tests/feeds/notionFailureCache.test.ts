import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLastKnownGoodForTests } from '@/lib/feeds/lastKnownGood';
import { clearSharedFailureForTests, createSharedFailureMemory } from '@/lib/feeds/sharedFailureBackoff';

vi.mock('server-only', () => ({}));

afterEach(() => {
  clearSharedFailureForTests();
  clearLastKnownGoodForTests();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('@/lib/voices');
  vi.doUnmock('@/lib/feeds/unifiedArchive.service');
});

function cachingUnstableCache(store: Map<string, unknown>) {
  return {
    unstable_cache: (cb: () => Promise<unknown>, keyParts: string[]) => {
      const key = keyParts.join('|');
      return async () => {
        if (store.has(key)) return store.get(key);
        const value = await cb();
        store.set(key, value);
        return value;
      };
    },
  };
}

describe('Notion failures are not cached as empty collections', () => {
  it('keeps a previous voices pool when the voice directory fails and does not cache []', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    let directoryFailed = false;

    vi.doMock('next/cache', () => cachingUnstableCache(store));
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => {
        if (directoryFailed) throw new Error('notion 503');
        return [
          { id: 'voice-a', slug: 'voice-a', title: 'Voice A', homeUrl: null, platform: 'YouTube', feedUrl: 'https://a.test/feed' },
        ];
      },
      getVoiceBySlug: async () => null,
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async () => ({
        ok: true,
        reason: null,
        items: [{ id: 'post-1', title: 'Known', url: 'https://a.test/post', publishedAt: '2026-04-18T00:00:00.000Z' }],
      }),
    }));

    const shared = createSharedFailureMemory();
    const { configureSharedFailureCacheForTests: configure } = await import('@/lib/feeds/sharedFailureBackoff');
    configure(shared);
    const { getHomepageVoicesPool } = await import('@/lib/voices');

    expect((await getHomepageVoicesPool()).map((item: { id: string }) => item.id)).toEqual(['post-1']);
    store.clear();
    directoryFailed = true;

    expect((await getHomepageVoicesPool()).map((item: { id: string }) => item.id)).toEqual(['post-1']);
    expect([...store.values()].some((value) => Array.isArray(value) && value.length === 0)).toBe(false);
    expect(store.has('voices-feed|homepage-pool-v6')).toBe(false);
  });

  it('still caches a voice directory that successfully returns no creators', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    vi.doMock('next/cache', () => cachingUnstableCache(store));
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => [],
      getVoiceBySlug: async () => null,
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async () => {
        throw new Error('rss should not run for an empty directory');
      },
    }));

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    expect(await getHomepageVoicesPool()).toEqual([]);
    expect(await getHomepageVoicesPool()).toEqual([]);
    expect(store.get('voices-feed|homepage-pool-v6')).toEqual([]);
  });

  it('does not let one creator failure block a different creator', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    const calls: string[] = [];
    vi.doMock('next/cache', () => cachingUnstableCache(store));
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => [],
      getVoiceBySlug: async (slug: string) => ({
        id: slug,
        slug,
        title: slug,
        homeUrl: null,
        platform: 'YouTube',
        feedUrl: `https://${slug}.test/feed`,
      }),
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async (url: string) => {
        calls.push(url);
        if (url.includes('creator-a')) return { ok: false, reason: 'http_503', items: [] };
        return {
          ok: true,
          reason: null,
          items: [{ id: 'b-post', title: 'Creator B', url: 'https://creator-b.test/post', publishedAt: '2026-04-18T00:00:00.000Z' }],
        };
      },
    }));

    const shared = createSharedFailureMemory();
    const backoff = await import('@/lib/feeds/sharedFailureBackoff');
    backoff.configureSharedFailureCacheForTests(shared);
    const { getVoicesFeedBySlug } = await import('@/lib/voices');

    await expect(getVoicesFeedBySlug('creator-a')).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
    const creatorB = await getVoicesFeedBySlug('creator-b');
    expect(creatorB.map((item: { id: string }) => item.id)).toEqual(['b-post']);
    expect(calls.some((url) => url.includes('creator-b'))).toBe(true);
    expect(await backoff.sharedFailureActive('voices-slug:creator-a')).toBe(true);
    expect(await backoff.sharedFailureActive('voices-slug:creator-b')).toBe(false);
    expect(await backoff.sharedFailureActive('voices-slug')).toBe(false);

    const creatorBAgain = await getVoicesFeedBySlug('creator-b');
    expect(creatorBAgain.map((item: { id: string }) => item.id)).toEqual(['b-post']);
    expect(calls.filter((url) => url.includes('creator-b'))).toHaveLength(1);
  });

  it('does not cache a newswire built while curated articles are failing', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    let curatedFailed = false;
    vi.doMock('next/cache', () => cachingUnstableCache(store));
    vi.doMock('@/lib/notion/curatedArticles.repo', () => ({
      getCuratedArticles: async () => {
        if (curatedFailed) throw new Error('notion 503');
        return [
          {
            id: 'article-1',
            title: 'Senate hearing on surveillance authority',
            url: 'https://curated.test/hearing',
            source: 'Curated',
            publishedAt: '2026-04-18T00:00:00.000Z',
            heroImage: 'https://curated.test/hearing.jpg',
            description: '',
          },
        ];
      },
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async () => ({
        ok: true,
        reason: null,
        items: [
          {
            id: 'rss-1',
            title: 'Court ruling on voting rights',
            url: 'https://rss.test/voting',
            publishedAt: '2026-04-18T01:00:00.000Z',
            description: 'A federal court ruling.',
            image: 'https://rss.test/voting.jpg',
          },
        ],
      }),
    }));
    vi.doMock('@/lib/feeds/ogImage', () => ({
      enrichStoriesWithOgImages: async () => {},
      fetchSourceScopedArticleImageCached: async () => null,
    }));

    const shared = createSharedFailureMemory();
    const { configureSharedFailureCacheForTests: configure } = await import('@/lib/feeds/sharedFailureBackoff');
    configure(shared);
    const { getNewswireStories } = await import('@/lib/newswire');

    const first = await getNewswireStories();
    expect(first.map((story: { id: string }) => story.id)).toContain('curated-article__article-1');
    store.clear();
    curatedFailed = true;

    const during = await getNewswireStories();
    expect(during.map((story: { id: string }) => story.id)).toContain('curated-article__article-1');
    expect(store.has('newswire-stories-v4')).toBe(false);
  });

  it('serves RSS stories when curated articles fail and no earlier newswire exists, without caching them as complete', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    vi.doMock('next/cache', () => cachingUnstableCache(store));
    vi.doMock('@/lib/notion/curatedArticles.repo', () => ({
      getCuratedArticles: async () => {
        throw new Error('notion 503');
      },
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async () => ({
        ok: true,
        reason: null,
        items: [
          {
            id: 'rss-1',
            title: 'Court ruling on voting rights',
            url: 'https://rss.test/voting',
            publishedAt: '2026-04-18T01:00:00.000Z',
            description: 'A federal court ruling.',
            image: 'https://rss.test/voting.jpg',
          },
        ],
      }),
    }));
    vi.doMock('@/lib/feeds/ogImage', () => ({
      enrichStoriesWithOgImages: async () => {},
      fetchSourceScopedArticleImageCached: async () => null,
    }));

    const shared = createSharedFailureMemory();
    const { configureSharedFailureCacheForTests: configure } = await import('@/lib/feeds/sharedFailureBackoff');
    configure(shared);
    const { getNewswireStories } = await import('@/lib/newswire');
    const stories = await getNewswireStories();
    expect(stories.map((story: { id: string }) => story.id).some((id: string) => id.includes('rss-1'))).toBe(true);
    expect(stories).not.toEqual([]);
    expect(store.has('newswire-stories-v4')).toBe(false);
  });

  it('does not cache the telescreen feed when curated videos fail', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    vi.doMock('next/cache', () => cachingUnstableCache(store));
    vi.doMock('@/lib/voices', () => ({
      getHomepageVoicesPool: async () => [
        {
          id: 'voice-1',
          title: 'Voice post',
          url: 'https://voice.test/post',
          publishedAt: '2026-04-18T00:00:00.000Z',
          sourceType: 'voices',
          voice: { id: 'voice-a', slug: 'voice-a', title: 'Voice A' },
        },
      ],
    }));
    vi.doMock('@/lib/notion/videos.repo', () => ({
      getVideos: async () => {
        throw new Error('notion 503');
      },
    }));
    vi.doMock('@/lib/videoContent', () => ({
      enrichVideosWithDescriptions: async (items: unknown[]) => items,
    }));
    vi.doMock('@/lib/feeds/unifiedArchive.service', () => ({
      dedupeUnifiedArchiveItems: (items: unknown[]) => items,
      hydrateEditorialNotesForPage: async (items: unknown[]) => items,
    }));

    const shared = createSharedFailureMemory();
    const { configureSharedFailureCacheForTests: configure } = await import('@/lib/feeds/sharedFailureBackoff');
    configure(shared);
    const { getHomepageIntelFeed } = await import('@/lib/feeds/homepageIntel.service');

    await expect(getHomepageIntelFeed()).rejects.toMatchObject({
      code: 'UPSTREAM_FAILED',
      fallback: [expect.objectContaining({ id: 'voice-1' })],
    });
    expect(store.has('homepage-intel-feed-v5')).toBe(false);
  });

  it('does not cache the telescreen archive when curated videos fail and voices are still available', async () => {
    vi.doUnmock('@/lib/feeds/unifiedArchive.service');
    vi.resetModules();
    const store = new Map<string, unknown>();
    vi.doMock('next/cache', () => cachingUnstableCache(store));
    vi.doMock('@/lib/voices', () => ({
      getVoicesFeed: async () => [
        {
          id: 'voice-1',
          title: 'Voice post',
          url: 'https://voice.test/post',
          publishedAt: '2026-04-18T00:00:00.000Z',
          sourceType: 'voices',
          voice: { id: 'voice-a', slug: 'voice-a', title: 'Voice A' },
        },
      ],
      getVoicesFeedBySlug: async () => [],
    }));
    vi.doMock('@/lib/notion/videos.repo', () => ({
      getVideos: async () => {
        throw new Error('notion 503');
      },
    }));
    vi.doMock('@/lib/notion/protestMusic.repo', () => ({
      getAllProtestSongs: async () => [
        {
          id: 'song-1',
          title: 'Which Side Are You On',
          url: 'https://youtube.test/song',
          artist: 'Test Artist',
          slug: 'test-artist',
          songSlug: 'which-side',
          createdTime: '2026-04-17T00:00:00.000Z',
        },
      ],
    }));
    vi.doMock('@/lib/videoContent', () => ({
      getCachedDescription: async () => '',
      EDITORIAL_SIGNATURE: 'sig',
    }));

    const shared = createSharedFailureMemory();
    const { configureSharedFailureCacheForTests: configure } = await import('@/lib/feeds/sharedFailureBackoff');
    configure(shared);
    const { getUnifiedArchivePage } = await import('@/lib/feeds/unifiedArchive.service');
    const page = await getUnifiedArchivePage(1, 20, {});
    expect(page.items.map((item: { id: string }) => item.id)).toEqual(['voice-1', 'song-1']);
    expect([...store.keys()].some((key) => key.startsWith('unified-archive-v6'))).toBe(false);
  });
});
