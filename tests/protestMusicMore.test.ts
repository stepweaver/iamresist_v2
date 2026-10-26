import { describe, expect, it, vi } from 'vitest';
import {
  acceptChannelUploads,
  belongsToArtist,
  creatorMoreRequest,
  finalizeProtestRelated,
  limitRelatedSections,
  RECENT_UPLOAD_LIMIT,
  uploadsDisplayStatus,
} from '@/lib/protestMusic/moreFromArtist';
import { parseChannelListing } from '@/lib/protestMusic/channelListing';
import { loadProtestArtistMore, resolveVerifiedUploads } from '@/lib/protestMusic/loadArtistMore';
import {
  channelIdFromProfileUrl,
  isYoutubeHandleUrl,
  normalizeYoutubeChannelId,
  resolveArtistChannelId,
  youtubeUploadsFeedUrl,
} from '@/lib/protestMusic/youtubeChannel';

const BILLY = 'UCQX_TeJhu67KX8LTLS6hztg';
const DAWN = 'UCPZX50xQSUI1rj5DGUUAlyg';
const TOPIC = 'UCZUdavF-YKQOB9xs5hdviNg';
const BILLY_PROFILE = `https://www.youtube.com/channel/${BILLY}`;
const SWOOZY_PROFILE = 'https://music.apple.com/us/artist/swoozy/1620031185';

function song(overrides: Record<string, unknown> = {}) {
  return {
    id: 'song-1',
    title: 'The Sheep Song',
    artist: 'Billy Simons Jr.',
    slug: 'billy-simons-jr',
    songSlug: 'the-sheep-song',
    url: 'https://www.youtube.com/watch?v=8nxiE-k8SkU',
    artistChannelUrl: BILLY_PROFILE,
    youtubeChannelId: null,
    createdTime: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function upload(id: string, publishedAt: string, channelId = BILLY) {
  return {
    title: `Upload ${id}`,
    url: `https://www.youtube.com/watch?v=${id}&feature=share`,
    sourceId: `yt:video:${id}`,
    publishedAt,
    channelId,
  };
}

const billyFeed = {
  title: 'Billy Simons Jr.',
  author: 'Billy Simons Jr.',
  channelId: BILLY,
};

describe('YouTube channel id validation', () => {
  it('accepts Billy Simons Jr. and other channel URLs, and rejects everything else', () => {
    expect(channelIdFromProfileUrl(BILLY_PROFILE)).toBe(BILLY);
    expect(normalizeYoutubeChannelId(BILLY)).toBe(BILLY);
    expect(
      channelIdFromProfileUrl('https://youtube.com/channel/UCPZX50xQSUI1rj5DGUUAlyg?si=fJoEGM7WGozx1QcB'),
    ).toBe(DAWN);
    expect(youtubeUploadsFeedUrl(BILLY)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${BILLY}`,
    );

    expect(normalizeYoutubeChannelId('UC123')).toBeNull();
    expect(normalizeYoutubeChannelId('XXQX_TeJhu67KX8LTLS6hztg')).toBeNull();
    expect(normalizeYoutubeChannelId('')).toBeNull();
    expect(normalizeYoutubeChannelId('javascript:alert(1)')).toBeNull();
    expect(channelIdFromProfileUrl('https://youtube.com/@officialcoheed?si=abc')).toBeNull();
    expect(channelIdFromProfileUrl('https://www.youtube.com/@hellswelles/videos')).toBeNull();
    expect(channelIdFromProfileUrl('https://www.youtube.com/c/Coheed')).toBeNull();
    expect(channelIdFromProfileUrl('https://www.youtube.com/user/pakman')).toBeNull();
    expect(channelIdFromProfileUrl(SWOOZY_PROFILE)).toBeNull();
    expect(channelIdFromProfileUrl(`https://evil.test/feeds/videos.xml?channel_id=${BILLY}`)).toBeNull();
    expect(youtubeUploadsFeedUrl(`https://evil.test/${BILLY}`)).toBeNull();
    expect(youtubeUploadsFeedUrl('@billysimonsjr')).toBeNull();
    expect(isYoutubeHandleUrl('https://www.youtube.com/@hellswelles')).toBe(true);
    expect(isYoutubeHandleUrl(SWOOZY_PROFILE)).toBe(false);
  });

  it('does not assign one artist a channel id that belongs to another', () => {
    const billy = song();
    const swoozy = song({
      id: 'swoozy-1',
      artist: 'Swoozy',
      slug: 'swoozy',
      title: 'Swoozy song',
      artistChannelUrl: SWOOZY_PROFILE,
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    });
    const handleArtist = song({
      id: 'jesse-1',
      artist: 'Jesse Welles',
      slug: 'jesse-welles',
      artistChannelUrl: 'https://www.youtube.com/@hellswelles',
    });
    const conflicted = [
      billy,
      song({ id: 'song-2', youtubeChannelId: TOPIC, url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' }),
    ];
    const invalidExplicit = song({ youtubeChannelId: 'not-a-channel' });

    expect(resolveArtistChannelId([billy])).toBe(BILLY);
    expect(resolveArtistChannelId([swoozy])).toBeNull();
    expect(resolveArtistChannelId([handleArtist])).toBeNull();
    expect(resolveArtistChannelId(conflicted)).toBeNull();
    expect(resolveArtistChannelId([invalidExplicit])).toBeNull();
    expect(resolveArtistChannelId([billy, swoozy].filter((row) => row.slug === 'swoozy'))).toBeNull();
    expect(
      resolveArtistChannelId([
        song({
          artistChannelUrl: 'https://youtube.com/@dezimusic3',
          youtubeChannelId: BILLY,
        }),
      ]),
    ).toBe(BILLY);
  });
});

describe('protest artist uploads', () => {
  it('orders verified uploads newest first, drops duplicates, and keeps curated tracks separate', () => {
    const curated = [
      song(),
      song({
        id: 'song-2',
        title: 'Grandpa Ice',
        url: 'https://www.youtube.com/watch?v=ccccccccccc',
        createdTime: '2026-02-01T00:00:00.000Z',
      }),
    ];
    const uploads = [
      upload('ddddddddddd', '2026-03-01T00:00:00.000Z'),
      upload('eeeeeeeeeee', '2026-05-01T00:00:00.000Z'),
      upload('eeeeeeeeeee', '2026-04-01T00:00:00.000Z'),
      upload('ccccccccccc', '2026-06-01T00:00:00.000Z'),
      { ...upload('fffffffffff', '2026-07-01T00:00:00.000Z'), channelId: TOPIC },
    ];
    const accepted = acceptChannelUploads({
      expectedChannelId: BILLY,
      feed: billyFeed,
      items: uploads,
    });
    expect(accepted.map((item) => item.channelId)).not.toContain(TOPIC);

    const current = curated[0];
    const { recent, featured } = finalizeProtestRelated({
      current,
      uploads: accepted.map((item) => ({
        ...item,
        voice: { slug: 'billy-simons-jr', title: 'Billy Simons Jr.' },
      })),
      curated,
    });

    expect(recent.map((item) => item.url)).toEqual([
      'https://www.youtube.com/watch?v=eeeeeeeeeee&feature=share',
      'https://www.youtube.com/watch?v=ddddddddddd&feature=share',
    ]);
    expect(featured.map((item) => item.title)).toEqual(['Grandpa Ice']);
    expect(recent.concat(featured).some((item) => item.url.includes('8nxiE-k8SkU'))).toBe(false);
    expect(new Set(recent.concat(featured).map((item) => item.url.match(/v=([^&]+)/)?.[1])).size).toBe(
      recent.length + featured.length,
    );
  });

  it('caps recent uploads at four after the playing video is removed', () => {
    const uploads = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'].map(
      (id, index) => upload(id, `2026-0${index + 1}-01T00:00:00.000Z`),
    );
    const { recent } = finalizeProtestRelated({
      current: { url: 'https://www.youtube.com/watch?v=eeeeeeeeeee' },
      uploads,
      curated: [],
    });
    expect(recent).toHaveLength(RECENT_UPLOAD_LIMIT);
    expect(recent[0]?.publishedAt).toBe('2026-04-01T00:00:00.000Z');
    expect(recent.some((item) => item.url.includes('eeeeeeeeeee'))).toBe(false);
  });

  it('rejects a feed for a different channel and an anonymous topic channel', () => {
    const items = [upload('aaaaaaaaaaa', '2026-08-01T00:00:00.000Z')];
    expect(
      acceptChannelUploads({
        expectedChannelId: BILLY,
        feed: { ...billyFeed, channelId: TOPIC, title: 'Billy Simons Jr.', author: 'Billy Simons Jr.' },
        items,
      }),
    ).toEqual([]);
    expect(
      acceptChannelUploads({
        expectedChannelId: DAWN,
        feed: { title: '- Topic', author: '- Topic', channelId: 'PZX50xQSUI1rj5DGUUAlyg' },
        items: [upload('aaaaaaaaaaa', '2026-08-01T00:00:00.000Z', DAWN)],
      }),
    ).toEqual([]);
    expect(
      acceptChannelUploads({
        expectedChannelId: BILLY,
        feed: { title: '', author: '', channelId: '' },
        items,
      }),
    ).toEqual([]);
    expect(
      acceptChannelUploads({
        expectedChannelId: BILLY,
        feed: { title: 'Billy Simons Jr.', author: 'Billy Simons Jr.', channelId: BILLY.slice(2) },
        items,
      }).map((item) => item.title),
    ).toEqual(['Upload aaaaaaaaaaa']);
  });

  it('falls back to curated tracks when the feed is missing and keeps the profile link', async () => {
    const getUploads = vi.fn(async () => {
      throw new Error('http_404');
    });
    const billySongs = [
      song(),
      song({
        id: 'song-2',
        title: 'Grandpa Ice',
        url: 'https://www.youtube.com/watch?v=ccccccccccc',
        createdTime: '2026-04-02T00:00:00.000Z',
      }),
    ];
    const swoozySongs = [
      song({
        id: 'swoozy-1',
        artist: 'Swoozy',
        slug: 'swoozy',
        title: 'Swoozy track',
        songSlug: 'swoozy-track',
        url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        artistChannelUrl: SWOOZY_PROFILE,
      }),
    ];
    const failed = await loadProtestArtistMore('billy-simons-jr', {
      getSongs: async () => billySongs,
      getUploads,
    });
    expect(failed.feedFailed).toBe(true);
    expect(failed.uploads).toMatchObject({ status: 'upstream_failed', reason: 'http_404', source: null });
    expect(failed.recent).toEqual([]);
    expect(failed.featured.map((item) => item.title)).toEqual(['The Sheep Song', 'Grandpa Ice']);
    expect(failed.featured.every((item) => item.voice.homeUrl === BILLY_PROFILE)).toBe(true);
    expect(getUploads).toHaveBeenCalledWith(BILLY);

    const swoozy = await loadProtestArtistMore('swoozy', {
      getSongs: async () => swoozySongs,
      getUploads,
    });
    expect(swoozy.channelId).toBeNull();
    expect(swoozy.uploads).toMatchObject({ status: 'unverified_channel', source: null });
    expect(swoozy.recent).toEqual([]);
    expect(swoozy.featured[0]?.voice.homeUrl).toBe(SWOOZY_PROFILE);
    expect(swoozy.featured[0]?.voice.homeUrl).not.toContain('youtube.com');
    expect(getUploads).toHaveBeenCalledTimes(1);
  });

  it('labels recent uploads with the Notion artist and does not fetch a client URL', async () => {
    const getUploads = vi.fn(async (channelId: string) => ({
      feed: { ...billyFeed, author: 'Someone Else' },
      items: [upload('ddddddddddd', '2026-09-01T00:00:00.000Z', channelId)],
    }));
    const loaded = await loadProtestArtistMore('billy-simons-jr', {
      getSongs: async () => [song()],
      getUploads,
    });
    expect(getUploads).toHaveBeenCalledWith(BILLY);
    expect(getUploads.mock.calls[0]?.[0]).not.toContain('http');
    expect(loaded.recent[0]?.voice.title).toBe('Billy Simons Jr.');
    expect(loaded.recent[0]?.voice.slug).toBe('billy-simons-jr');
    expect(loaded.recent[0]?.voice.homeUrl).toBe(BILLY_PROFILE);
    expect(loaded.recent[0]?.url).toBe('https://www.youtube.com/watch?v=ddddddddddd');
    expect(loaded.uploads).toMatchObject({ status: 'ok', source: 'rss', rssReason: null });
    expect(loaded.recent[0]?.isDiscoveredUpload).toBe(true);
    expect(
      uploadsDisplayStatus({
        uploads: loaded.uploads,
        receivedRecentCount: loaded.recent.length,
        matchedRecentCount: loaded.recent.length,
        settledRecentCount: loaded.recent.length,
        renderedRecentCount: loaded.recent.length,
      }),
    ).toBe('ok');
    expect(belongsToArtist(loaded.recent[0], 'swoozy')).toBe(false);
    expect(belongsToArtist(loaded.recent[0], 'billy-simons-jr')).toBe(true);
  });

  it('keeps the sidebar caps and still shows curated tracks when uploads are unavailable', () => {
    const recent = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'].map((id, index) =>
      upload(id, `2026-0${index + 1}-01T00:00:00.000Z`),
    );
    const featured = ['eeeeeeeeeee', 'fffffffffff', 'ggggggggggg', 'hhhhhhhhhhh'].map((id) =>
      song({ id, url: `https://www.youtube.com/watch?v=${id}`, title: id }),
    );
    expect(limitRelatedSections(recent, featured, 4)).toMatchObject({
      recent: recent.slice(0, 3),
      featured: featured.slice(0, 1),
    });
    expect(limitRelatedSections(recent, featured, 6)).toMatchObject({
      recent: recent.slice(0, 4),
      featured: featured.slice(0, 2),
    });
    expect(limitRelatedSections([], featured, 4).featured).toHaveLength(4);
    expect(limitRelatedSections([], featured, 4).recent).toEqual([]);
    expect(limitRelatedSections(recent, [], 4).recent).toHaveLength(4);
  });
});

describe('player more-from request', () => {
  it('loads protest music by artist slug and leaves other creators on their existing requests', () => {
    const protest = creatorMoreRequest({
      sourceType: 'protest-music',
      isProtestMusic: true,
      voice: { slug: 'Billy-Simons-Jr', title: 'Billy Simons Jr.', homeUrl: BILLY_PROFILE },
    });
    expect(protest).toEqual({
      kind: 'protest-music',
      url: '/api/voices-more?bucket=protest-music&artist=billy-simons-jr',
    });
    expect(protest?.url).not.toContain('channel');
    expect(protest?.url).not.toContain('http');

    expect(
      creatorMoreRequest({
        sourceType: 'voices',
        voice: { slug: 'pakman', title: 'Pakman' },
      }),
    ).toEqual({ kind: 'voice', url: '/api/voices-more?slug=pakman' });
    expect(
      creatorMoreRequest({
        sourceType: 'curated-videos',
        isCurated: true,
        voice: { slug: 'curated-videos', title: 'Curated Videos' },
      })?.url,
    ).toBe('/api/voices-more?bucket=curated');
  });
});

function listingDocument(channelId: string, videoId: string, title: string, when = '2 weeks ago') {
  return {
    metadata: { channelMetadataRenderer: { title: 'Billy Simons Jr.', externalId: channelId } },
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          { tabRenderer: { title: 'Home', content: { richGridRenderer: { contents: [] } } } },
          {
            tabRenderer: {
              selected: true,
              content: {
                richGridRenderer: {
                  contents: [
                    {
                      richItemRenderer: {
                        content: {
                          lockupViewModel: {
                            contentId: videoId,
                            contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
                            metadata: {
                              lockupMetadataViewModel: {
                                title: { content: title },
                                metadata: {
                                  contentMetadataViewModel: {
                                    metadataRows: [{ metadataParts: [{ text: { content: when } }] }],
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
}

describe('channel listing fallback', () => {
  const now = Date.parse('2026-10-26T00:00:00.000Z');

  it('reads videos from the verified channel and ignores a different channel', () => {
    const parsed = parseChannelListing(listingDocument(BILLY, 'Vt4mnFn6Mxx', 'The Sheep Song (Now Streaming)'), {
      expectedChannelId: BILLY,
      now,
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.items[0]).toMatchObject({
      title: 'The Sheep Song (Now Streaming)',
      url: 'https://www.youtube.com/watch?v=Vt4mnFn6Mxx',
      channelId: BILLY,
      publishedAt: '2026-10-12T00:00:00.000Z',
    });

    const other = parseChannelListing(listingDocument(TOPIC, 'Vt4mnFn6Mxx', 'Not Billy'), {
      expectedChannelId: BILLY,
      now,
    });
    expect(other.ok).toBe(false);
    expect(other.reason).toBe('channel_mismatch');
    expect(other.items).toEqual([]);

    const unavailable = parseChannelListing(
      { alerts: [{ alertRenderer: { text: { simpleText: 'This channel is not available.' } } }] },
      { expectedChannelId: DAWN, now },
    );
    expect(unavailable.ok).toBe(false);
    expect(unavailable.reason).toBe('channel_unavailable');

    const titled = parseChannelListing(listingDocument(BILLY, 'abcdefghijk', 'If a tree fell \uFFFC'), {
      expectedChannelId: BILLY,
      now,
    });
    expect(titled.items[0]?.title).toBe('If a tree fell');
  });

  it('uses the channel listing when the uploads RSS fails, and keeps a valid RSS result', async () => {
    const fetchListing = vi.fn(async () => {
      const parsed = parseChannelListing(listingDocument(BILLY, 'Vt4mnFn6Mxx', 'The Sheep Song (Now Streaming)'), {
        expectedChannelId: BILLY,
        now,
      });
      return parsed;
    });
    const failedRss = await resolveVerifiedUploads(BILLY, {
      fetchFeed: async () => ({ items: [], ok: false, reason: 'http_404' }),
      fetchListing,
    });
    expect(fetchListing).toHaveBeenCalledWith(BILLY);
    expect(failedRss.source).toBe('channel_listing');
    expect(failedRss.rssReason).toBe('http_404');
    expect(failedRss.items[0]?.title).toBe('The Sheep Song (Now Streaming)');

    const fetchListingUnused = vi.fn();
    const liveRss = await resolveVerifiedUploads(BILLY, {
      fetchFeed: async () => ({
        ok: true,
        items: [upload('ddddddddddd', '2026-10-01T00:00:00.000Z')],
        feed: billyFeed,
      }),
      fetchListing: fetchListingUnused,
    });
    expect(fetchListingUnused).not.toHaveBeenCalled();
    expect(liveRss.source).toBe('rss');
    expect(liveRss.items).toHaveLength(1);
  });

  it('reports an empty verified feed, a rejected feed, and a player that dropped accepted uploads', async () => {
    const empty = await loadProtestArtistMore('billy-simons-jr', {
      getSongs: async () => [song()],
      getUploads: async () => ({ feed: billyFeed, items: [], source: 'rss' }),
    });
    expect(empty.uploads).toMatchObject({ status: 'empty', source: 'rss' });
    expect(empty.feedFailed).toBe(false);
    expect(empty.featured).toHaveLength(1);

    const rejected = await loadProtestArtistMore('billy-simons-jr', {
      getSongs: async () => [song()],
      getUploads: async () => ({
        feed: { ...billyFeed, channelId: TOPIC },
        items: [upload('ddddddddddd', '2026-10-01T00:00:00.000Z', TOPIC)],
        source: 'rss',
      }),
    });
    expect(rejected.uploads).toMatchObject({ status: 'rejected', reason: 'channel_mismatch' });
    expect(rejected.recent).toEqual([]);
    expect(rejected.featured).toHaveLength(1);

    expect(
      uploadsDisplayStatus({
        uploads: { status: 'ok', reason: null, source: 'rss', rssReason: null },
        receivedRecentCount: 2,
        matchedRecentCount: 0,
        settledRecentCount: 0,
        renderedRecentCount: 0,
      }),
    ).toBe('not_rendered');
    expect(
      uploadsDisplayStatus({
        uploads: { status: 'upstream_failed', reason: 'http_404', source: null, rssReason: 'http_404' },
        receivedRecentCount: 0,
        matchedRecentCount: 0,
        settledRecentCount: 0,
        renderedRecentCount: 0,
      }),
    ).toBe('upstream_failed');
  });

  it('shows a listing upload that is not one of the curated songs', async () => {
    const loaded = await loadProtestArtistMore('billy-simons-jr', {
      getSongs: async () => [song()],
      getUploads: async () => ({
        source: 'channel_listing',
        rssReason: 'http_404',
        feed: billyFeed,
        items: [
          upload('Vt4mnFn6Mxx', '2026-10-12T00:00:00.000Z'),
          upload('8nxiE-k8SkU', '2026-09-01T00:00:00.000Z'),
        ],
      }),
    });
    expect(loaded.feedFailed).toBe(false);
    expect(loaded.uploads).toMatchObject({ status: 'ok', source: 'channel_listing', rssReason: 'http_404' });
    expect(loaded.recent.map((item) => item.title)).toEqual(['Upload Vt4mnFn6Mxx']);
    expect(loaded.featured.map((item) => item.title)).toEqual(['The Sheep Song']);
    expect(
      uploadsDisplayStatus({
        uploads: loaded.uploads,
        receivedRecentCount: loaded.recent.length,
        matchedRecentCount: 1,
        settledRecentCount: 1,
        renderedRecentCount: 1,
      }),
    ).toBe('ok');
  });
});
