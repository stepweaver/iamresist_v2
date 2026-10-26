import { isAnonymousTopicLabel, YOUTUBE_CHANNEL_ID } from '@/lib/protestMusic/youtubeChannel';

/** Public web client version observed to return the channel videos tab. */
const BROWSE_CLIENT_VERSION = '2.20261023.01.00';
/** Channel "Videos" tab. The uploads RSS stays the primary source. */
const VIDEOS_TAB_PARAMS = 'EgZ2aWRlb3PyBgQKAjoA';
const LISTING_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
const LISTING_LIMIT = 12;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const UNIT_MS = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

function listingFailure(reason) {
  return { ok: false, reason, items: [], feed: null };
}

function httpReason(status) {
  if (status === 404) return 'http_404';
  if (status === 429) return 'http_429';
  if (status >= 500 && status <= 599) return 'http_5xx';
  return 'listing_unavailable';
}

function collectText(node, out, depth = 0) {
  if (node == null || depth > 6 || out.length > 16) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) collectText(entry, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  if (typeof node.content === 'string') out.push(node.content);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectText(value, out, depth + 1);
  }
}

export function publishedAtFromRelative(text, now, index = 0) {
  const match = String(text || '').match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  const base = Number.isFinite(now) ? now : Date.now();
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    return new Date(base - amount * UNIT_MS[unit]).toISOString();
  }
  return new Date(base - Math.max(0, index) * 1000).toISOString();
}

function videoGrid(doc) {
  const tabs = doc?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  if (!Array.isArray(tabs)) return [];
  const grids = [];
  for (const tab of tabs) {
    const renderer = tab?.tabRenderer;
    const contents = renderer?.content?.richGridRenderer?.contents;
    if (!Array.isArray(contents)) continue;
    grids.push({ selected: renderer?.selected === true, contents });
  }
  const withVideos = grids.find((grid) =>
    grid.contents.some((entry) => entry?.richItemRenderer?.content?.lockupViewModel?.contentId),
  );
  const chosen = withVideos || grids.find((grid) => grid.selected) || grids[0];
  return chosen?.contents || [];
}

function cleanText(value) {
  return String(value || '')
    .replace(/[\uFFFC\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function channelUnavailable(doc) {
  const alerts = Array.isArray(doc?.alerts) ? doc.alerts : [];
  return alerts.some((alert) => /not available/i.test(alert?.alertRenderer?.text?.simpleText || ''));
}

function listingItem(entry, channelId, now, index) {
  const view = entry?.richItemRenderer?.content?.lockupViewModel;
  const videoId = typeof view?.contentId === 'string' ? view.contentId.trim() : '';
  if (!VIDEO_ID.test(videoId)) return null;
  if (view.contentType && view.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  const metadata = view.metadata?.lockupMetadataViewModel || {};
  const title = cleanText(metadata.title?.content).slice(0, 200);
  const texts = [];
  collectText(metadata.metadata, texts);
  const relative = texts.find((text) => /\bago\b/i.test(text)) || '';
  return {
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    sourceId: `yt:video:${videoId}`,
    publishedAt: publishedAtFromRelative(relative, now, index),
    channelId,
  };
}

/**
 * Parse the public channel videos tab.
 * The channel id has to be the one we asked for. Recommended videos from
 * other shelves are not read.
 */
export function parseChannelListing(doc, { expectedChannelId, now = Date.now() } = {}) {
  const meta = doc?.metadata?.channelMetadataRenderer || {};
  const channelId = typeof meta.externalId === 'string' ? meta.externalId.trim() : '';
  const title = cleanText(meta.title);
  const feed = channelId || title ? { title, author: title, channelId } : null;
  if (channelUnavailable(doc)) return { ...listingFailure('channel_unavailable'), feed };
  if (!expectedChannelId || !YOUTUBE_CHANNEL_ID.test(expectedChannelId)) {
    return listingFailure('invalid_channel');
  }
  if (!channelId) return { ...listingFailure('missing_identity'), feed };
  if (channelId !== expectedChannelId) return { ...listingFailure('channel_mismatch'), feed };
  if (isAnonymousTopicLabel(title)) return { ...listingFailure('anonymous_topic'), feed };
  const items = [];
  for (const entry of videoGrid(doc)) {
    const item = listingItem(entry, channelId, now, items.length);
    if (!item) continue;
    items.push(item);
    if (items.length >= LISTING_LIMIT) break;
  }
  return { ok: true, reason: null, items, feed };
}

/**
 * One request for the verified channel's videos tab.
 * Used only after the uploads RSS feed fails. No retries here.
 */
export async function fetchChannelListing(channelId, { fetchImpl, now } = {}) {
  if (!YOUTUBE_CHANNEL_ID.test(channelId || '')) return listingFailure('invalid_channel');
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  try {
    const res = await doFetch(LISTING_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'User-Agent': 'iamresist.org RSS Fetcher',
      },
      body: JSON.stringify({
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            clientName: 'WEB',
            clientVersion: BROWSE_CLIENT_VERSION,
          },
        },
        browseId: channelId,
        params: VIDEOS_TAB_PARAMS,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res?.ok) return listingFailure(httpReason(res?.status));
    const doc = await res.json();
    return parseChannelListing(doc, { expectedChannelId: channelId, now });
  } catch {
    return listingFailure('request_failed');
  }
}
