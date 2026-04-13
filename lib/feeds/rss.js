import Parser from "rss-parser";

import { extractFeedImage, youtubeThumbFromUrl } from "./feedItemImage.js";

const TIMEOUT_MS = 12000;
const REVALIDATE_SECONDS = 300;

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

export { youtubeThumbFromUrl } from "./feedItemImage.js";

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

function normalizeFeedUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (withProto.includes("youtube.com/feeds/videos.xml")) {
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
  };
}

export async function fetchFeedItems(feedUrl, { limit = 3, tags } = {}) {
  if (!feedUrl) return [];
  const normalized = normalizeFeedUrl(feedUrl);
  if (!normalized) return [];

  const nextOpts = { revalidate: REVALIDATE_SECONDS };
  if (Array.isArray(tags) && tags.length > 0) {
    nextOpts.tags = tags;
  }

  try {
    const res = await fetch(normalized, {
      next: nextOpts,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "iamresist.org RSS Fetcher",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const xml = await res.text();
    if (!xml || looksLikeHtml(xml)) return [];

    if (!xml.includes("<rss") && !xml.includes("<feed")) return [];

    const feed = await parser.parseString(xml);
    return (feed.items ?? []).slice(0, limit).map(mapItem);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fetchFeedItems] Failed:", normalized, err?.message || err);
    }
    return [];
  }
}
