import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import pLimit from "p-limit";
import { getAllVoicesCached, getVoiceBySlug } from "@/lib/notion/voices.repo";
import { fetchFeedItemsWithMeta } from "@/lib/feeds/rss";
import { readThroughLastKnownGood } from "@/lib/feeds/lastKnownGood";
import { assertUpstreamAvailable, clearSharedFailure, noteUpstreamFailure } from "@/lib/feeds/sharedFailureBackoff";
import { createFailureCooldown, isUpstreamFailure, upstreamFailure } from "@/lib/feeds/upstreamResult";
import { timeAsync } from "@/lib/ops/perfTiming";
import { getYoutubeVideoId } from "@/lib/utils/youtube";
import {
  invalidFeedConfig,
  isConfiguredFeedUrl,
  isInvalidFeedFetchReasonList,
  isVerifiedArchiveVideo,
} from "@/lib/feeds/archiveMedia";

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

const homepageVoicesCooldown = createFailureCooldown();
const archiveVoicesCooldown = createFailureCooldown();
const slugVoicesCooldowns = new Map();
const MAX_SLUG_COOLDOWNS = 32;
const CREATOR_KEY_MAX = 64;

/**
 * Shared marker, local cooldown, and last-known-good key for one creator.
 * The slug is normalized and length-capped so one failure cannot use another
 * creator's key and a raw query string cannot grow the key without bound.
 */
function creatorFailureKey(slug) {
  const cleaned = String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return "";
  if (cleaned.length <= CREATOR_KEY_MAX) return `voices-slug:${cleaned}`;
  const digest = createHash("sha256").update(cleaned).digest("hex").slice(0, 8);
  const head = cleaned.slice(0, CREATOR_KEY_MAX - 9).replace(/-+$/g, "");
  return `voices-slug:${head}-${digest}`;
}

function cooldownForSlug(slug) {
  let cooldown = slugVoicesCooldowns.get(slug);
  if (!cooldown) {
    if (slugVoicesCooldowns.size >= MAX_SLUG_COOLDOWNS) {
      const oldest = slugVoicesCooldowns.keys().next().value;
      slugVoicesCooldowns.delete(oldest);
    }
    cooldown = createFailureCooldown();
    slugVoicesCooldowns.set(slug, cooldown);
  }
  return cooldown;
}

const VOICE_FEED_FETCH = {
  onFailure: "snapshot",
  youtubeRetry: "if-no-snapshot",
  // One immediate follow-up when this process has no saved feed.
  // Background callers keep the longer YouTube schedule in rss.js.
  youtubeRetryDelaysMs: [0],
};

const VOICE_REFRESH_FETCH = {
  onFailure: "snapshot",
  youtubeRetry: false,
};

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

/** Prefer YouTube ID when present (same video in multiple feeds). */
function dedupeByYoutubeOrUrl(items) {
  const seen = new Set();
  const out = [];

  for (const it of items) {
    const ytId = getYoutubeVideoId(it.url, it.sourceId);
    const key = ytId ? `yt:${ytId}` : it.url ? `url:${normalizeUrl(it.url)}` : it.id || null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }

  return out;
}

function sortByPublishedDesc(items) {
  return [...items].sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
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
  const { attemptedCount, successCount, failureCount, emptyCount, itemCount, staleCount = 0 } = summary;

  if (failureCount === 0 && itemCount > 0) {
    return;
  }

  console.warn(
    `[${label}] attempted=${attemptedCount} ok=${successCount} empty=${emptyCount} failed=${failureCount} stale=${staleCount} items=${itemCount}`
  );
}

async function fetchVoicesItems(voices, perVoiceLimit, tagPrefix = "voices", fetchOptions = VOICE_FEED_FETCH) {
  const limiter = pLimit(tagPrefix === "voices-archive" ? CONCURRENCY_ARCHIVE : CONCURRENCY_HOME);

  const results = await Promise.all(
    voices.map((voice) =>
      limiter(async () => {
        const slugTag = voice.slug || voice.id || "unknown";
        const result = await fetchFeedItemsWithMeta(voice.feedUrl, {
          limit: perVoiceLimit,
          tags: ["voices-feed", `${tagPrefix}:${slugTag}`],
          ...fetchOptions,
        });

        return {
          voice,
          ok: result.ok,
          stale: Boolean(result.stale),
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
    staleCount: results.filter((result) => result.stale).length,
    failureReasons: results.filter((result) => !result.ok).map((result) => result.reason || "request_failed"),
  };
}

function archiveFeedsFailedWithoutVideos(result, videos) {
  return result.attemptedCount > 0 && result.failureCount === result.attemptedCount && videos.length === 0;
}

function archiveUsedOnlyStaleVideos(result, videos) {
  return result.successCount === 0 && result.staleCount > 0 && videos.length > 0;
}

async function throwArchiveFeedFailure(result, failureKey, cooldown, tags, partial) {
  if (isInvalidFeedFetchReasonList(result.failureReasons)) {
    throw invalidFeedConfig(failureKey);
  }
  const err = upstreamFailure(failureKey, { failureCount: result.failureCount });
  if (Array.isArray(partial) && partial.length > 0) err.partial = partial;
  await noteUpstreamFailure(cooldown, failureKey, {
    tags,
    partial: err.partial,
  });
  throw err;
}

async function loadVoiceDirectory(cooldown, failureKey, tags) {
  try {
    return await getAllVoicesCached();
  } catch (err) {
    if (isUpstreamFailure(err)) throw err;
    console.warn(`[${failureKey}] voice directory failed; not caching an empty list`);
    const failure = upstreamFailure(failureKey);
    await noteUpstreamFailure(cooldown, failureKey, { tags });
    throw failure;
  }
}

async function buildHomepageVoicesPool() {
  await assertUpstreamAvailable(homepageVoicesCooldown, "voices-homepage");

  const voices = await loadVoiceDirectory(homepageVoicesCooldown, "voices-homepage", [
    "voices-feed",
    "voices-homepage-feed",
  ]);
  if (!voices.length) return [];

  const result = await timeAsync(
    "voices-aggregation",
    () => fetchVoicesItems(voices, ITEMS_PER_VOICE_HOME, "voices-home"),
    { scope: "home" }
  );
  logVoicesSummary("voices-home", {
    ...result,
    itemCount: result.items.length,
  });

  if (result.attemptedCount > 0 && result.failureCount === result.attemptedCount && result.items.length === 0) {
    console.warn("[voices-homepage] upstream failed; not caching an empty pool", {
      failureCount: result.failureCount,
    });
    const err = upstreamFailure("voices-homepage", { failureCount: result.failureCount });
    await noteUpstreamFailure(homepageVoicesCooldown, "voices-homepage", {
      tags: ["voices-feed", "voices-homepage-feed"],
    });
    throw err;
  }

  homepageVoicesCooldown.clear();
  const capped = capItemsPerVoice(result.items, MAX_PER_VOICE_HOME);
  const deduped = dedupeByYoutubeOrUrl(capped);
  const sorted = sortByPublishedDesc(deduped);

  return sorted.slice(0, HOMEPAGE_MAX_VOICE_ITEMS);
}

export async function getHomepageVoicesFeed(limit = 8) {
  const pool = await getHomepageVoicesPool();
  return limitOnePerCreator(pool, limit);
}

async function buildArchiveVoicesFeed() {
  await assertUpstreamAvailable(archiveVoicesCooldown, "voices-archive");

  const voices = await loadVoiceDirectory(archiveVoicesCooldown, "voices-archive", ["voices-feed"]);
  if (!voices.length) return [];

  const result = await timeAsync(
    "voices-aggregation",
    () => fetchVoicesItems(voices, GLOBAL_PER_VOICE_LIMIT, "voices-archive"),
    { scope: "archive" }
  );
  logVoicesSummary("voices-archive", {
    ...result,
    itemCount: result.items.length,
  });

  const videos = result.items.filter(isVerifiedArchiveVideo);
  if (archiveFeedsFailedWithoutVideos(result, videos) || archiveUsedOnlyStaleVideos(result, videos)) {
    console.warn("[voices-archive] upstream failed; not caching an empty feed", {
      failureCount: result.failureCount,
      staleCount: result.staleCount,
      videoCount: videos.length,
    });
    await throwArchiveFeedFailure(result, "voices-archive", archiveVoicesCooldown, ["voices-feed"], videos);
  }

  archiveVoicesCooldown.clear();

  const deduped = dedupeByYoutubeOrUrl(videos);
  const sorted = sortByPublishedDesc(deduped);
  const slice = sorted.slice(0, GLOBAL_MAX_ITEMS);

  return interleaveAcrossVoices(slice);
}

async function releaseCreatorCooldown(failureKey) {
  cooldownForSlug(failureKey).clear();
  await clearSharedFailure(failureKey);
}

async function buildVoiceArchiveFeedBySlug(slug, { refresh = false } = {}) {
  const failureKey = creatorFailureKey(slug);
  if (!failureKey) return [];
  const cooldown = cooldownForSlug(failureKey);
  if (refresh) await releaseCreatorCooldown(failureKey);
  else await assertUpstreamAvailable(cooldown, failureKey);

  let voice;
  try {
    voice = await getVoiceBySlug(slug);
  } catch (err) {
    if (isUpstreamFailure(err)) throw err;
    console.warn(`[${failureKey}] voice directory failed; not caching an empty list`);
    const failure = upstreamFailure(failureKey);
    await noteUpstreamFailure(cooldown, failureKey, { tags: ["voices-feed"] });
    throw failure;
  }
  if (!voice || !isConfiguredFeedUrl(voice.feedUrl)) {
    throw invalidFeedConfig(failureKey);
  }

  const result = await fetchVoicesItems(
    [voice],
    GLOBAL_PER_VOICE_LIMIT,
    "voices-archive",
    refresh ? VOICE_REFRESH_FETCH : VOICE_FEED_FETCH,
  );
  const videos = result.items.filter(isVerifiedArchiveVideo);
  if (result.failureCount > 0 || result.emptyCount > 0 || videos.length === 0) {
    console.warn(`[${failureKey}] feed read`, {
      ok: result.successCount,
      failed: result.failureCount,
      empty: result.emptyCount,
      stale: result.staleCount,
      parsed: result.items.length,
      videos: videos.length,
      reasons: result.failureReasons,
    });
  }
  if (archiveFeedsFailedWithoutVideos(result, videos) || archiveUsedOnlyStaleVideos(result, videos)) {
    await throwArchiveFeedFailure(result, failureKey, cooldown, ["voices-feed"], videos);
  }

  cooldown.clear();
  const deduped = dedupeByYoutubeOrUrl(videos);

  return sortByPublishedDesc(deduped);
}

function cacheKey(name) {
  return ["voices-feed", name];
}

/** Raw homepage pool (RSS voices only), before per-creator limit. */
export async function getHomepageVoicesPool() {
  return readThroughLastKnownGood("voices-homepage-pool", () =>
    unstable_cache(buildHomepageVoicesPool, cacheKey("homepage-pool-v6"), {
      revalidate: REVALIDATE,
      tags: ["voices-feed", "voices-homepage-feed"],
    })()
  );
}

export async function getVoicesFeed() {
  return readThroughLastKnownGood("voices-archive-feed", () =>
    unstable_cache(buildArchiveVoicesFeed, cacheKey("archive-interleave-v5"), {
      revalidate: REVALIDATE,
      tags: ["voices-feed"],
    })()
  );
}

export async function getVoicesFeedBySlug(slug, { refresh = false } = {}) {
  if (slug == null || String(slug).trim() === "") return [];
  const normalized = String(slug).trim().toLowerCase();
  const failureKey = creatorFailureKey(normalized);
  if (!failureKey) return [];

  if (refresh) await releaseCreatorCooldown(failureKey);

  const load = refresh
    ? () => buildVoiceArchiveFeedBySlug(normalized, { refresh: true })
    : () =>
        unstable_cache(() => buildVoiceArchiveFeedBySlug(normalized), cacheKey(`voice-archive-${normalized}`), {
          revalidate: REVALIDATE,
          tags: ["voices-feed", failureKey],
        })();

  // A 200 with no videos is a real empty channel. A failed read throws instead.
  return readThroughLastKnownGood(failureKey, load, { authoritativeEmpty: true });
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