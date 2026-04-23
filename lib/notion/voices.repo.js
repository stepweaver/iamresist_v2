import 'server-only';

import { notion } from "./client";
import { notionEnv } from "@/lib/env/notion";
import { unstable_cache } from 'next/cache';

const VOICES_DB_ID = notionEnv.NOTION_VOICES_DB_ID;

function textFromRichText(rt) {
  return (rt?.rich_text ?? []).map((t) => t.plain_text).join("");
}

function titleFromTitleProp(tp) {
  return tp?.title?.[0]?.plain_text ?? "";
}

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractUrl(prop) {
  if (!prop) return null;
  if (prop.url) return prop.url;
  if (prop.rich_text?.length) return prop.rich_text.map((t) => t.plain_text).join("").trim() || null;
  return null;
}

function mapVoice(page) {
  const p = page.properties;

  const title = titleFromTitleProp(p.Title);
  const feedUrl =
    extractUrl(p["Feed URL"]) ??
    extractUrl(p["URL"]) ??
    extractUrl(p["Source URL"]) ??
    extractUrl(p["Channel/Feed URL"]) ??
    null;
  const homeUrl = extractUrl(p["Main URL"]) ?? extractUrl(p["Home URL"]) ?? extractUrl(p["Website"]) ?? null;
  const description = p.Description ? textFromRichText(p.Description) : "";
  const enabled = p.Enabled?.checkbox ?? true;
  const platform = p.Platform?.select?.name ?? null;

  const explicitSlug = p["Voice Slug"]
    ? textFromRichText(p["Voice Slug"]).trim()
    : "";

  const slug = explicitSlug ? explicitSlug.toLowerCase() : slugify(title);

  return {
    id: page.id,
    title,
    slug,
    feedUrl,
    homeUrl,
    description,
    enabled,
    platform,
  };
}

export async function getAllVoices({ limit, requireFeedUrl = true } = {}) {
  if (!notion || !VOICES_DB_ID) return [];

  try {
    const hardLimit = typeof limit === 'object' ? limit.limit : limit;

    if (hardLimit != null && hardLimit > 0) {
      const res = await notion.databases.query({
        database_id: VOICES_DB_ID,
        page_size: Math.min(hardLimit, 100),
        sorts: [{ property: "Title", direction: "ascending" }],
      });
      return (res.results ?? [])
        .map(mapVoice)
        .filter((v) => v.enabled && (requireFeedUrl ? v.feedUrl : true));
    }

    const pages = await notion.databases.query({
      database_id: VOICES_DB_ID,
      sorts: [{ property: "Title", direction: "ascending" }],
    });

    let results = (pages.results ?? [])
      .map(mapVoice)
      .filter((v) => v.enabled && (requireFeedUrl ? v.feedUrl : true));
    let cursor = pages.next_cursor;

    while (cursor) {
      const res = await notion.databases.query({
        database_id: VOICES_DB_ID,
        start_cursor: cursor,
        page_size: 100,
        sorts: [{ property: "Title", direction: "ascending" }],
      });
      results = results.concat(
        (res.results ?? [])
          .map(mapVoice)
          .filter((v) => v.enabled && (requireFeedUrl ? v.feedUrl : true))
      );
      cursor = res.next_cursor;
    }

    return results;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getAllVoices] Notion API error:", error?.message || error);
    }
    return [];
  }
}

const VOICES_REVALIDATE_SECONDS = 300;

export async function getAllVoicesCached({ limit, requireFeedUrl = true } = {}) {
  const key = [
    'notion-voices',
    requireFeedUrl ? 'feed-only' : 'all-enabled',
    limit != null ? String(limit) : 'all',
  ];
  return unstable_cache(() => getAllVoices({ limit, requireFeedUrl }), key, {
    revalidate: VOICES_REVALIDATE_SECONDS,
    tags: ['notion', 'voices'],
  })();
}

export async function getVoiceBySlug(slug) {
  if (slug == null || String(slug).trim() === "") return null;
  const normalized = String(slug).trim().toLowerCase();
  const voices = await getAllVoicesCached({ requireFeedUrl: false });
  return (
    voices.find((v) => String(v.slug ?? "").trim().toLowerCase() === normalized) ?? null
  );
}
