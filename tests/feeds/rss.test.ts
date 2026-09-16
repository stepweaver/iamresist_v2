import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchFeedItemsWithMeta,
  isYoutubeRssUrl,
  YOUTUBE_RSS_RETRY_DELAYS_MS,
} from '@/lib/feeds/rss.js';

const YT_CHANNEL_RSS =
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCvixJtaXuNdMPUGdOPcY8Ag';
const NON_YT_RSS = 'https://example.com/feed.xml';

const YOUTUBE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>David Pakman Show - YouTube</title>
  <entry>
    <id>yt:video:abcdefghijk</id>
    <title>Test episode</title>
    <link href="https://www.youtube.com/watch?v=abcdefghijk"/>
    <published>2026-09-15T12:00:00+00:00</published>
    <author><name>David Pakman Show</name></author>
  </entry>
</feed>`;

function okFeedResponse() {
  return new Response(YOUTUBE_ATOM, {
    status: 200,
    headers: { 'content-type': 'application/atom+xml' },
  });
}

function statusResponse(status: number, body = 'not found') {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

function timeoutError() {
  const err = new Error('The operation was aborted due to timeout');
  err.name = 'TimeoutError';
  return err;
}

function mockSleep() {
  return vi.fn<(ms: number) => Promise<void>>(async () => {});
}

describe('YouTube RSS URL detection', () => {
  it('detects channel RSS and ignores non-RSS YouTube URLs', () => {
    expect(isYoutubeRssUrl(YT_CHANNEL_RSS)).toBe(true);
    expect(isYoutubeRssUrl('https://youtube.com/feeds/videos.xml?user=pakman')).toBe(true);
    expect(isYoutubeRssUrl('www.youtube.com/feeds/videos.xml?channel_id=abc')).toBe(true);
    expect(isYoutubeRssUrl('https://www.youtube.com/channel/UCvixJtaXuNdMPUGdOPcY8Ag')).toBe(false);
    expect(isYoutubeRssUrl(NON_YT_RSS)).toBe(false);
    expect(isYoutubeRssUrl('')).toBe(false);
  });
});

describe('fetchFeedItemsWithMeta YouTube RSS retries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries a YouTube 404 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(404))
      .mockResolvedValueOnce(okFeedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const sleep = mockSleep();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchFeedItemsWithMeta(YT_CHANNEL_RSS, { sleep });

    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('Test episode');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(YOUTUBE_RSS_RETRY_DELAYS_MS[0]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ next: { revalidate: 300 } });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ cache: 'no-store' });
    expect(warn.mock.calls.some((args) => String(args[0]).includes('retrying'))).toBe(true);
    expect(warn.mock.calls.some((args) => String(args[0]).includes('http_404'))).toBe(false);
  });

  it('fails after a bounded number of YouTube 404s and does not retry forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(404, '<html>nope</html>'));
    vi.stubGlobal('fetch', fetchMock);
    const sleep = mockSleep();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchFeedItemsWithMeta(YT_CHANNEL_RSS, { sleep });

    expect(result).toEqual({ items: [], ok: false, reason: 'http_404' });
    expect(fetchMock).toHaveBeenCalledTimes(1 + YOUTUBE_RSS_RETRY_DELAYS_MS.length);
    expect(sleep.mock.calls.map((args) => args[0])).toEqual([...YOUTUBE_RSS_RETRY_DELAYS_MS]);
    const retryLogs = warn.mock.calls.filter((args) => String(args[0]).includes('retrying'));
    const finalLogs = warn.mock.calls.filter((args) => String(args[0]).includes('http_404'));
    expect(retryLogs).toHaveLength(YOUTUBE_RSS_RETRY_DELAYS_MS.length);
    expect(finalLogs).toHaveLength(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('<html>nope</html>');
  });

  it('retries a YouTube 500 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(500))
      .mockResolvedValueOnce(okFeedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const sleep = mockSleep();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchFeedItemsWithMeta(YT_CHANNEL_RSS, { sleep });

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(YOUTUBE_RSS_RETRY_DELAYS_MS[0]);
  });

  it('retries a timeout/network error then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(okFeedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const sleep = mockSleep();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchFeedItemsWithMeta(YT_CHANNEL_RSS, { sleep });

    expect(result.ok).toBe(true);
    expect(result.items[0]?.title).toBe('Test episode');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not apply YouTube retry behavior to an ordinary non-YouTube 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(404));
    vi.stubGlobal('fetch', fetchMock);
    const sleep = mockSleep();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchFeedItemsWithMeta(NON_YT_RSS, { sleep });

    expect(result).toEqual({ items: [], ok: false, reason: 'http_404' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(warn.mock.calls.some((args) => String(args[0]).includes('YouTube RSS'))).toBe(false);
  });

  it('does not retry a successful first YouTube request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okFeedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const sleep = mockSleep();

    const result = await fetchFeedItemsWithMeta(YT_CHANNEL_RSS, {
      limit: 3,
      tags: ['theme-memory-feed'],
      sleep,
    });

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 300, tags: ['theme-memory-feed'] },
    });
  });
});
