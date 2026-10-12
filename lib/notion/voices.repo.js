import 'server-only';

import { notion } from "./client";
import { notionEnv } from "@/lib/env/notion";
import { unstable_cache } from 'next/cache';
import { createFailureCooldown, isUpstreamFailure, upstreamFailure } from '@/lib/feeds/upstreamResult';
import { assertUpstreamAvailable, noteUpstreamFailure } from '@/lib/feeds/sharedFailureBackoff';

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

export function mapVoice(page) {
  const p = page.properties;

  const title = titleFromTitleProp(p.Title);
  const feedUrl =
    extractUrl(p["Feed URL"]) ??
    extractUrl(p["URL"]) ??
    extractUrl(p["Source URL"]) ??
    extractUrl(p["Channel/Feed URL"]) ??
    null;
  const podcastFeedUrl = extractUrl(p["Podcast Feed URL"]) ?? null;
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
    podcastFeedUrl,
    homeUrl,
    description,
    enabled,
    platform,
  };
}

async function queryVoicePages({ limit } = {}) {
  if (!notion || !VOICES_DB_ID) return [];

  const sorts = [{ property: "Title", direction: "ascending" }];

  if (limit != null && limit > 0) {
    const res = await notion.databases.query({
      database_id: VOICES_DB_ID,
      page_size: Math.min(limit, 100),
      sorts,
    });
    return (res.results ?? []).map(mapVoice);
  }

  const pages = await notion.databases.query({
    database_id: VOICES_DB_ID,
    sorts,
  });

  let results = (pages.results ?? []).map(mapVoice);
  let cursor = pages.next_cursor;

  while (cursor) {
    const res = await notion.databases.query({
      database_id: VOICES_DB_ID,
      start_cursor: cursor,
      page_size: 100,
      sorts,
    });
    results = results.concat((res.results ?? []).map(mapVoice));
    cursor = res.next_cursor;
  }

  return results;
}

function swallowNotionError(label, error, throwOnError) {
  if (throwOnError) throw error;
  if (process.env.NODE_ENV === "development") {
    console.warn(`[${label}] Notion API error:`, error?.message || error);
  }
  return [];
}

/**
 * Enabled Voices with a feed URL. Used by public Voices surfaces and Theme Memory ingest.
 * Missing Notion configuration is an empty directory. An API failure stays empty for
 * ingestion callers; cache builders pass throwOnError so it is not stored as success.
 */
export async function getAllVoices({ limit, throwOnError = false } = {}) {
  try {
    return (await queryVoicePages({ limit })).filter((v) => v.enabled && v.feedUrl);
  } catch (error) {
    return swallowNotionError("getAllVoices", error, throwOnError);
  }
}

/**
 * Enabled Voices including rows with no Feed URL.
 * Used by podcast source discovery so adapter-backed creators and rows with
 * only Podcast Feed URL are not dropped just because Feed URL is empty or YouTube-only.
 */
export async function getEnabledVoices({ limit, throwOnError = false } = {}) {
  try {
    return (await queryVoicePages({ limit })).filter((v) => v.enabled);
  } catch (error) {
    return swallowNotionError("getEnabledVoices", error, throwOnError);
  }
}

const VOICES_REVALIDATE_SECONDS = 300;
const VOICES_DIRECTORY_KEY = 'notion-voices';
const voicesDirectoryCooldown = createFailureCooldown();

async function loadVoiceDirectory({ limit } = {}) {
  await assertUpstreamAvailable(voicesDirectoryCooldown, VOICES_DIRECTORY_KEY);
  try {
    const voices = await getAllVoices({ limit, throwOnError: true });
    voicesDirectoryCooldown.clear();
    return voices;
  } catch (error) {
    if (isUpstreamFailure(error)) throw error;
    console.warn('[notion-voices] directory lookup failed; not caching an empty list');
    const failure = upstreamFailure(VOICES_DIRECTORY_KEY);
    await noteUpstreamFailure(voicesDirectoryCooldown, VOICES_DIRECTORY_KEY, {
      tags: ['notion', 'voices'],
    });
    throw failure;
  }
}

export async function getAllVoicesCached({ limit } = {}) {
  const key = ['notion-voices', limit != null ? String(limit) : 'all'];
  return unstable_cache(() => loadVoiceDirectory({ limit }), key, {
    revalidate: VOICES_REVALIDATE_SECONDS,
    tags: ['notion', 'voices'],
  })();
}

export async function getVoiceBySlug(slug) {
  if (slug == null || String(slug).trim() === "") return null;
  const normalized = String(slug).trim().toLowerCase();
  const voices = await getAllVoicesCached();
  return (
    voices.find((v) => String(v.slug ?? "").trim().toLowerCase() === normalized) ?? null
  );
}
