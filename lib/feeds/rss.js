import Parser from "rss-parser";

import { extractFeedImage, inspectFeedItemImage, youtubeThumbFromUrl } from "./feedItemImage.js";

const TIMEOUT_MS = 12000;
const REVALIDATE_SECONDS = 300;

/**
 * YouTube channel RSS (`youtube.com/feeds/videos.xml`) is known to return
 * intermittent HTTP 404 even for valid channel IDs (hl/gl query params do
 * not fix this). Treat 404, 429, 5xx, timeouts, and network errors as
 * transient for YouTube RSS only — never as a successful empty feed.
 *
 * Bounded retries: 1 immediate attempt, then wait 2s, then wait 5s
 * (3 attempts max). Non-YouTube feeds are not retried, including ordinary 4xx.
 *
 * @type {readonly [2000, 5000]}
 */
export const YOUTUBE_RSS_RETRY_DELAYS_MS = Object.freeze([2000, 5000]);

const parser = new Parser({
  timeout: TIMEOUT_MS,
  customFields: {
    item: [
      "published",
      "updated",
      "dc:date",
      ["content:encoded", "content:encoded"],
      ["media:thumbnail", "media:thumbnail", { keepArray: true }],
      ["media:content", "media:content", { keepArray: true }],
    ],
  },
});

const FEED_REQUEST_HEADERS = {
  Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "iamresist.org RSS Fetcher",
};

export { youtubeThumbFromUrl } from "./feedItemImage.js";

/**
 * @typedef {{
 *   limit?: number,
 *   tags?: string[],
 *   sleep?: (ms: number) => Promise<void>,
 * }} FeedFetchOptions
 */

function parseItemDate(it) {
  const raw = it.isoDate ?? it.pubDate ?? it.published ?? it.updated ?? it["dc:date"] ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function looksLikeHtml(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
}

/**
 * True for YouTube's public channel/user Atom RSS endpoint.
 * Other youtube.com URLs (watch pages, channel HTML) are not RSS.
 *
 * @param {string} url
 */
export function isYoutubeRssUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "youtube.com") return false;
    const path = parsed.pathname.replace(/\/+$/, "");
    return path === "/feeds/videos.xml";
  } catch {
    return false;
  }
}

function isYoutubeRssTransientHttpStatus(status) {
  if (status === 404 || status === 429) return true;
  return status >= 500 && status <= 599;
}

function defaultSleep(ms) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function normalizeFeedUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (isYoutubeRssUrl(withProto)) {
    try {
      const u = new URL(withProto);
      u.searchParams.set("hl", "en");
      u.searchParams.set("gl", "US");
      return u.toString();
    } catch {
      return withProto;
    }
  }
  return withProto;
}

function mapItem(it) {
  const link = it.link || it.links?.[0]?.href || "";
  const fromFeed = extractFeedImage(it) || null;
  const image = fromFeed || youtubeThumbFromUrl(link) || null;

  return {
    id: it.guid || it.id || link,
    title: it.title || "",
    url: link,
    sourceId: it.guid || it.id || null,
    publishedAt: parseItemDate(it),
    author: it.creator || it.author || "",
    description: it.contentSnippet || it.summary || it.description || "",
    image,
    categories: Array.isArray(it.categories) ? it.categories.filter(Boolean) : [],
  };
}

function mapAuditItem(it) {
  const link = it.link || it.links?.[0]?.href || "";
  const feedImageAudit = inspectFeedItemImage(it);
  const image = feedImageAudit.image || youtubeThumbFromUrl(link) || null;

  return {
    id: it.guid || it.id || link,
    title: it.title || "",
    url: link,
    sourceId: it.guid || it.id || null,
    publishedAt: parseItemDate(it),
    author: it.creator || it.author || "",
    description: it.contentSnippet || it.summary || it.description || "",
    image,
    categories: Array.isArray(it.categories) ? it.categories.filter(Boolean) : [],
    imageAudit: {
      ...feedImageAudit,
      youtubeFallbackImage: youtubeThumbFromUrl(link) || null,
    },
  };
}

function logFeedIssue(feedUrl, reason, detail = null) {
  const suffix = detail ? ` (${detail})` : "";
  console.warn(`[fetchFeedItems] ${reason}: ${feedUrl}${suffix}`);
}

function logYoutubeRssRetry(status, attempt) {
  console.warn("[fetchFeedItems] YouTube RSS transient failure; retrying", {
    status,
    attempt,
  });
}

function youtubeRssMaxAttempts() {
  return 1 + YOUTUBE_RSS_RETRY_DELAYS_MS.length;
}

/**
 * GET a feed URL. YouTube RSS retries transient upstream failures with
 * bounded backoff. Retry attempts bypass the Next.js fetch cache so a
 * cached 404 cannot satisfy the retry. The first attempt keeps the
 * caller's revalidate / cache-tag options.
 *
 * @param {string} url
 * @param {{
 *   nextOpts: { revalidate: number, tags?: string[] },
 *   youtubeRss: boolean,
 *   sleep?: (ms: number) => Promise<void>,
 * }} opts
 * @returns {Promise<{ res: Response | null, error: unknown, reason: string | null }>}
 */
async function fetchFeedHttp(url, { nextOpts, youtubeRss, sleep }) {
  const maxAttempts = youtubeRss ? youtubeRssMaxAttempts() : 1;
  const wait = typeof sleep === "function" ? sleep : defaultSleep;
  let lastError = null;
  let lastReason = "request_failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...(attempt > 1 ? { cache: "no-store" } : { next: nextOpts }),
        headers: FEED_REQUEST_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) {
        return { res, error: null, reason: null };
      }

      lastReason = `http_${res.status}`;
      lastError = null;
      const canRetry =
        youtubeRss && attempt < maxAttempts && isYoutubeRssTransientHttpStatus(res.status);
      if (!canRetry) {
        return { res, error: null, reason: lastReason };
      }

      logYoutubeRssRetry(res.status, attempt);
      await wait(YOUTUBE_RSS_RETRY_DELAYS_MS[attempt - 1]);
    } catch (err) {
      lastError = err;
      lastReason = "request_failed";
      const canRetry = youtubeRss && attempt < maxAttempts;
      if (!canRetry) {
        return { res: null, error: err, reason: lastReason };
      }

      logYoutubeRssRetry("network_error", attempt);
      await wait(YOUTUBE_RSS_RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  return { res: null, error: lastError, reason: lastReason };
}

function failedFetchResult(normalized, reason, error = null) {
  if (reason === "request_failed") {
    const message = error instanceof Error ? error.message : error ? String(error) : "";
    logFeedIssue(normalized, "request_failed", message || null);
    return { items: [], ok: false, reason: "request_failed" };
  }

  logFeedIssue(normalized, reason);
  return { items: [], ok: false, reason };
}

/**
 * Returns items plus fetch status so callers can distinguish
 * a real empty feed from a failed fetch/parsing path.
 *
 * @param {string} feedUrl
 * @param {FeedFetchOptions} [opts]
 */
export async function fetchFeedItemsWithMeta(feedUrl, { limit = 3, tags, sleep } = {}) {
  if (!feedUrl) {
    return { items: [], ok: false, reason: "missing_feed_url" };
  }

  const normalized = normalizeFeedUrl(feedUrl);
  if (!normalized) {
    return { items: [], ok: false, reason: "invalid_feed_url" };
  }

  const nextOpts = { revalidate: REVALIDATE_SECONDS };
  if (Array.isArray(tags) && tags.length > 0) {
    nextOpts.tags = tags;
  }

  const { res, error, reason } = await fetchFeedHttp(normalized, {
    nextOpts,
    youtubeRss: isYoutubeRssUrl(normalized),
    sleep,
  });

  if (!res || !res.ok) {
    return failedFetchResult(normalized, reason || "request_failed", error);
  }

  try {
    const xml = await res.text();

    if (!xml) {
      logFeedIssue(normalized, "empty_body");
      return { items: [], ok: false, reason: "empty_body" };
    }

    if (looksLikeHtml(xml)) {
      logFeedIssue(normalized, "html_body");
      return { items: [], ok: false, reason: "html_body" };
    }

    if (!xml.includes("<rss") && !xml.includes("<feed")) {
      logFeedIssue(normalized, "non_feed_body");
      return { items: [], ok: false, reason: "non_feed_body" };
    }

    const feed = await parser.parseString(xml);
    const items = (feed.items ?? []).slice(0, limit).map(mapItem);

    return {
      items,
      ok: true,
      reason: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logFeedIssue(normalized, "request_failed", message);
    return { items: [], ok: false, reason: "request_failed" };
  }
}

/**
 * @param {string} feedUrl
 * @param {FeedFetchOptions} [opts]
 */
export async function fetchFeedItems(feedUrl, opts = {}) {
  const result = await fetchFeedItemsWithMeta(feedUrl, opts);
  return result.items;
}

/**
 * @param {string} feedUrl
 * @param {FeedFetchOptions} [opts]
 */
export async function fetchFeedItemsForAudit(feedUrl, { limit = 3, tags, sleep } = {}) {
  if (!feedUrl) return [];
  const normalized = normalizeFeedUrl(feedUrl);
  if (!normalized) return [];

  const nextOpts = { revalidate: REVALIDATE_SECONDS };
  if (Array.isArray(tags) && tags.length > 0) {
    nextOpts.tags = tags;
  }

  try {
    const { res } = await fetchFeedHttp(normalized, {
      nextOpts,
      youtubeRss: isYoutubeRssUrl(normalized),
      sleep,
    });
    if (!res?.ok) return [];

    const xml = await res.text();
    if (!xml || looksLikeHtml(xml)) return [];
    if (!xml.includes("<rss") && !xml.includes("<feed")) return [];

    const feed = await parser.parseString(xml);
    return (feed.items ?? []).slice(0, limit).map(mapAuditItem);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fetchFeedItemsForAudit] Failed:", normalized, err?.message || err);
    }
    return [];
  }
}
