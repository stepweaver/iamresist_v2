import "server-only";
import { unstable_cache } from "next/cache";
import pLimit from "p-limit";
import { getAllVoicesCached, getVoiceBySlug } from "@/lib/notion/voices.repo";
import { fetchFeedItemsWithMeta } from "@/lib/feeds/rss";
import { getCanonicalVideoKey, getTikTokVideoId, getYoutubeVideoId } from "@/lib/utils/videoPlatform";
import { manualTikTokItems } from "@/lib/voicesManualTikTokItems";

const CONCURRENCY_HOME = 3;
const CONCURRENCY_ARCHIVE = 6;
const REVALIDATE = 300;

/** Homepage pool */
const ITEMS_PER_VOICE_HOME = 4;
const MAX_PER_VOICE_HOME = 3;
const HOMEPAGE_MAX_VOICE_ITEMS = 18;

/** Archive / full intel page */
const GLOBAL_PER_VOICE_LIMIT = 20;
const GLOBAL_MAX_ITEMS = 600;

function itemTimestamp(item) {
  const raw = item?.publishedAt ?? item?.createdTime ?? null;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function toFeedItem(item, voice) {
  return {
    ...item,
    voice: {
      id: voice.id,
      title: voice.title,
      slug: voice.slug,
      homeUrl: voice.homeUrl,
      platform: voice.platform,
    },
    sourceType: "voices",
  };
}

function normalizeUrl(u) {
  if (!u || typeof u !== "string") return "";
  try {
    const url = new URL(u);
    url.hash = "";
    url.search = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

/** Prefer canonical platform key when present (same video in multiple feeds). */
function dedupeByVideoKey(items) {
  const seen = new Set();
  const out = [];

  for (const it of items) {
    const key =
      getCanonicalVideoKey(it.url, it.sourceId) ??
      (it.url ? `url:${normalizeUrl(it.url)}` : it.id || null);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }

  return out;
}

function sortByPublishedDesc(items) {
  return [...items].sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
}

function sanitizeManualTikTokItems(voices) {
  if (!Array.isArray(manualTikTokItems) || manualTikTokItems.length === 0) return [];
  const bySlug = new Map(voices.map((v) => [String(v.slug || "").trim().toLowerCase(), v]));

  const out = [];
  for (const raw of manualTikTokItems) {
    const voiceSlug = String(raw?.voiceSlug || "").trim().toLowerCase();
    const url = typeof raw?.url === "string" ? raw.url.trim() : "";
    if (!voiceSlug || !url) continue;
    const voice = bySlug.get(voiceSlug);
    if (!voice) continue;

    // Hard allowlist: canonical TikTok URLs only (no shortlinks, no redirects).
    const postId = getTikTokVideoId(url, null);
    if (!postId) continue;

    out.push(
      toFeedItem(
        {
          id: `voices-tt:${voiceSlug}:${postId}`,
          sourceId: `tt:video:${postId}`,
          title: typeof raw?.title === "string" ? raw.title.trim() : "",
          url,
          publishedAt: typeof raw?.publishedAt === "string" ? raw.publishedAt : null,
          createdTime: null,
          description: "",
        },
        voice
      )
    );
  }

  return out;
}

/** Cap how many items each voice contributes before global merge. */
function capItemsPerVoice(items, maxPerVoice) {
  const byVoice = new Map();

  for (const it of items) {
    const voiceId = it.voice?.id || it.voice?.slug || "unknown";
    const list = byVoice.get(voiceId) || [];
    list.push(it);
    list.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
    byVoice.set(voiceId, list.slice(0, maxPerVoice));
  }

  return Array.from(byVoice.values()).flat();
}

/** Homepage: at most one slot per voice in display order. */
function limitOnePerCreator(items, limit) {
  const out = [];
  const seen = new Set();

  for (const it of items) {
    const key = it.voice?.slug || it.voice?.id || "unknown";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Fair display order: round-robin across voices so one channel cannot own the top of the list.
 */
function interleaveAcrossVoices(items) {
  const byVoice = new Map();

  for (const it of items) {
    const id = it.voice?.id || it.voice?.slug || "unknown";
    if (!byVoice.has(id)) byVoice.set(id, []);
    byVoice.get(id).push(it);
  }

  const keys = Array.from(byVoice.keys()).sort((a, b) => String(a).localeCompare(String(b)));

  for (const key of keys) {
    byVoice.get(key).sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
  }

  const out = [];
  let round = 0;
  let added = true;

  while (added) {
    added = false;
    const batch = [];

    for (const key of keys) {
      const arr = byVoice.get(key);
      if (arr.length > round) {
        batch.push(arr[round]);
        added = true;
      }
    }

    batch.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
    out.push(...batch);
    round += 1;
  }

  return out;
}

function logVoicesSummary(label, summary) {
  const { attemptedCount, successCount, failureCount, emptyCount, itemCount } = summary;

  if (failureCount === 0 && itemCount > 0) {
    return;
  }

  console.warn(
    `[${label}] attempted=${attemptedCount} ok=${successCount} empty=${emptyCount} failed=${failureCount} items=${itemCount}`
  );
}

async function fetchVoicesItems(voices, perVoiceLimit, tagPrefix = "voices") {
  const limiter = pLimit(tagPrefix === "voices-archive" ? CONCURRENCY_ARCHIVE : CONCURRENCY_HOME);

  const results = await Promise.all(
    voices.map((voice) =>
      limiter(async () => {
        const slugTag = voice.slug || voice.id || "unknown";
        const result = await fetchFeedItemsWithMeta(voice.feedUrl, {
          limit: perVoiceLimit,
          tags: ["voices-feed", `${tagPrefix}:${slugTag}`],
        });

        return {
          voice,
          ok: result.ok,
          reason: result.reason,
          items: (result.items || []).map((item) => toFeedItem(item, voice)),
        };
      })
    )
  );

  const items = results.flatMap((result) => result.items);

  return {
    items,
    attemptedCount: results.length,
    successCount: results.filter((result) => result.ok).length,
    failureCount: results.filter((result) => !result.ok).length,
    emptyCount: results.filter((result) => result.ok && result.items.length === 0).length,
  };
}

async function buildHomepageVoicesPool() {
  const voicesAll = await getAllVoicesCached({ requireFeedUrl: false });
  const voicesWithFeeds = voicesAll.filter((v) => v?.feedUrl);
  const manual = sanitizeManualTikTokItems(voicesAll);
  if (!voicesAll.length && manual.length === 0) return [];

  const result = voicesWithFeeds.length
    ? await fetchVoicesItems(voicesWithFeeds, ITEMS_PER_VOICE_HOME, "voices-home")
    : { items: [], attemptedCount: 0, successCount: 0, failureCount: 0, emptyCount: 0 };
  logVoicesSummary("voices-home", {
    ...result,
    itemCount: result.items.length + manual.length,
  });

  const merged = [...result.items, ...manual];
  const capped = capItemsPerVoice(merged, MAX_PER_VOICE_HOME);
  const deduped = dedupeByVideoKey(capped);
  const sorted = sortByPublishedDesc(deduped);

  return sorted.slice(0, HOMEPAGE_MAX_VOICE_ITEMS);
}

export async function getHomepageVoicesFeed(limit = 8) {
  const pool = await getHomepageVoicesPool();
  return limitOnePerCreator(pool, limit);
}

async function buildArchiveVoicesFeed() {
  const voicesAll = await getAllVoicesCached({ requireFeedUrl: false });
  const voicesWithFeeds = voicesAll.filter((v) => v?.feedUrl);
  const manual = sanitizeManualTikTokItems(voicesAll);
  if (!voicesAll.length && manual.length === 0) return [];

  const result = voicesWithFeeds.length
    ? await fetchVoicesItems(voicesWithFeeds, GLOBAL_PER_VOICE_LIMIT, "voices-archive")
    : { items: [], attemptedCount: 0, successCount: 0, failureCount: 0, emptyCount: 0 };
  logVoicesSummary("voices-archive", {
    ...result,
    itemCount: result.items.length + manual.length,
  });

  const deduped = dedupeByVideoKey([...result.items, ...manual]);
  const sorted = sortByPublishedDesc(deduped);
  const slice = sorted.slice(0, GLOBAL_MAX_ITEMS);

  return interleaveAcrossVoices(slice);
}

async function buildVoiceArchiveFeedBySlug(slug) {
  const voice = await getVoiceBySlug(slug);
  const manual = voice ? sanitizeManualTikTokItems([voice]) : [];
  if (!voice) return manual;

  const result = voice?.feedUrl
    ? await fetchVoicesItems([voice], GLOBAL_PER_VOICE_LIMIT, "voices-archive")
    : { items: [], attemptedCount: 0, successCount: 0, failureCount: 0, emptyCount: 0 };
  const deduped = dedupeByVideoKey([...result.items, ...manual]);

  return sortByPublishedDesc(deduped);
}

function cacheKey(name) {
  return ["voices-feed", name];
}

/** Raw homepage pool (RSS voices only), before per-creator limit. */
export async function getHomepageVoicesPool() {
  return unstable_cache(buildHomepageVoicesPool, cacheKey("homepage-pool-v7"), {
    revalidate: REVALIDATE,
    tags: ["voices-feed", "voices-homepage-feed"],
  })();
}

export async function getVoicesFeed() {
  return unstable_cache(buildArchiveVoicesFeed, cacheKey("archive-interleave-v5"), {
    revalidate: REVALIDATE,
    tags: ["voices-feed"],
  })();
}

export async function getVoicesFeedBySlug(slug) {
  if (slug == null || String(slug).trim() === "") return [];
  const normalized = String(slug).trim().toLowerCase();

  return unstable_cache(() => buildVoiceArchiveFeedBySlug(normalized), cacheKey(`voice-archive-${normalized}`), {
    revalidate: REVALIDATE,
    tags: ["voices-feed"],
  })();
}

export async function getVoicesPage(page = 1, limit = 20) {
  const all = await getVoicesFeed();
  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    items: all.slice(start, end),
    hasMore: end < all.length,
    total: all.length,
  };
}

export async function getRecentVoices(count = 6) {
  return getHomepageVoicesFeed(count);
}