import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFailureCooldown, upstreamFailure } from '@/lib/feeds/upstreamResult';
import {
  SHARED_FAILURE_BACKOFF_MS,
  assertUpstreamAvailable,
  clearProcessFailureMirrorForTests,
  clearSharedFailureForTests,
  configureSharedFailureCacheForTests,
  createSharedFailureMemory,
  noteUpstreamFailure,
  recallSharedPartial,
  sharedFailureActive,
} from '@/lib/feeds/sharedFailureBackoff';
import { clearLastKnownGoodForTests } from '@/lib/feeds/lastKnownGood';

vi.mock('server-only', () => ({}));

afterEach(() => {
  clearSharedFailureForTests();
  clearLastKnownGoodForTests();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('shared failure backoff', () => {
  it('shares a failure marker across instances and expires it', async () => {
    const shared = createSharedFailureMemory();
    configureSharedFailureCacheForTests(shared);
    const start = 1_000_000;

    await noteUpstreamFailure(null, 'voices-homepage', {
      now: start,
      partial: [{ id: 'kept' }],
    });

    clearProcessFailureMirrorForTests();
    expect(await sharedFailureActive('voices-homepage', start + 1)).toBe(true);
    expect(await recallSharedPartial('voices-homepage', start + 1)).toEqual([{ id: 'kept' }]);

    let loads = 0;
    await expect(
      assertUpstreamAvailable(null, 'voices-homepage', start + 1).then(() => {
        loads += 1;
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_FAILED', partial: [{ id: 'kept' }] });
    expect(loads).toBe(0);

    expect(await sharedFailureActive('voices-homepage', start + SHARED_FAILURE_BACKOFF_MS)).toBe(false);
    await expect(assertUpstreamAvailable(null, 'voices-homepage', start + SHARED_FAILURE_BACKOFF_MS)).resolves.toBeUndefined();
  });

  it('does not store an empty failure as a shared partial', async () => {
    const shared = createSharedFailureMemory();
    configureSharedFailureCacheForTests(shared);
    await noteUpstreamFailure(null, 'voices-homepage', { partial: [] });
    clearProcessFailureMirrorForTests();
    expect(await recallSharedPartial('voices-homepage')).toBeNull();
    expect(await sharedFailureActive('voices-homepage')).toBe(true);
  });

  it('lets invalidation clear the marker so the next load can succeed', async () => {
    const shared = createSharedFailureMemory();
    configureSharedFailureCacheForTests(shared);
    const now = 5_000;
    await noteUpstreamFailure(null, 'homepage-intel', { now, partial: [{ id: 'partial' }] });
    expect(await sharedFailureActive('homepage-intel', now + 10)).toBe(true);

    shared.invalidate('homepage-intel');
    clearProcessFailureMirrorForTests();
    expect(await sharedFailureActive('homepage-intel', now + 10)).toBe(false);
    expect(await recallSharedPartial('homepage-intel', now + 10)).toBeNull();

    let loads = 0;
    await assertUpstreamAvailable(null, 'homepage-intel', now + 10);
    loads += 1;
    expect(loads).toBe(1);
  });

  it('does not cache a thrown marker read the way a successful payload is cached', async () => {
    const store = new Map<string, unknown>();
    async function nextLikeCache(load: () => Promise<unknown>, key: string) {
      if (store.has(key)) return store.get(key);
      const value = await load();
      store.set(key, value);
      return value;
    }

    await expect(
      nextLikeCache(async () => {
        throw upstreamFailure('sample');
      }, 'feed'),
    ).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
    expect(store.has('feed')).toBe(false);

    await nextLikeCache(async () => ['story'], 'feed');
    expect(await nextLikeCache(async () => ['other'], 'feed')).toEqual(['story']);
  });
});

describe('aggregate failure versus empty content', () => {
  it('keeps a genuinely empty voices pool empty and caches it', async () => {
    vi.resetModules();
    const calls = { rss: 0 };
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
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => [
        { id: 'voice-a', slug: 'voice-a', title: 'Voice A', homeUrl: null, platform: 'Substack', feedUrl: 'https://a.test/feed' },
      ],
      getVoiceBySlug: async () => null,
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async () => {
        calls.rss += 1;
        return { ok: true, reason: null, items: [] };
      },
    }));

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    expect(await getHomepageVoicesPool()).toEqual([]);
    expect(await getHomepageVoicesPool()).toEqual([]);
    expect(calls.rss).toBe(1);
    expect(store.size).toBe(1);
  });

  it('does not turn a total voices failure into an authoritative empty pool', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    const calls = { rss: 0 };
    let fail = false;

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
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => [
        { id: 'voice-a', slug: 'voice-a', title: 'Voice A', homeUrl: null, platform: 'YouTube', feedUrl: 'https://a.test/feed' },
      ],
      getVoiceBySlug: async () => null,
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async () => {
        calls.rss += 1;
        if (fail) return { ok: false, reason: 'http_503', items: [] };
        return {
          ok: true,
          reason: null,
          items: [{ id: 'post-1', title: 'Known', url: 'https://a.test/post', publishedAt: '2026-04-18T00:00:00.000Z' }],
        };
      },
    }));

    const shared = createSharedFailureMemory();
    const { configureSharedFailureCacheForTests: configure } = await import('@/lib/feeds/sharedFailureBackoff');
    configure(shared);

    const { getHomepageVoicesPool } = await import('@/lib/voices');
    const first = await getHomepageVoicesPool();
    expect(first.map((item: { id: string }) => item.id)).toEqual(['post-1']);
    expect(calls.rss).toBe(1);

    const cachedAgain = await getHomepageVoicesPool();
    expect(cachedAgain.map((item: { id: string }) => item.id)).toEqual(['post-1']);
    expect(calls.rss).toBe(1);

    store.clear();
    fail = true;
    const duringOutage = await getHomepageVoicesPool();
    expect(duringOutage.map((item: { id: string }) => item.id)).toEqual(['post-1']);
    expect(store.has('voices-feed|homepage-pool-v6')).toBe(false);

    const cooled = await getHomepageVoicesPool();
    expect(cooled.map((item: { id: string }) => item.id)).toEqual(['post-1']);
    expect(calls.rss).toBe(2);

    clearLastKnownGoodForTests();
    const { getVoicesArchive } = await import('@/lib/voices');
    const failedArchive = await getVoicesArchive();
    expect(failedArchive.items).toEqual([]);
    expect(failedArchive.report?.degraded).toBe(true);
    expect(failedArchive.report?.empty).toEqual([]);
    expect(failedArchive.report?.failed).toEqual(['voice-a']);
    const fetchesAfterFailure = calls.rss;
    const failedAgain = await getVoicesArchive();
    expect(failedAgain.items).toEqual([]);
    expect(calls.rss).toBe(fetchesAfterFailure);
    expect([...store.keys()].some((key) => key.includes('archive-interleave'))).toBe(true);
  });

  it('preserves curated archive items when voices fail and does not cache the partial as complete', async () => {
    vi.resetModules();
    const store = new Map<string, unknown>();
    const voices = vi.fn(async () => {
      throw upstreamFailure('voices-archive');
    });

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
    vi.doMock('@/lib/voices', () => ({
      getVoicesFeed: voices,
      getVoicesFeedBySlug: voices,
      getVoicesArchive: voices,
    }));
    vi.doMock('@/lib/notion/videos.repo', () => ({
      getVideos: async () => [
        { id: 'video-1', title: 'Curated clip', url: 'https://www.youtube.com/watch?v=abcdefghijk', createdTime: '2026-04-18T00:00:00.000Z', platform: 'YouTube' },
      ],
    }));
    vi.doMock('@/lib/notion/protestMusic.repo', () => ({
      getAllProtestSongs: async () => [],
    }));
    vi.doMock('@/lib/videoContent', () => ({
      getCachedDescription: async () => '',
      EDITORIAL_SIGNATURE: 'sig',
    }));

    const shared = createSharedFailureMemory();
    const { configureSharedFailureCacheForTests: configure } = await import('@/lib/feeds/sharedFailureBackoff');
    configure(shared);

    const { getUnifiedArchivePage } = await import('@/lib/feeds/unifiedArchive.service');
    const first = await getUnifiedArchivePage(1, 20, {});
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(['curated-video-1']);
    expect([...store.keys()].some((key) => key.startsWith('unified-archive-v9'))).toBe(false);

    clearProcessFailureMirrorForTests();
    const second = await getUnifiedArchivePage(1, 20, {});
    expect(second.items.map((item: { id: string }) => item.id)).toEqual(['curated-video-1']);
    expect(voices).toHaveBeenCalledTimes(1);
  });

  it('replays the last complete archive when voices later fail', async () => {
    vi.resetModules();
    let fail = false;
    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: () => Promise<unknown>) => cb,
    }));
    vi.doMock('@/lib/voices', () => {
      const getVoicesFeed = async () => {
        if (fail) throw upstreamFailure('voices-archive');
        return [
          {
            id: 'voice-1',
            title: 'Voice post',
            url: 'https://www.youtube.com/watch?v=zyxwvutsrqp',
            publishedAt: '2026-04-18T00:00:00.000Z',
            sourceType: 'voices',
            voice: { id: 'voice-a', slug: 'voice-a', title: 'Voice A' },
          },
        ];
      };
      return {
        getVoicesFeed,
        getVoicesFeedBySlug: async () => [],
        getVoicesArchive: async () => ({ items: await getVoicesFeed(), report: null }),
      };
    });
    vi.doMock('@/lib/notion/videos.repo', () => ({ getVideos: async () => [] }));
    vi.doMock('@/lib/notion/protestMusic.repo', () => ({ getAllProtestSongs: async () => [] }));
    vi.doMock('@/lib/videoContent', () => ({
      getCachedDescription: async () => '',
      EDITORIAL_SIGNATURE: 'sig',
    }));

    const { configureSharedFailureCacheForTests: configure, createSharedFailureMemory: memory } = await import(
      '@/lib/feeds/sharedFailureBackoff'
    );
    configure(memory());
    const { getUnifiedArchivePage } = await import('@/lib/feeds/unifiedArchive.service');
    const ok = await getUnifiedArchivePage(1, 20, {});
    expect(ok.items.map((item: { id: string }) => item.id)).toEqual(['voice-1']);

    fail = true;
    const duringOutage = await getUnifiedArchivePage(1, 20, {});
    expect(duringOutage.items.map((item: { id: string }) => item.id)).toEqual(['voice-1']);
  });

  it('keeps a tripped local cooldown for the rest of the 60 second window after the shared marker is cleared', async () => {
    const shared = createSharedFailureMemory();
    configureSharedFailureCacheForTests(shared);
    const cooldown = createFailureCooldown();
    const now = 10_000;
    await noteUpstreamFailure(cooldown, 'homepage-intel', { now, partial: [{ id: 'partial' }] });
    shared.invalidate('homepage-intel');
    clearProcessFailureMirrorForTests();

    await expect(assertUpstreamAvailable(cooldown, 'homepage-intel', now + 10)).rejects.toMatchObject({
      code: 'UPSTREAM_FAILED',
    });
    await expect(assertUpstreamAvailable(createFailureCooldown(), 'homepage-intel', now + 10)).resolves.toBeUndefined();
    await expect(
      assertUpstreamAvailable(cooldown, 'homepage-intel', now + SHARED_FAILURE_BACKOFF_MS),
    ).resolves.toBeUndefined();
  });
});
