import { describe, expect, it } from 'vitest';

import { formatPodcastFeedsReport } from '@/lib/creatorNotes/format';
import {
  diagnosePodcastFeeds,
  feedUrlsForVoice,
  listPodcastSources,
  loadPodcastCatalog,
  podcastFeedsForVoice,
  voiceLooksPodcastCapable,
} from '@/lib/creatorNotes/podcastCatalog';
import { isPodcastVoiceFeedUrl, selectPodcastSourceEpisodes } from '@/lib/creatorNotes/podcastIdentity';
import { mapVoice } from '@/lib/notion/voices.repo';
import type { PodcastEpisodeSource } from '@/lib/creatorNotes/types';

const NOW = new Date('2026-09-18T10:32:00.000Z');

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function episode(overrides: Partial<PodcastEpisodeSource> = {}): PodcastEpisodeSource {
  return {
    sourceItemId: 'guid-ep',
    creatorId: 'david-pakman',
    creatorName: 'David Pakman',
    feedUrl: 'https://feeds.megaphone.fm/example',
    guid: 'guid-ep',
    title: 'Episode',
    episodeUrl: 'https://creator.example/episodes/x',
    audioUrl: 'https://creator.example/audio/x.mp3',
    publishedAt: hoursAgo(1),
    transcriptCandidates: [],
    ...overrides,
  };
}

const RSS_WITH_AUDIO = `<?xml version="1.0"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <item>
      <title>Audio Episode</title>
      <guid>brennan-audio</guid>
      <pubDate>Thu, 17 Sep 2026 12:00:00 GMT</pubDate>
      <link>https://brennancenter.substack.com/p/audio</link>
      <enclosure url="https://brennancenter.example/ep.mp3" type="audio/mpeg" />
    </item>
    <item>
      <title>Text Only</title>
      <guid>brennan-text</guid>
      <pubDate>Fri, 18 Sep 2026 12:00:00 GMT</pubDate>
      <link>https://brennancenter.substack.com/p/text</link>
    </item>
  </channel>
</rss>`;

const RSS_WITH_TRANSCRIPT = `<?xml version="1.0"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <item>
      <title>Megaphone Episode</title>
      <guid>pakman-audio</guid>
      <pubDate>Fri, 18 Sep 2026 15:00:00 GMT</pubDate>
      <enclosure url="https://megaphone.example/ep.mp3" type="audio/mpeg" />
      <podcast:transcript url="https://megaphone.example/ep.vtt" type="text/vtt" language="en" rel="captions" />
    </item>
  </channel>
</rss>`;

const RSS_NEWSLETTER = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Newsletter Post</title>
      <guid>pakman-substack</guid>
      <pubDate>Fri, 18 Sep 2026 16:00:00 GMT</pubDate>
      <link>https://substack.davidpakman.com/p/post</link>
    </item>
  </channel>
</rss>`;

describe('podcast source discovery', () => {
  it('treats YouTube channel RSS as not a podcast feed URL', () => {
    expect(isPodcastVoiceFeedUrl('https://www.youtube.com/feeds/videos.xml?channel_id=abc')).toBe(false);
    expect(isPodcastVoiceFeedUrl('https://brennancenter.substack.com/feed')).toBe(true);
  });

  it('includes a non-YouTube Voice Feed URL and Pakman official adapter feeds', () => {
    expect(
      feedUrlsForVoice({
        title: 'The Briefing - Brennan Center for Justice',
        slug: 'the-briefing-brennan-center-for-justice',
        feedUrl: 'https://brennancenter.substack.com/feed',
        platform: 'Substack',
      }),
    ).toEqual(['https://brennancenter.substack.com/feed']);

    const pakman = feedUrlsForVoice({
      title: 'David Pakman',
      slug: 'david-pakman',
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCvixJtaXuNdMPUGdOPcY8Ag',
      homeUrl: 'https://davidpakman.com/',
      platform: 'YouTube',
    });
    expect(pakman).toContain('https://feeds.megaphone.fm/SHHWD4599743349');
    expect(pakman).toContain('https://substack.davidpakman.com/feed');
    expect(pakman.some((url) => url.includes('youtube.com'))).toBe(false);
  });

  it('does not invent feeds for YouTube-only voices', () => {
    const voice = {
      title: 'Brian Tyler Cohen',
      slug: 'brian-tyler-cohen',
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQANb2YPwAtK-IQJrLaaUFw',
      homeUrl: 'https://www.youtube.com/@briantylercohen',
      platform: 'YouTube',
    };
    expect(voiceLooksPodcastCapable(voice)).toBe(false);
    expect(feedUrlsForVoice(voice)).toEqual([]);
  });

  it('loads every non-YouTube registry feed, not only adapter extras', async () => {
    const xmlByUrl: Record<string, string> = {
      'https://brennancenter.substack.com/feed': RSS_WITH_AUDIO,
      'https://feeds.megaphone.fm/SHHWD4599743349': RSS_WITH_TRANSCRIPT,
      'https://substack.davidpakman.com/feed': RSS_NEWSLETTER,
    };
    const episodes = await loadPodcastCatalog({
      listVoices: async () => [
        {
          title: 'David Pakman',
          slug: 'david-pakman',
          feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCvixJtaXuNdMPUGdOPcY8Ag',
          platform: 'YouTube',
        },
        {
          title: 'The Briefing - Brennan Center for Justice',
          slug: 'the-briefing-brennan-center-for-justice',
          feedUrl: 'https://brennancenter.substack.com/feed',
          platform: 'Substack',
        },
        {
          title: 'Brian Tyler Cohen',
          slug: 'brian-tyler-cohen',
          feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQANb2YPwAtK-IQJrLaaUFw',
          platform: 'YouTube',
        },
      ],
      fetchFeedXml: async (url) => {
        const xml = xmlByUrl[url];
        if (!xml) throw new Error(`unexpected feed ${url}`);
        return xml;
      },
    });
    const creators = new Set(episodes.map((row) => row.creatorId));
    expect(creators.has('david-pakman')).toBe(true);
    expect(creators.has('the-briefing-brennan-center-for-justice')).toBe(true);
    expect(creators.has('brian-tyler-cohen')).toBe(false);
  });

  it('does not let a high-volume newsletter hide another registry podcast', () => {
    const pakman = Array.from({ length: 20 }, (_, i) =>
      episode({
        sourceItemId: `pakman-${i}`,
        guid: `pakman-${i}`,
        title: `Pakman ${i}`,
        creatorId: 'david-pakman',
        creatorName: 'David Pakman',
        audioUrl: null,
        publishedAt: hoursAgo(i),
      }),
    );
    const briefing = episode({
      sourceItemId: 'brennan-1',
      guid: 'brennan-1',
      creatorId: 'the-briefing-brennan-center-for-justice',
      creatorName: 'The Briefing - Brennan Center for Justice',
      title: 'The Briefing episode',
      audioUrl: 'https://brennancenter.example/ep.mp3',
      publishedAt: hoursAgo(40),
    });
    const selected = selectPodcastSourceEpisodes([...pakman, briefing], 20);
    expect(selected.some((row) => row.creatorId === 'the-briefing-brennan-center-for-justice')).toBe(true);
    expect(selected.some((row) => row.creatorId === 'david-pakman')).toBe(true);
  });

  it('lists a second creator even when Pakman Substack items are newest', async () => {
    const xmlByUrl: Record<string, string> = {
      'https://brennancenter.substack.com/feed': RSS_WITH_AUDIO,
      'https://feeds.megaphone.fm/SHHWD4599743349': RSS_WITH_TRANSCRIPT,
      'https://substack.davidpakman.com/feed': RSS_NEWSLETTER,
    };
    const rows = await listPodcastSources(
      { limit: 5 },
      {
        listVoices: async () => [
          {
            title: 'David Pakman',
            slug: 'david-pakman',
            feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=abc',
            platform: 'YouTube',
          },
          {
            title: 'The Briefing - Brennan Center for Justice',
            slug: 'the-briefing-brennan-center-for-justice',
            feedUrl: 'https://brennancenter.substack.com/feed',
            platform: 'Substack',
          },
        ],
        fetchFeedXml: async (url) => xmlByUrl[url],
      },
    );
    const creators = new Set(rows.map((row) => row.creatorId));
    expect(creators.has('the-briefing-brennan-center-for-justice')).toBe(true);
    expect(rows.some((row) => row.audioUrlPresent)).toBe(true);
  });

  it('reports fetch failures instead of pretending the feed does not exist', async () => {
    const report = await diagnosePodcastFeeds({
      listVoices: async () => [
        {
          title: 'The Briefing - Brennan Center for Justice',
          slug: 'the-briefing-brennan-center-for-justice',
          feedUrl: 'https://brennancenter.substack.com/feed',
          homeUrl: 'https://brennancenter.substack.com/feed',
          platform: 'Substack',
        },
      ],
      fetchFeedXml: async () => {
        throw new Error('http_404');
      },
    });
    expect(report.podcastCapableCount).toBe(1);
    expect(report.feedsMissingOrFailed).toBe(1);
    expect(report.sources[0]?.feeds[0]).toMatchObject({
      feedUrl: 'https://brennancenter.substack.com/feed',
      origin: 'notion_feed',
      fetched: false,
      status: 'fetch_error',
      error: 'http_404',
    });
  });

  it('counts audio enclosures and podcast:transcript independently', async () => {
    const report = await diagnosePodcastFeeds({
      listVoices: async () => [
        {
          title: 'David Pakman',
          slug: 'david-pakman',
          feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=abc',
          platform: 'YouTube',
        },
      ],
      fetchFeedXml: async (url) => {
        if (url.includes('megaphone')) return RSS_WITH_TRANSCRIPT;
        return RSS_NEWSLETTER;
      },
    });
    const megaphone = report.sources[0]?.feeds.find((feed) => feed.feedUrl.includes('megaphone'));
    const substack = report.sources[0]?.feeds.find((feed) => feed.feedUrl.includes('substack'));
    expect(megaphone).toMatchObject({
      origin: 'legacy_adapter',
      fetched: true,
      status: 'ok',
      entryCount: 1,
      audioEnclosureCount: 1,
      podcastTranscriptCount: 1,
    });
    expect(substack).toMatchObject({
      fetched: true,
      status: 'ok',
      entryCount: 1,
      audioEnclosureCount: 0,
      podcastTranscriptCount: 0,
    });
    expect(formatPodcastFeedsReport(report)).toContain('https://feeds.megaphone.fm/SHHWD4599743349');
    expect(formatPodcastFeedsReport(report)).toContain('origin=legacy_adapter');
    expect(formatPodcastFeedsReport(report)).toContain('podcast:transcript=1');
  });

  it('maps Notion Podcast Feed URL without replacing Feed URL', () => {
    const voice = mapVoice({
      id: 'page-btc',
      properties: {
        Title: { title: [{ plain_text: 'Brian Tyler Cohen' }] },
        'Voice Slug': { rich_text: [{ plain_text: 'brian-tyler-cohen' }] },
        'Feed URL': { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQANb2YPwAtK-IQJrLaaUFw' },
        'Podcast Feed URL': { url: 'https://feeds.megaphone.fm/btc-show' },
        'Main URL': { url: 'https://www.youtube.com/@briantylercohen' },
        Platform: { select: { name: 'YouTube' } },
        Enabled: { checkbox: true },
      },
    });
    expect(voice.feedUrl).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCQANb2YPwAtK-IQJrLaaUFw');
    expect(voice.podcastFeedUrl).toBe('https://feeds.megaphone.fm/btc-show');
  });

  it('maps a missing Podcast Feed URL as null', () => {
    const voice = mapVoice({
      id: 'page-no-podcast',
      properties: {
        Title: { title: [{ plain_text: 'YouTube Only' }] },
        'Feed URL': { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=abc' },
        Enabled: { checkbox: true },
      },
    });
    expect(voice.feedUrl).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=abc');
    expect(voice.podcastFeedUrl).toBeNull();
  });

  it('uses Podcast Feed URL alongside a YouTube Feed URL', () => {
    const voice = {
      title: 'Brian Tyler Cohen',
      slug: 'brian-tyler-cohen',
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQANb2YPwAtK-IQJrLaaUFw',
      podcastFeedUrl: 'https://feeds.megaphone.fm/btc-show',
      platform: 'YouTube',
    };
    expect(feedUrlsForVoice(voice)).toEqual(['https://feeds.megaphone.fm/btc-show']);
    expect(podcastFeedsForVoice(voice)).toEqual([
      { feedUrl: 'https://feeds.megaphone.fm/btc-show', origin: 'notion_podcast_feed' },
    ]);
    expect(voiceLooksPodcastCapable(voice)).toBe(true);
    expect(voice.feedUrl).toContain('youtube.com/feeds/videos.xml');
  });

  it('keeps a podcast-only Feed URL as origin notion_feed', () => {
    const voice = {
      title: 'The Briefing - Brennan Center for Justice',
      slug: 'the-briefing-brennan-center-for-justice',
      feedUrl: 'https://brennancenter.substack.com/feed',
      podcastFeedUrl: null,
      platform: 'Substack',
    };
    expect(podcastFeedsForVoice(voice)).toEqual([
      { feedUrl: 'https://brennancenter.substack.com/feed', origin: 'notion_feed' },
    ]);
  });

  it('leaves a YouTube-only voice without a podcast feed', () => {
    const voice = {
      title: 'Brian Tyler Cohen',
      slug: 'brian-tyler-cohen',
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQANb2YPwAtK-IQJrLaaUFw',
      podcastFeedUrl: null,
      homeUrl: 'https://www.youtube.com/@briantylercohen',
      platform: 'YouTube',
    };
    expect(voiceLooksPodcastCapable(voice)).toBe(false);
    expect(feedUrlsForVoice(voice)).toEqual([]);
  });

  it('keeps legacy adapter feeds when Podcast Feed URL is absent', () => {
    const feeds = podcastFeedsForVoice({
      title: 'David Pakman',
      slug: 'david-pakman',
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCvixJtaXuNdMPUGdOPcY8Ag',
      podcastFeedUrl: null,
      homeUrl: 'https://davidpakman.com/',
      platform: 'YouTube',
    });
    expect(feeds).toEqual([
      { feedUrl: 'https://feeds.megaphone.fm/SHHWD4599743349', origin: 'legacy_adapter' },
      { feedUrl: 'https://substack.davidpakman.com/feed', origin: 'legacy_adapter' },
    ]);
  });

  it('dedupes when Podcast Feed URL and Feed URL resolve to the same feed', () => {
    const feeds = podcastFeedsForVoice({
      title: 'The Briefing - Brennan Center for Justice',
      slug: 'the-briefing-brennan-center-for-justice',
      feedUrl: 'https://www.brennancenter.substack.com/feed/',
      podcastFeedUrl: 'https://brennancenter.substack.com/feed',
      platform: 'Substack',
    });
    expect(feeds).toEqual([
      { feedUrl: 'https://brennancenter.substack.com/feed', origin: 'notion_podcast_feed' },
    ]);
  });

  it('dedupes a Podcast Feed URL that matches a legacy adapter feed', () => {
    const feeds = podcastFeedsForVoice({
      title: 'David Pakman',
      slug: 'david-pakman',
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=abc',
      podcastFeedUrl: 'https://feeds.megaphone.fm/SHHWD4599743349/',
      platform: 'YouTube',
    });
    const megaphone = feeds.filter((feed) => feed.feedUrl.includes('megaphone'));
    expect(megaphone).toHaveLength(1);
    expect(megaphone[0]).toMatchObject({
      feedUrl: 'https://feeds.megaphone.fm/SHHWD4599743349/',
      origin: 'notion_podcast_feed',
    });
    expect(feeds.some((feed) => feed.origin === 'legacy_adapter' && feed.feedUrl.includes('substack'))).toBe(true);
  });

  it('discovers Podcast Feed URL episodes without crowding out other creators', async () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => {
      const n = 12 - i;
      return `
    <item>
      <title>BTC ${n}</title>
      <guid>btc-${n}</guid>
      <pubDate>Fri, ${n} Sep 2026 12:00:00 GMT</pubDate>
      <enclosure url="https://btc.example/ep-${n}.mp3" type="audio/mpeg" />
    </item>`;
    }).join('');
    const btcRss = `<?xml version="1.0"?><rss version="2.0"><channel>${manyItems}</channel></rss>`;
    const rows = await listPodcastSources(
      { limit: 5 },
      {
        listVoices: async () => [
          {
            title: 'Brian Tyler Cohen',
            slug: 'brian-tyler-cohen',
            feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=abc',
            podcastFeedUrl: 'https://feeds.megaphone.fm/btc-show',
            platform: 'YouTube',
          },
          {
            title: 'The Briefing - Brennan Center for Justice',
            slug: 'the-briefing-brennan-center-for-justice',
            feedUrl: 'https://brennancenter.substack.com/feed',
            platform: 'Substack',
          },
        ],
        fetchFeedXml: async (url) => {
          if (url === 'https://feeds.megaphone.fm/btc-show') return btcRss;
          if (url === 'https://brennancenter.substack.com/feed') return RSS_WITH_AUDIO;
          throw new Error(`unexpected feed ${url}`);
        },
      },
    );
    const creators = new Set(rows.map((row) => row.creatorId));
    expect(creators.has('brian-tyler-cohen')).toBe(true);
    expect(creators.has('the-briefing-brennan-center-for-justice')).toBe(true);
  });

  it('labels Podcast Feed URL origin in the feeds report', async () => {
    const report = await diagnosePodcastFeeds({
      listVoices: async () => [
        {
          title: 'Brian Tyler Cohen',
          slug: 'brian-tyler-cohen',
          feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=abc',
          podcastFeedUrl: 'https://feeds.megaphone.fm/btc-show',
          platform: 'YouTube',
        },
      ],
      fetchFeedXml: async () => RSS_WITH_TRANSCRIPT,
    });
    expect(report.sources[0]?.configuredFeedUrl).toContain('youtube.com');
    expect(report.sources[0]?.configuredPodcastFeedUrl).toBe('https://feeds.megaphone.fm/btc-show');
    expect(report.sources[0]?.feeds).toHaveLength(1);
    expect(report.sources[0]?.feeds[0]).toMatchObject({
      feedUrl: 'https://feeds.megaphone.fm/btc-show',
      origin: 'notion_podcast_feed',
    });
    expect(formatPodcastFeedsReport(report)).toContain('origin=notion_podcast_feed');
    expect(formatPodcastFeedsReport(report)).toContain('podcast feed: https://feeds.megaphone.fm/btc-show');
  });
});
