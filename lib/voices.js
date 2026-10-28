import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import pLimit from "p-limit";
import { getAllVoicesCached, getVoiceBySlug } from "@/lib/notion/voices.repo";
import { fetchFeedItemsWithMeta } from "@/lib/feeds/rss";
import {
  forgetLastKnownGood,
  hydrateLastKnownGood,
  readThroughLastKnownGood,
  recallLastKnownGood,
  rememberLastKnownGood,
} from "@/lib/feeds/lastKnownGood";
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
  // Homepage stays on one immediate follow-up. The archive uses the longer
  // schedule below: a second request in the same instant usually gets the same 404.
  youtubeRetryDelaysMs: [0],
};

// Saved snapshots skip these waits. Without one, wait out YouTube's short 404 streak.
const ARCHIVE_FEED_FETCH = {
  onFailure: "snapshot",
  youtubeRetry: "if-no-snapshot",
};

const ARCHIVE_LKG_KEY = "voices-archive-feed";

/** Process-local health for cooldown replays, which throw before a new report exists. */
let latestArchiveReport = null;

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
    creators: results,
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

function archiveConfigIsInvalid(result) {
  // One creator's HTML page must not mark the whole archive invalid while others succeeded
  // or still have a saved feed. Invalid means every live read failed as a bad source.
  if (!isInvalidFeedFetchReasonList(result?.failureReasons)) return false;
  if (result.successCount > 0 || result.staleCount > 0) return false;
  return result.attemptedCount > 0 && result.failureCount === result.attemptedCount;
}

async function throwArchiveFeedFailure(result, failureKey, cooldown, tags, partial, report) {
  const hasRetainedVideos = Array.isArray(partial) && partial.length > 0;
  if (archiveConfigIsInvalid(result) && !hasRetainedVideos) {
    throw invalidFeedConfig(failureKey);
  }
  const err = upstreamFailure(failureKey, { failureCount: result.failureCount });
  if (Array.isArray(partial) && partial.length > 0) err.partial = partial;
  if (report) {
    err.creatorReport = report;
    latestArchiveReport = report;
  }
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

function creatorSlug(voice) {
  return String(voice?.slug || "").trim().toLowerCase();
}

function videosBySlug(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const slug = creatorSlug(item?.voice);
    if (!slug) continue;
    const list = map.get(slug);
    if (list) list.push(item);
    else map.set(slug, [item]);
  }
  return map;
}

function newestPublishedAt(items) {
  let newest = 0;
  for (const item of items || []) {
    const time = itemTimestamp(item);
    if (time > newest) newest = time;
  }
  return newest;
}

/** Keep the list whose newest video is more recent. Equal timestamps keep `primary`. */
function preferNewerVideos(primary, fallback) {
  const next = Array.isArray(primary) ? primary : [];
  const saved = Array.isArray(fallback) ? fallback : [];
  if (!saved.length) return next;
  if (!next.length) return saved;
  return newestPublishedAt(next) >= newestPublishedAt(saved) ? next : saved;
}

function rememberCreatorVideos(slug, videos) {
  const key = creatorFailureKey(slug);
  if (!key || !Array.isArray(videos) || videos.length === 0) return;
  rememberLastKnownGood(key, videos);
}

function forgetCreatorVideos(slug) {
  const key = creatorFailureKey(slug);
  if (key) forgetLastKnownGood(key);
}

async function recallCreatorVideos(slug) {
  const key = creatorFailureKey(slug);
  if (!key) return [];
  await hydrateLastKnownGood(key);
  const saved = recallLastKnownGood(key);
  return Array.isArray(saved) ? saved.filter(isVerifiedArchiveVideo) : [];
}

async function recallArchiveVideos() {
  await hydrateLastKnownGood(ARCHIVE_LKG_KEY);
  const saved = recallLastKnownGood(ARCHIVE_LKG_KEY);
  return Array.isArray(saved) ? saved.filter(isVerifiedArchiveVideo) : [];
}

function verifiedCreatorVideos(items) {
  return dedupeByYoutubeOrUrl((Array.isArray(items) ? items : []).filter(isVerifiedArchiveVideo));
}

function reportFromCreators(creators) {
  const report = { fresh: [], empty: [], stale: [], retained: [], failed: [], degraded: false };
  for (const creator of creators) {
    if (report[creator.outcome]) report[creator.outcome].push(creator.slug);
  }
  report.degraded = report.stale.length + report.retained.length + report.failed.length > 0;
  return report;
}

function logArchiveHealth(report, itemCount) {
  if (!report?.degraded && !(report?.empty?.length > 0)) return;
  console.warn("[voices-archive] feed health", {
    fresh: report.fresh,
    empty: report.empty,
    stale: report.stale,
    retained: report.retained,
    failed: report.failed,
    items: itemCount,
  });
}

function balancedCreatorVideos(creators) {
  const videos = creators.flatMap((creator) => creator.videos);
  return dedupeByYoutubeOrUrl(interleaveAcrossVoices(videos)).slice(0, GLOBAL_MAX_ITEMS);
}

/**
 * Fill creators that failed this round from their own saved videos, then from the
 * previous full archive. A genuine empty feed does not come back from either store.
 */
async function classifyArchiveCreators(result) {
  let previous = null;
  async function previousFor(slug) {
    if (!previous) previous = videosBySlug(await recallArchiveVideos());
    return previous.get(slug) || [];
  }

  const creators = [];
  for (const entry of result.creators || []) {
    const slug = creatorSlug(entry.voice);
    const liveVideos = verifiedCreatorVideos(entry.items);
    let outcome;
    let videos = liveVideos;

    if (entry.ok && liveVideos.length > 0) {
      outcome = "fresh";
      rememberCreatorVideos(slug, liveVideos);
    } else if (entry.ok) {
      outcome = "empty";
      videos = [];
      forgetCreatorVideos(slug);
    } else {
      const saved = preferNewerVideos(await recallCreatorVideos(slug), await previousFor(slug));
      videos = preferNewerVideos(liveVideos, saved);
      if (liveVideos.length > 0 && videos === liveVideos) rememberCreatorVideos(slug, liveVideos);
      else if (videos.length > 0 && videos !== liveVideos) rememberCreatorVideos(slug, videos);
      if (videos.length === 0) outcome = "failed";
      else outcome = liveVideos.length > 0 ? "stale" : "retained";
    }

    creators.push({
      slug,
      outcome,
      reason: entry.reason || null,
      videos,
    });
  }

  return creators;
}

function mergeArchiveVideos(previous, partial, emptySlugs) {
  const prior = videosBySlug(previous);
  const next = videosBySlug(partial);
  const slugs = new Set([...prior.keys(), ...next.keys()]);
  const videos = [];
  for (const slug of slugs) {
    if (emptySlugs.has(slug)) continue;
    const chosen = preferNewerVideos(next.get(slug) || [], prior.get(slug) || []);
    if (chosen.length) videos.push(...chosen);
  }
  return dedupeByYoutubeOrUrl(interleaveAcrossVoices(videos)).slice(0, GLOBAL_MAX_ITEMS);
}

function retainsKnownCreators(previous, next, emptySlugs) {
  if (!Array.isArray(next) || next.length === 0) return false;
  const kept = new Set(videosBySlug(next).keys());
  for (const slug of videosBySlug(previous).keys()) {
    if (emptySlugs.has(slug)) continue;
    if (!kept.has(slug)) return false;
  }
  return true;
}

function normalizeCachedArchive(value) {
  if (Array.isArray(value)) return { items: value, report: null };
  if (value && Array.isArray(value.items)) return { items: value.items, report: value.report || null };
  return { items: [], report: null };
}

async function expireVoicesCache() {
  try {
    const { revalidateTag } = await import("next/cache");
    if (typeof revalidateTag === "function") await revalidateTag("voices-feed");
  } catch {
    // Unit tests replace next/cache and may not expose revalidateTag.
  }
}

async function buildArchiveVoicesFeed() {
  await assertUpstreamAvailable(archiveVoicesCooldown, "voices-archive");

  const voices = await loadVoiceDirectory(archiveVoicesCooldown, "voices-archive", ["voices-feed"]);
  if (!voices.length) return { items: [], report: null };

  const result = await timeAsync(
    "voices-aggregation",
    () => fetchVoicesItems(voices, GLOBAL_PER_VOICE_LIMIT, "voices-archive", ARCHIVE_FEED_FETCH),
    { scope: "archive" }
  );

  const creators = await classifyArchiveCreators(result);
  const report = reportFromCreators(creators);
  const items = balancedCreatorVideos(creators);
  latestArchiveReport = report;
  logArchiveHealth(report, items.length);

  if (report.degraded) {
    await throwArchiveFeedFailure(result, "voices-archive", archiveVoicesCooldown, ["voices-feed"], items, report);
  }

  archiveVoicesCooldown.clear();
  return { items, report };
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
    ARCHIVE_FEED_FETCH,
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

async function getVoicesArchive({ refresh = false } = {}) {
  if (refresh) {
    archiveVoicesCooldown.clear();
    await clearSharedFailure("voices-archive");
    await expireVoicesCache();
  }

  const load = refresh
    ? () => buildArchiveVoicesFeed()
    : () =>
        unstable_cache(buildArchiveVoicesFeed, cacheKey("archive-interleave-v6"), {
          revalidate: REVALIDATE,
          tags: ["voices-feed"],
        })();

  try {
    const payload = normalizeCachedArchive(await load());
    if (payload.report) latestArchiveReport = payload.report;
    const report = payload.report;
    if (payload.items.length > 0) rememberLastKnownGood(ARCHIVE_LKG_KEY, payload.items);
    else if (report && !report.degraded && report.fresh.length === 0 && report.empty.length > 0) {
      forgetLastKnownGood(ARCHIVE_LKG_KEY);
    }
    return payload;
  } catch (err) {
    if (!isUpstreamFailure(err)) throw err;
    const report = err.creatorReport || latestArchiveReport || { empty: [], failed: [] };
    const previous = await recallArchiveVideos();
    const emptySlugs = new Set(report.empty || []);
    const merged = mergeArchiveVideos(previous, err.partial, emptySlugs);
    if (merged.length > 0) err.partial = merged;
    err.creatorReport = report;
    if (retainsKnownCreators(previous, merged, emptySlugs)) rememberLastKnownGood(ARCHIVE_LKG_KEY, merged);
    throw err;
  }
}

export async function getVoicesFeed({ refresh = false } = {}) {
  const payload = await getVoicesArchive({ refresh });
  return payload.items;
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