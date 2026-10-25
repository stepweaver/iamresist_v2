/**
 * Last successful payloads.
 * The process map is the fast path. The same record is also written through
 * the Data Cache used by upstream failure markers, so a restart can still
 * serve the last real fetch during a YouTube outage.
 * Used only after an upstream failure. Successful empty results do not count
 * unless the caller marks them authoritative and clears the previous value.
 * This is not a substitute for ranking: callers must pass values that already
 * went through the normal selection path, or feed them back through it.
 */

import { readDurableJson, writeDurableJson } from '@/lib/feeds/sharedFailureBackoff';

const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const store = new Map();

/** @type {Map<string, { value: unknown, savedAt: number, maxAgeMs: number }> | null} */
let durableAdapter = null;

function cloneRecord(record) {
  if (!record) return null;
  return {
    value: Array.isArray(record.value) ? record.value.slice() : record.value,
    savedAt: record.savedAt,
    maxAgeMs: record.maxAgeMs,
  };
}

function durableKey(key) {
  return `lkg-v1:${key}`;
}

function persistRecord(key, record) {
  if (!key) return;
  if (durableAdapter) {
    if (!record) durableAdapter.delete(key);
    else durableAdapter.set(key, cloneRecord(record));
    return;
  }
  const invocationKey = durableKey(key);
  const tags = ['last-known-good', key];
  if (!record) {
    void writeDurableJson(invocationKey, { forgotten: true, savedAt: Date.now() }, { tags, revalidateSeconds: 60 });
    return;
  }
  void writeDurableJson(invocationKey, cloneRecord(record), {
    tags,
    revalidateSeconds: Math.ceil(record.maxAgeMs / 1000),
  });
}

export function configureLastKnownGoodDurableForTests(adapter) {
  durableAdapter = adapter || null;
}

export function rememberLastKnownGood(key, value, now = Date.now()) {
  if (!key || value == null) return;
  if (Array.isArray(value) && value.length === 0) return;
  const record = {
    value: Array.isArray(value) ? value.slice() : value,
    savedAt: now,
    maxAgeMs: DEFAULT_MAX_AGE_MS,
  };
  store.set(key, record);
  persistRecord(key, record);
}

export function recallLastKnownGood(key, now = Date.now()) {
  const row = store.get(key);
  if (!row) return null;
  if (now - row.savedAt > row.maxAgeMs) {
    store.delete(key);
    return null;
  }
  return Array.isArray(row.value) ? row.value.slice() : row.value;
}

export function forgetLastKnownGood(key) {
  if (!key) return;
  store.delete(key);
  persistRecord(key, null);
}

/** Load a durable record into this process when memory does not already have one. */
export async function hydrateLastKnownGood(key, now = Date.now()) {
  if (!key || recallLastKnownGood(key, now)) return;
  let row = null;
  if (durableAdapter) {
    row = durableAdapter.get(key) || null;
  } else {
    const stored = await readDurableJson(durableKey(key), {
      tags: ['last-known-good', key],
      revalidateSeconds: Math.ceil(DEFAULT_MAX_AGE_MS / 1000),
    });
    if (stored && !stored.forgotten && stored.value != null) row = stored;
  }
  if (!row || row.forgotten) return;
  if (!Number.isFinite(row.savedAt) || now - row.savedAt > (row.maxAgeMs || DEFAULT_MAX_AGE_MS)) return;
  store.set(key, {
    value: row.value,
    savedAt: row.savedAt,
    maxAgeMs: row.maxAgeMs || DEFAULT_MAX_AGE_MS,
  });
}

export function clearLastKnownGoodMemoryForTests() {
  store.clear();
}

export function clearLastKnownGoodForTests() {
  store.clear();
  durableAdapter?.clear?.();
}

/**
 * Run `load`. Remember non-empty successes. On an upstream failure, return the
 * last non-empty success when one is still fresh; otherwise rethrow so the
 * caller does not treat the miss as a real empty dataset.
 */
export async function readThroughLastKnownGood(key, load, { authoritativeEmpty = false } = {}) {
  await hydrateLastKnownGood(key);
  try {
    const value = await load();
    if (Array.isArray(value) && value.length === 0) {
      if (authoritativeEmpty) forgetLastKnownGood(key);
      return value;
    }
    rememberLastKnownGood(key, value);
    return value;
  } catch (err) {
    if (!isUpstreamCode(err)) throw err;
    await hydrateLastKnownGood(key);
    const snap = recallLastKnownGood(key);
    if (Array.isArray(snap) && snap.length > 0) return snap;
    throw err;
  }
}

function isUpstreamCode(err) {
  return Boolean(err && err.code === 'UPSTREAM_FAILED');
}
