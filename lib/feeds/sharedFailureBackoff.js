/**
 * Upstream-failure backoff for cache builders.
 *
 * Successful content reads are served from `unstable_cache` and do not call
 * this module. A builder calls it only after that content cache misses.
 *
 * Next.js 15.5 does not store a thrown `unstable_cache` result, and a nested
 * `unstable_cache` read is skipped. Markers are therefore written as Data Cache
 * FETCH entries through IncrementalCache, using the same entry shape as
 * `unstable_cache` in Next.js 15.5.14. That class and its file-system handler
 * are internal. Handler errors are swallowed so a marker failure cannot fail
 * the page.
 *
 * The process-local cooldown is the guaranteed backoff. A shared marker is
 * consulted only when an incremental cache is already on the request. This
 * repo has not observed Vercel's injected fetch-cache handler, so cross-instance
 * sharing is not an established property of these entries.
 *
 * After a shared marker is invalidated, an instance that already tripped its
 * local cooldown can keep skipping rebuilds until that cooldown ends. The extra
 * delay is at most SHARED_FAILURE_BACKOFF_MS (60 seconds). An instance that has
 * not tripped locally can rebuild on its next content-cache miss. Checking the
 * local cooldown first avoids another shared-cache read on every miss during
 * an outage. Successful content-cache hits do not read a marker.
 *
 * A marker is not an empty dataset. Callers keep last-known-good or partial
 * payloads separate from the successful-content entry.
 */

import { upstreamFailure } from '@/lib/feeds/upstreamResult';

let storageModule;

async function loadWorkAsyncStorage() {
  if (storageModule !== undefined) return storageModule;
  try {
    storageModule = await import('next/dist/server/app-render/work-async-storage.external');
  } catch {
    storageModule = null;
  }
  return storageModule;
}

export const SHARED_FAILURE_BACKOFF_MS = 60_000;
const MARKER_REVALIDATE_SECONDS = 120;
const PROCESS_PARTIAL_LIMIT = 24;

/** @type {{ cache: ReturnType<typeof createSharedFailureMemory> | null }} */
const testOverride = { cache: null };

/** @type {Map<string, { value: unknown, until: number }>} */
const processPartials = new Map();

export function configureSharedFailureCacheForTests(cache) {
  testOverride.cache = cache || null;
  processPartials.clear();
}

export function clearSharedFailureForTests() {
  testOverride.cache = null;
  processPartials.clear();
}

/** Drops this instance's partial mirror while leaving the shared store intact. */
export function clearProcessFailureMirrorForTests() {
  processPartials.clear();
}

/**
 * In-memory stand-in for the Data Cache. Tests use one store to represent
 * multiple instances; it is not the production backoff.
 */
export function createSharedFailureMemory() {
  /** @type {Map<string, { until: number, stale: boolean, marker: { status: string, until: number } }>} */
  const markers = new Map();
  /** @type {Map<string, { until: number, stale: boolean, value: unknown }>} */
  const partials = new Map();

  function liveRow(map, key, now) {
    const current = Math.floor(now / SHARED_FAILURE_BACKOFF_MS);
    for (const bucket of [current, current - 1]) {
      const row = map.get(`${key}:${bucket}`);
      if (!row || row.stale || row.until <= now) continue;
      return row;
    }
    return null;
  }

  return {
    async peek(key, now) {
      return liveRow(markers, key, now)?.marker ?? null;
    },
    async publish(key, bucket, marker) {
      markers.set(`${key}:${bucket}`, { until: marker.until, stale: false, marker });
    },
    async readPartial(key, now) {
      return liveRow(partials, key, now)?.value ?? null;
    },
    async writePartial(key, bucket, envelope) {
      partials.set(`${key}:${bucket}`, {
        until: envelope.until,
        stale: false,
        value: envelope.value,
      });
    },
    invalidate(key) {
      for (const map of [markers, partials]) {
        for (const [id, row] of map) {
          if (id === key || id.startsWith(`${key}:`)) row.stale = true;
        }
      }
    },
  };
}

function bucketFor(now) {
  return Math.floor(now / SHARED_FAILURE_BACKOFF_MS);
}

function markerInvocationKey(key, bucket) {
  return `upstream-failure-v1:${key}:${bucket}`;
}

function partialInvocationKey(key, bucket) {
  return `upstream-partial-v1:${key}:${bucket}`;
}

async function getIncrementalCache() {
  const loaded = await loadWorkAsyncStorage();
  const store = loaded?.workAsyncStorage?.getStore?.();
  return store?.incrementalCache || globalThis.__incrementalCache || null;
}

function rememberProcessPartial(key, value, now) {
  if (!key || value == null) return;
  if (Array.isArray(value) && value.length === 0) return;
  if (processPartials.size >= PROCESS_PARTIAL_LIMIT && !processPartials.has(key)) {
    const oldest = processPartials.keys().next().value;
    processPartials.delete(oldest);
  }
  processPartials.set(key, { value, until: now + SHARED_FAILURE_BACKOFF_MS });
}

function recallProcessPartial(key, now) {
  const row = processPartials.get(key);
  if (!row) return null;
  if (row.until <= now) {
    processPartials.delete(key);
    return null;
  }
  return row.value;
}

async function readCachedBody(cache, invocationKey, tags) {
  const cacheKey = await cache.generateCacheKey(invocationKey);
  const entry = await cache.get(cacheKey, {
    kind: 'FETCH',
    revalidate: MARKER_REVALIDATE_SECONDS,
    tags,
  });
  if (!entry?.value || entry.isStale) return null;
  if (entry.value.kind !== 'FETCH') return null;
  const body = entry.value.data?.body;
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function writeCachedBody(cache, invocationKey, body, tags) {
  const cacheKey = await cache.generateCacheKey(invocationKey);
  await cache.set(
    cacheKey,
    {
      kind: 'FETCH',
      data: { headers: {}, body: JSON.stringify(body), status: 200, url: '' },
      revalidate: MARKER_REVALIDATE_SECONDS,
    },
    { fetchCache: true, tags },
  );
}

export async function sharedFailureActive(key, now = Date.now()) {
  if (!key) return false;
  if (testOverride.cache) return Boolean(await testOverride.cache.peek(key, now));

  const cache = await getIncrementalCache();
  if (!cache?.get || !cache.generateCacheKey) return false;

  const current = bucketFor(now);
  for (const bucket of [current, current - 1]) {
    try {
      const marker = await readCachedBody(cache, markerInvocationKey(key, bucket), ['upstream-failure-marker', key]);
      if (marker?.status === 'upstream_failed' && marker.until > now) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function recordSharedFailure(key, { tags = [], now = Date.now() } = {}) {
  if (!key) return;
  const marker = { status: 'upstream_failed', until: now + SHARED_FAILURE_BACKOFF_MS };
  const bucket = bucketFor(now);
  const cacheTags = ['upstream-failure-marker', key, ...tags];

  if (testOverride.cache) {
    await testOverride.cache.publish(key, bucket, marker);
    return;
  }

  const cache = await getIncrementalCache();
  if (!cache?.set || !cache.generateCacheKey) return;
  try {
    await writeCachedBody(cache, markerInvocationKey(key, bucket), marker, cacheTags);
  } catch (err) {
    console.warn('[upstream-backoff] failure marker was not stored', err instanceof Error ? err.message : '');
  }
}

export async function rememberSharedPartial(key, value, { tags = [], now = Date.now() } = {}) {
  if (!key || value == null) return;
  if (Array.isArray(value) && value.length === 0) return;
  rememberProcessPartial(key, value, now);
  const envelope = { until: now + SHARED_FAILURE_BACKOFF_MS, value };
  const bucket = bucketFor(now);
  const cacheTags = ['upstream-failure-partial', key, ...tags];

  if (testOverride.cache) {
    await testOverride.cache.writePartial(key, bucket, envelope);
    return;
  }

  const cache = await getIncrementalCache();
  if (!cache?.set || !cache.generateCacheKey) return;
  try {
    await writeCachedBody(cache, partialInvocationKey(key, bucket), envelope, cacheTags);
  } catch (err) {
    console.warn('[upstream-backoff] partial marker was not stored', err instanceof Error ? err.message : '');
  }
}

export async function recallSharedPartial(key, now = Date.now()) {
  const local = recallProcessPartial(key, now);
  if (local != null) return local;
  if (!key) return null;

  if (testOverride.cache) {
    const value = await testOverride.cache.readPartial(key, now);
    if (value != null) rememberProcessPartial(key, value, now);
    return value;
  }

  const cache = await getIncrementalCache();
  if (!cache?.get || !cache.generateCacheKey) return null;
  const current = bucketFor(now);
  for (const bucket of [current, current - 1]) {
    try {
      const envelope = await readCachedBody(cache, partialInvocationKey(key, bucket), ['upstream-failure-partial', key]);
      if (envelope && envelope.until > now && envelope.value != null) {
        rememberProcessPartial(key, envelope.value, now);
        return envelope.value;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Skip an expensive rebuild when this instance already failed, or when a shared
 * marker is visible, inside the backoff window. The local cooldown is checked
 * first. See the module note for the 60-second recovery bound after invalidation.
 */
export async function assertUpstreamAvailable(cooldown, key, now = Date.now()) {
  if (cooldown?.active?.(now)) {
    const err = upstreamFailure(key);
    const partial = recallProcessPartial(key, now);
    if (partial != null) err.partial = partial;
    throw err;
  }

  if (await sharedFailureActive(key, now)) {
    cooldown?.trip?.(now);
    const err = upstreamFailure(key);
    const partial = await recallSharedPartial(key, now);
    if (partial != null) err.partial = partial;
    throw err;
  }
}

/**
 * @param {{ active?: (now?: number) => boolean, trip?: (now?: number) => void } | null} cooldown
 * @param {string} key
 * @param {{ tags?: string[], partial?: unknown, now?: number }} [options]
 */
export async function noteUpstreamFailure(cooldown, key, { tags, partial, now = Date.now() } = {}) {
  cooldown?.trip?.(now);
  await recordSharedFailure(key, { tags, now });
  if (partial != null) await rememberSharedPartial(key, partial, { tags, now });
}
