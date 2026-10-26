import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAudioMime } from '@/lib/creatorNotes/podcastIdentity';
import {
  classifyArchiveMedia,
  extractRssMedia,
  selectItemsForTelescreenArchive,
  selectTelescreenVoices,
} from '@/lib/feeds/archiveMedia';
import { clearLastKnownGoodForTests } from '@/lib/feeds/lastKnownGood';
import { clearSharedFailureForTests } from '@/lib/feeds/sharedFailureBackoff';
import { getVoiceSourceLinkLabel } from '@/lib/sourceLinkLabels';
import {
  TELESCREEN_FEED_STATUS,
  TELESCREEN_MODES,
  telescreenCollectionMessage,
} from '@/lib/telescreen';

vi.mock('server-only', () => ({}));

afterEach(() => {
  clearSharedFailureForTests();
  clearLastKnownGoodForTests();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('@/lib/voices');
  vi.doUnmock('@/lib/feeds/rss');
  vi.doUnmock('@/lib/notion/voices.repo');
  vi.doUnmock('@/lib/notion/videos.repo');
  vi.doUnmock('@/lib/notion/protestMusic.repo');
  vi.doUnmock('@/lib/videoContent');
  vi.doUnmock('next/cache');
});

const YOUTUBE_WATCH = 'https://www.youtube.com/watch?v=abcdefghijk';
const YOUTUBE_SHORT = 'https://www.youtube.com/shorts/abcdefghijk';
const SUBSTACK_POST = 'https://brennancenter.substack.com/p/the-briefing';

function substackArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'briefing',
    title: 'Watch this live video briefing',
    url: SUBSTACK_POST,
    image: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
    description: '<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe><p>Watch the live video.</p>',
    sourceType: 'voices',
    voice: { platform: 'YouTube', slug: 'brennan-center', title: 'Brennan Center' },
    media: [{ url: 'https://substackcdn.com/image/fetch/hero.jpg', type: 'image/jpeg', medium: 'image' }],
    ...overrides,
  };
}

describe('archive media classification', () => {
  it('includes a YouTube RSS video', () => {
    const item = {
      id: 'yt:video:abcdefghijk',
      sourceId: 'yt:video:abcdefghijk',
      title: 'Hearing on surveillance',
      url: YOUTUBE_WATCH,
      voice: { platform: 'Substack', slug: 'hearing' },
    };
    expect(classifyArchiveMedia(item)).toMatchObject({ kind: 'video', destination: YOUTUBE_WATCH });
  });

  it('includes a YouTube Short', () => {
    expect(classifyArchiveMedia({ title: 'Clip', url: YOUTUBE_SHORT }).kind).toBe('video');
  });

  it('excludes an ordinary Brennan Center Substack article', () => {
    const item = substackArticle();
    expect(classifyArchiveMedia(item).kind).toBe('article');
    expect(getVoiceSourceLinkLabel(item)).toBe('Read article');
  });

  it('excludes a Substack article whose only media is a featured image', () => {
    const raw = {
      link: SUBSTACK_POST,
      title: 'The Briefing',
      enclosure: { url: 'https://substackcdn.com/image/fetch/hero.jpg', type: 'image/jpeg' },
      'content:encoded': '<img src="https://substackcdn.com/image/fetch/hero.jpg" />',
    };
    expect(extractRssMedia(raw)).toEqual([]);
    expect(classifyArchiveMedia({ ...substackArticle(), media: extractRssMedia(raw) }).kind).toBe('article');
  });

  it('excludes a nonvideo podcast entry and leaves podcast audio classification intact', () => {
    const item = {
      title: 'Weekly podcast',
      url: 'https://shows.example.com/episodes/weekly',
      media: [{ url: 'https://cdn.example.com/weekly.mp3', type: 'audio/mpeg', medium: 'audio' }],
    };
    expect(isAudioMime('audio/mpeg')).toBe(true);
    expect(classifyArchiveMedia(item).kind).toBe('audio');
    expect(selectItemsForTelescreenArchive([item])).toEqual([]);
  });

  it('includes an RSS item with explicit video media even when the post URL is an article', () => {
    const raw = {
      link: 'https://brennancenter.substack.com/p/with-clip',
      enclosure: { url: 'https://cdn.example.com/clips/hearing.mp4', type: 'video/mp4' },
      'media:content': [{ $: { url: 'https://cdn.example.com/clips/hearing.mp4', type: 'video/mp4', medium: 'video' } }],
      'content:encoded': '<iframe src="https://www.youtube.com/embed/zzzzzzzzzzz"></iframe>',
    };
    const media = extractRssMedia(raw);
    expect(media).toEqual([
      { url: 'https://cdn.example.com/clips/hearing.mp4', type: 'video/mp4', medium: '' },
    ]);
    expect(classifyArchiveMedia({ url: raw.link, title: 'Watch', media }).kind).toBe('video');
  });

  it('does not treat a title, thumbnail, platform, or embedded markup as a video', () => {
    const item = substackArticle({
      title: 'Live video watch party',
      image: YOUTUBE_WATCH,
      description: 'Watch this video live',
    });
    expect(classifyArchiveMedia(item).kind).toBe('article');
  });

  it('includes a curated record only when it has a video destination', () => {
    const curated = {
      isCurated: true,
      sourceType: 'curated-videos',
      title: 'Curated clip',
      url: YOUTUBE_WATCH,
    };
    expect(classifyArchiveMedia(curated).kind).toBe('video');
    expect(classifyArchiveMedia({ ...curated, url: 'https://example.com/essay' }).kind).toBe('article');
    expect(getVoiceSourceLinkLabel(curated)).toBe('Watch video');
  });

  it('keeps protest music whether or not the song URL is a video', () => {
    const song = {
      id: 'song-1',
      sourceType: 'protest-music',
      isProtestMusic: true,
      title: 'Which Side Are You On',
      url: 'https://songs.example/which-side',
    };
    const selected = selectItemsForTelescreenArchive([song, substackArticle()]);
    expect(selected.map((item) => item.id)).toEqual(['song-1']);
    expect(getVoiceSourceLinkLabel(song)).toBe('Open song');
  });
});

describe('telescreen voice dropdown', () => {
  const voices = [
    { slug: 'pakman', title: 'Pakman', platform: 'YouTube', feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123' },
    { slug: 'brennan-center', title: 'Brennan Center', platform: 'YouTube', feedUrl: 'https://brennancenter.substack.com/feed' },
    { slug: 'embedded', title: 'Embedded', platform: 'Substack', feedUrl: 'https://embedded.example/feed' },
  ];

  it('omits creators whose source is not video-capable unless they have a verified video', () => {
    const listed = selectTelescreenVoices(voices, { videoSlugs: ['embedded'] });
    expect(listed.map((voice) => voice.slug)).toEqual(['pakman', 'embedded']);
  });

  it('keeps the selected creator so an empty or failed filter stays addressable', () => {
    const listed = selectTelescreenVoices(voices, { selectedSlug: 'brennan-center' });
    expect(listed.map((voice) => voice.slug)).toContain('brennan-center');
    expect(listed.map((voice) => voice.slug)).toContain('pakman');
  });
});

describe('telescreen collection status', () => {
  it('distinguishes no videos, a failed feed, and invalid configuration', () => {
    expect(telescreenCollectionMessage(TELESCREEN_MODES.voices, TELESCREEN_FEED_STATUS.empty)).toBe(
      'No video items available.',
    );
    expect(telescreenCollectionMessage(TELESCREEN_MODES.voices, TELESCREEN_FEED_STATUS.unavailable)).toBe(
      'Videos are temporarily unavailable.',
    );
    expect(telescreenCollectionMessage(TELESCREEN_MODES.voices, TELESCREEN_FEED_STATUS.invalid)).toBe(
      'This collection is unavailable.',
    );
    expect(telescreenCollectionMessage(TELESCREEN_MODES.music, TELESCREEN_FEED_STATUS.empty)).toBe(
      'No protest music matches the current filters.',
    );
  });
});

describe('telescreen archive composition', () => {
  async function pageWith(overrides: {
    page?: number;
    limit?: number;
    filters?: Record<string, string>;
    store?: Map<string, unknown>;
    getVoicesFeed?: () => Promise<unknown>;
    getVoicesFeedBySlug?: () => Promise<unknown>;
    getVideos?: () => Promise<unknown>;
    getAllProtestSongs?: () => Promise<unknown>;
  }) {
    vi.resetModules();
    const store = overrides.store;
    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: () => Promise<unknown>, keyParts: string[] = []) => {
        if (!store) return cb;
        const key = keyParts.join('|');
        return async () => {
          if (store.has(key)) return store.get(key);
          const value = await cb();
          store.set(key, value);
          return value;
        };
      },
    }));
    if (overrides.getVoicesFeed || overrides.getVoicesFeedBySlug) {
      vi.doMock('@/lib/voices', () => ({
        getVoicesFeed: overrides.getVoicesFeed || (async () => []),
        getVoicesFeedBySlug: overrides.getVoicesFeedBySlug || (async () => []),
      }));
    }
    vi.doMock('@/lib/notion/videos.repo', () => ({
      getVideos: overrides.getVideos || (async () => []),
    }));
    vi.doMock('@/lib/notion/protestMusic.repo', () => ({
      getAllProtestSongs: overrides.getAllProtestSongs || (async () => []),
    }));
    vi.doMock('@/lib/videoContent', () => ({
      getCachedDescription: async () => '',
      EDITORIAL_SIGNATURE: 'sig',
    }));
    const backoff = await import('@/lib/feeds/sharedFailureBackoff');
    backoff.configureSharedFailureCacheForTests(backoff.createSharedFailureMemory());
    const { getUnifiedArchivePage } = await import('@/lib/feeds/unifiedArchive.service');
    return getUnifiedArchivePage(overrides.page || 1, overrides.limit || 20, overrides.filters || { sourceType: 'voices' });
  }

  it('paginates a mixed feed from verified videos only', async () => {
    const articles = [1, 2, 3].map((day) => ({
      id: `article-${day}`,
      title: 'Watch this live video',
      url: `https://brennancenter.substack.com/p/briefing-${day}`,
      publishedAt: `2026-10-2${day}T00:00:00.000Z`,
      image: 'https://cdn.example.com/hero.jpg',
      description: '<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>',
      voice: { platform: 'YouTube', slug: 'brennan-center', title: 'Brennan Center' },
      media: [{ url: 'https://cdn.example.com/hero.jpg', type: 'image/jpeg', medium: 'image' }],
    }));
    const videos = Array.from({ length: 12 }, (_, index) => {
      const number = index + 1;
      return {
        id: `video-${number}`,
        title: `Clip ${number}`,
        url: `https://www.youtube.com/watch?v=${String(number).padStart(11, 'a')}`,
        publishedAt: `2026-09-${String(number).padStart(2, '0')}T00:00:00.000Z`,
        voice: { slug: number % 2 === 0 ? 'pakman' : 'embedded', title: 'Creator', platform: 'Feed' },
      };
    });

    const feed = async () => [...articles, ...videos];
    const first = await pageWith({ page: 1, limit: 5, getVoicesFeed: feed });
    expect(first.total).toBe(12);
    expect(first.hasMore).toBe(true);
    expect(first.feedStatus).toBe(TELESCREEN_FEED_STATUS.ok);
    expect(first.items.map((item: { id: string }) => item.id)).toEqual([
      'video-12',
      'video-11',
      'video-10',
      'video-9',
      'video-8',
    ]);

    const second = await pageWith({ page: 2, limit: 5, getVoicesFeed: feed });
    expect(second.hasMore).toBe(true);
    expect(second.items.map((item: { id: string }) => item.id)).toEqual([
      'video-7',
      'video-6',
      'video-5',
      'video-4',
      'video-3',
    ]);

    const third = await pageWith({ page: 3, limit: 5, getVoicesFeed: feed });
    expect(third.hasMore).toBe(false);
    expect(third.total).toBe(12);
    expect(third.items.map((item: { id: string }) => item.id)).toEqual(['video-2', 'video-1']);
    expect(new Set(first.videoVoiceSlugs)).toEqual(new Set(['pakman', 'embedded']));
  });

  it('reports a creator feed of only articles as no videos', async () => {
    const page = await pageWith({
      getVoicesFeedBySlug: async () => [substackArticle()],
      filters: { sourceType: 'voices', voiceSlug: 'brennan-center' },
    });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.hasMore).toBe(false);
    expect(page.feedStatus).toBe(TELESCREEN_FEED_STATUS.empty);
  });

  it('reports a failed creator feed as unavailable and does not cache it as empty', async () => {
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
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => [],
      getVoiceBySlug: async () => ({
        id: 'pakman',
        slug: 'pakman',
        title: 'Pakman',
        platform: 'YouTube',
        feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123',
      }),
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async () => ({ ok: false, reason: 'http_503', items: [] }),
    }));
    vi.doMock('@/lib/notion/videos.repo', () => ({ getVideos: async () => [] }));
    vi.doMock('@/lib/notion/protestMusic.repo', () => ({ getAllProtestSongs: async () => [] }));
    vi.doMock('@/lib/videoContent', () => ({
      getCachedDescription: async () => '',
      EDITORIAL_SIGNATURE: 'sig',
    }));
    const backoff = await import('@/lib/feeds/sharedFailureBackoff');
    backoff.configureSharedFailureCacheForTests(backoff.createSharedFailureMemory());
    const { getUnifiedArchivePage } = await import('@/lib/feeds/unifiedArchive.service');
    const page = await getUnifiedArchivePage(1, 20, { sourceType: 'voices', voiceSlug: 'pakman' });
    expect(page.feedStatus).toBe(TELESCREEN_FEED_STATUS.unavailable);
    expect(page.items).toEqual([]);
    expect(page.feedStatus).not.toBe(TELESCREEN_FEED_STATUS.empty);
    expect([...store.keys()].some((key) => key.startsWith('unified-archive-v7'))).toBe(false);
  });

  it('reports an invalid feed configuration without requesting the feed', async () => {
    vi.resetModules();
    const fetched: string[] = [];
    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: () => Promise<unknown>) => cb,
    }));
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => [],
      getVoiceBySlug: async () => ({
        id: 'brennan',
        slug: 'brennan-center',
        title: 'Brennan Center',
        platform: 'YouTube',
        feedUrl: 'not a url',
      }),
    }));
    vi.doMock('@/lib/feeds/rss', () => ({
      fetchFeedItemsWithMeta: async (url: string) => {
        fetched.push(url);
        return { ok: true, reason: null, items: [] };
      },
    }));
    vi.doMock('@/lib/notion/videos.repo', () => ({ getVideos: async () => [] }));
    vi.doMock('@/lib/notion/protestMusic.repo', () => ({ getAllProtestSongs: async () => [] }));
    vi.doMock('@/lib/videoContent', () => ({
      getCachedDescription: async () => '',
      EDITORIAL_SIGNATURE: 'sig',
    }));
    const backoff = await import('@/lib/feeds/sharedFailureBackoff');
    backoff.configureSharedFailureCacheForTests(backoff.createSharedFailureMemory());
    const { getUnifiedArchivePage } = await import('@/lib/feeds/unifiedArchive.service');
    const page = await getUnifiedArchivePage(1, 20, { sourceType: 'voices', voiceSlug: 'brennan-center' });
    expect(page.feedStatus).toBe(TELESCREEN_FEED_STATUS.invalid);
    expect(page.items).toEqual([]);
    expect(fetched).toEqual([]);
  });

  it('keeps protest music and curated videos on their own modes', async () => {
    const music = await pageWith({
      filters: { sourceType: 'protest-music' },
      getVoicesFeed: async () => [substackArticle()],
      getAllProtestSongs: async () => [
        {
          id: 'song-1',
          title: 'Which Side Are You On',
          url: 'https://songs.example/which-side',
          artist: 'Artist',
          slug: 'artist',
          songSlug: 'which-side',
          createdTime: '2026-04-01T00:00:00.000Z',
        },
      ],
    });
    expect(music.items.map((item: { id: string }) => item.id)).toEqual(['song-1']);
    expect(music.feedStatus).toBe(TELESCREEN_FEED_STATUS.ok);

    const curated = await pageWith({
      filters: { sourceType: 'curated-videos' },
      getVideos: async () => [
        {
          id: 'clip-1',
          title: 'Curated clip',
          url: YOUTUBE_WATCH,
          platform: 'YouTube',
          createdTime: '2026-04-02T00:00:00.000Z',
        },
      ],
    });
    expect(curated.items.map((item: { id: string }) => item.id)).toEqual(['curated-clip-1']);
  });
});

describe('creator feed retrieval and recovery', () => {
  const DEMOCRACY_FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCWmMgbc1g6g5O8Tn_-k5qgA';
  const VIDEO_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Democracy Docket</title>
  <entry>
    <id>yt:video:abcdefghijk</id>
    <title>Voting rights hearing</title>
    <link href="https://www.youtube.com/watch?v=abcdefghijk"/>
    <published>2026-10-20T12:00:00+00:00</published>
  </entry>
</feed>`;
  const EMPTY_ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;

  function atomResponse(body: string, status = 200) {
    return new Response(body, {
      status,
      headers: { 'content-type': status === 200 ? 'application/atom+xml' : 'text/plain' },
    });
  }

  async function loadCreatorPage(queue: Response[]) {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const next = queue.shift();
        if (!next) throw new Error('unexpected feed fetch');
        return next;
      }),
    );
    vi.doMock('next/cache', () => ({
      unstable_cache: (cb: () => Promise<unknown>) => cb,
      revalidateTag: async () => {},
    }));
    vi.doMock('@/lib/notion/voices.repo', () => ({
      getAllVoicesCached: async () => [],
      getVoiceBySlug: async (slug: string) => ({
        id: 'democracy-docket',
        slug,
        title: 'Democracy Docket',
        platform: 'YouTube',
        feedUrl: DEMOCRACY_FEED,
      }),
    }));
    vi.doMock('@/lib/notion/videos.repo', () => ({ getVideos: async () => [] }));
    vi.doMock('@/lib/notion/protestMusic.repo', () => ({ getAllProtestSongs: async () => [] }));
    vi.doMock('@/lib/videoContent', () => ({
      getCachedDescription: async () => '',
      EDITORIAL_SIGNATURE: 'sig',
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backoff = await import('@/lib/feeds/sharedFailureBackoff');
    backoff.configureSharedFailureCacheForTests(backoff.createSharedFailureMemory());
    const { getUnifiedArchivePage } = await import('@/lib/feeds/unifiedArchive.service');
    const filters = { sourceType: 'voices', voiceSlug: 'democracy-docket' };
    return {
      fetchMock: globalThis.fetch as ReturnType<typeof vi.fn>,
      page: (refresh = false) => getUnifiedArchivePage(1, 20, filters, { refresh }),
    };
  }

  it('returns playable Democracy Docket videos from a healthy YouTube feed', async () => {
    const { page } = await loadCreatorPage([atomResponse(VIDEO_ATOM)]);
    const result = await page();
    expect(result.feedStatus).toBe(TELESCREEN_FEED_STATUS.ok);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: 'Voting rights hearing',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
    expect(result.items[0]?.voice?.slug).toBe('democracy-docket');
  });

  it('keeps the last good videos when YouTube later fails, and lets refresh try once', async () => {
    const { fetchMock, page } = await loadCreatorPage([
      atomResponse(VIDEO_ATOM),
      atomResponse('missing', 404),
      atomResponse('missing', 503),
    ]);

    const healthy = await page();
    expect(healthy.items.map((item: { title: string }) => item.title)).toEqual(['Voting rights hearing']);
    const afterHealthy = fetchMock.mock.calls.length;

    const duringOutage = await page();
    expect(duringOutage.feedStatus).toBe(TELESCREEN_FEED_STATUS.ok);
    expect(duringOutage.items[0]?.url).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(fetchMock.mock.calls.length).toBe(afterHealthy + 1);

    const cooled = await page();
    expect(cooled.items).toHaveLength(1);
    expect(fetchMock.mock.calls.length).toBe(afterHealthy + 1);

    const refreshed = await page(true);
    expect(refreshed.feedStatus).toBe(TELESCREEN_FEED_STATUS.ok);
    expect(refreshed.items[0]?.url).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(fetchMock.mock.calls.length).toBe(afterHealthy + 2);
  });

  it('reports a healthy empty feed separately from an unavailable feed', async () => {
    const empty = await loadCreatorPage([atomResponse(EMPTY_ATOM)]);
    const emptyPage = await empty.page();
    expect(emptyPage.feedStatus).toBe(TELESCREEN_FEED_STATUS.empty);
    expect(emptyPage.items).toEqual([]);
    expect(empty.fetchMock).toHaveBeenCalledTimes(1);

    const failed = await loadCreatorPage([atomResponse('missing', 404), atomResponse('missing', 500)]);
    const failedPage = await failed.page();
    expect(failedPage.feedStatus).toBe(TELESCREEN_FEED_STATUS.unavailable);
    expect(failedPage.items).toEqual([]);
    expect(failed.fetchMock).toHaveBeenCalledTimes(2);

    const blocked = await failed.page();
    expect(blocked.feedStatus).toBe(TELESCREEN_FEED_STATUS.unavailable);
    expect(failed.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a healthy empty response resurrect the previous videos', async () => {
    const { page } = await loadCreatorPage([atomResponse(VIDEO_ATOM), atomResponse(EMPTY_ATOM)]);
    const first = await page();
    expect(first.items).toHaveLength(1);
    const second = await page();
    expect(second.feedStatus).toBe(TELESCREEN_FEED_STATUS.empty);
    expect(second.items).toEqual([]);
  });
});
