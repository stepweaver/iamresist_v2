import Parser from "rss-parser";

import {
  forgetLastKnownGood,
  hydrateLastKnownGood,
  recallLastKnownGood,
  rememberLastKnownGood,
} from "./lastKnownGood.js";
import { extractRssMedia } from "./archiveMedia.js";
import { extractFeedImage, inspectFeedItemImage, youtubeThumbFromUrl } from "./feedItemImage.js";

const TIMEOUT_MS = 12000;
const REVALIDATE_SECONDS = 300;

/**
 * YouTube channel RSS (`youtube.com/feeds/videos.xml`) is known to return
 * intermittent HTTP 404 even for valid channel IDs (hl/gl query params do
 * not fix this). Treat 404, 429, 5xx, timeouts, and network errors as
 * transient for YouTube RSS only — never as a successful empty feed.
 *
 * Background callers retry once after 2s and again after 5s. Interactive
 * callers pass a shorter schedule. Non-YouTube feeds are not retried.
 *
 * YouTube responses are not written to the Next.js fetch cache. A cached
 * 404 would be replayed as the first attempt for the whole revalidate window.
 * Successful parsed items are kept by the caller's cache and by last-known-good.
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
 *   onFailure?: 'empty' | 'snapshot',
 *   youtubeRetry?: boolean | 'if-no-snapshot',
 *   youtubeRetryDelaysMs?: number[],
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
    media: extractRssMedia(it),
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

function attemptDetail(attempts, durationMs) {
  const count = Number(attempts);
  const duration = Number(durationMs);
  const parts = [];
  if (Number.isFinite(count) && count > 0) parts.push(`attempts=${count}`);
  if (Number.isFinite(duration) && duration >= 0) parts.push(`durationMs=${duration}`);
  return parts.length ? parts.join(" ") : null;
}

function logYoutubeRssRetry(status, attempt) {
  console.warn("[fetchFeedItems] YouTube RSS transient failure; retrying", {
    status,
    attempt,
  });
}

/**
 * GET a feed URL. YouTube RSS retries transient upstream failures with the
 * caller's bounded schedule. YouTube attempts always bypass the Next.js fetch
 * cache so a 404 cannot be stored and replayed. Other feeds keep the caller's
 * revalidate / cache-tag options on the first attempt.
 *
 * @param {string} url
 * @param {{
 *   nextOpts: { revalidate: number, tags?: string[] },
 *   youtubeRss: boolean,
 *   sleep?: (ms: number) => Promise<void>,
 *   retryDelays?: number[],
 * }} opts
 * @returns {Promise<{ res: Response | null, error: unknown, reason: string | null, attempts: number, durationMs: number }>}
 */
async function fetchFeedHttp(url, { nextOpts, youtubeRss, sleep, retryDelays }) {
  const delays = Array.isArray(retryDelays) ? retryDelays : YOUTUBE_RSS_RETRY_DELAYS_MS;
  const maxAttempts = youtubeRss ? 1 + delays.length : 1;
  const wait = typeof sleep === "function" ? sleep : defaultSleep;
  const started = Date.now();
  let lastError = null;
  let lastReason = "request_failed";
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const res = await fetch(url, {
        ...(youtubeRss || attempt > 1 ? { cache: "no-store" } : { next: nextOpts }),
        headers: FEED_REQUEST_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) {
        return { res, error: null, reason: null, attempts, durationMs: Date.now() - started };
      }

      lastReason = `http_${res.status}`;
      lastError = null;
      const canRetry =
        youtubeRss && attempt < maxAttempts && isYoutubeRssTransientHttpStatus(res.status);
      if (!canRetry) {
        return { res, error: null, reason: lastReason, attempts, durationMs: Date.now() - started };
      }

      logYoutubeRssRetry(res.status, attempt);
      await wait(delays[attempt - 1]);
    } catch (err) {
      lastError = err;
      lastReason = "request_failed";
      const canRetry = youtubeRss && attempt < maxAttempts;
      if (!canRetry) {
        return { res: null, error: err, reason: lastReason, attempts, durationMs: Date.now() - started };
      }

      logYoutubeRssRetry("network_error", attempt);
      await wait(delays[attempt - 1]);
    }
  }

  return { res: null, error: lastError, reason: lastReason, attempts, durationMs: Date.now() - started };
}

function feedSnapshotKey(normalized) {
  return `rss-feed:${normalized}`;
}

function failedFetchResult(normalized, reason, error = null, attemptInfo = null) {
  const detail = [attemptDetail(attemptInfo?.attempts, attemptInfo?.durationMs)].filter(Boolean);
  if (reason === "request_failed") {
    const message = error instanceof Error ? error.message : error ? String(error) : "";
    if (message) detail.push(message);
    logFeedIssue(normalized, "request_failed", detail.join(" ") || null);
    return { items: [], ok: false, reason: "request_failed" };
  }

  logFeedIssue(normalized, reason, detail.join(" ") || null);
  return { items: [], ok: false, reason };
}

async function withFailureSnapshot(failed, normalized, { onFailure, limit }) {
  if (onFailure !== "snapshot") return failed;
  const key = feedSnapshotKey(normalized);
  await hydrateLastKnownGood(key);
  const snap = recallLastKnownGood(key);
  if (!Array.isArray(snap) || snap.length === 0) return failed;
  const cap = Number(limit);
  const items = Number.isFinite(cap) && cap >= 0 ? snap.slice(0, cap) : snap.slice();
  console.warn("[fetchFeedItems] served last known good after upstream failure", {
    items: items.length,
    reason: failed.reason,
  });
  return {
    items,
    ok: false,
    reason: "upstream_failed_used_snapshot",
    stale: true,
  };
}

function rememberSuccessfulFeed(normalized, items) {
  const key = feedSnapshotKey(normalized);
  if (Array.isArray(items) && items.length > 0) rememberLastKnownGood(key, items);
  else forgetLastKnownGood(key);
}

/**
 * Returns items plus fetch status so callers can distinguish
 * a real empty feed from a failed fetch/parsing path.
 *
 * @param {string} feedUrl
 * @param {FeedFetchOptions} [opts]
 */
export async function fetchFeedItemsWithMeta(feedUrl, {
  limit = 3,
  tags,
  sleep,
  onFailure = "empty",
  youtubeRetry = true,
  youtubeRetryDelaysMs,
} = {}) {
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

  const youtubeRss = isYoutubeRssUrl(normalized);
  const snapshotKey = feedSnapshotKey(normalized);
  if (youtubeRss && onFailure === "snapshot") await hydrateLastKnownGood(snapshotKey);
  const skipRetryForSnapshot =
    youtubeRetry === "if-no-snapshot" && Array.isArray(recallLastKnownGood(snapshotKey));
  const allowYoutubeRetry = youtubeRss && youtubeRetry !== false && !skipRetryForSnapshot;

  const { res, error, reason, attempts, durationMs } = await fetchFeedHttp(normalized, {
    nextOpts,
    youtubeRss: allowYoutubeRetry,
    sleep,
    retryDelays: youtubeRetryDelaysMs,
  });
  const attemptInfo = { attempts, durationMs };

  if (!res || !res.ok) {
    return withFailureSnapshot(
      failedFetchResult(normalized, reason || "request_failed", error, attemptInfo),
      normalized,
      { onFailure, limit },
    );
  }

  try {
    const xml = await res.text();

    if (!xml) {
      logFeedIssue(normalized, "empty_body", attemptDetail(attempts, durationMs));
      return withFailureSnapshot({ items: [], ok: false, reason: "empty_body" }, normalized, { onFailure, limit });
    }

    if (looksLikeHtml(xml)) {
      logFeedIssue(normalized, "html_body", attemptDetail(attempts, durationMs));
      return withFailureSnapshot({ items: [], ok: false, reason: "html_body" }, normalized, { onFailure, limit });
    }

    if (!xml.includes("<rss") && !xml.includes("<feed")) {
      logFeedIssue(normalized, "non_feed_body", attemptDetail(attempts, durationMs));
      return withFailureSnapshot({ items: [], ok: false, reason: "non_feed_body" }, normalized, {
        onFailure,
        limit,
      });
    }

    const feed = await parser.parseString(xml);
    const items = (feed.items ?? []).slice(0, limit).map(mapItem);
    rememberSuccessfulFeed(normalized, items);

    return {
      items,
      ok: true,
      reason: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logFeedIssue(normalized, "request_failed", [attemptDetail(attempts, durationMs), message].filter(Boolean).join(" "));
    return withFailureSnapshot({ items: [], ok: false, reason: "request_failed" }, normalized, { onFailure, limit });
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
