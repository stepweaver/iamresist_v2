import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('homepage creator feed ordering', () => {
  it('keeps creator items in reverse publish order instead of mission-score order', async () => {
    vi.resetModules();

    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: unknown) => cb,
    }));

    vi.doMock('@/lib/voices', () => ({
      getHomepageVoicesPool: vi.fn(async () => [
        {
          id: 'voice-older',
          sourceId: 'voice-older',
          title: 'Older voice item',
          url: 'https://voice.test/older',
          publishedAt: '2026-04-17T10:00:00.000Z',
          sourceType: 'voices',
          voice: { id: 'voice-a', slug: 'voice-a', title: 'Voice A', platform: 'Substack' },
        },
        {
          id: 'voice-newer',
          sourceId: 'voice-newer',
          title: 'Newer voice item',
          url: 'https://voice.test/newer',
          publishedAt: '2026-04-18T10:00:00.000Z',
          sourceType: 'voices',
          voice: { id: 'voice-b', slug: 'voice-b', title: 'Voice B', platform: 'Substack' },
        },
      ]),
    }));

    vi.doMock('@/lib/notion/videos.repo', () => ({
      getVideos: vi.fn(async () => [
        {
          id: 'video-old',
          title: 'Older curated video',
          url: 'https://youtube.test/old',
          dateAdded: '2026-04-16T10:00:00.000Z',
          createdTime: '2026-04-16T10:00:00.000Z',
          platform: 'YouTube',
        },
      ]),
    }));

    vi.doMock('@/lib/videoContent', () => ({
      enrichVideosWithDescriptions: vi.fn(async (items: unknown[]) => items),
    }));

    vi.doMock('@/lib/feeds/unifiedArchive.service', () => ({
      dedupeUnifiedArchiveItems: vi.fn((items: unknown[]) => items),
      hydrateEditorialNotesForPage: vi.fn(async (items: unknown[]) => items),
    }));

    const { getHomepageIntelFeed } = await import('@/lib/feeds/homepageIntel.service');
    const items = await getHomepageIntelFeed();

    expect(items.map((item) => item.id)).toEqual(['voice-newer', 'voice-older', 'curated-video-old']);
  });
});
