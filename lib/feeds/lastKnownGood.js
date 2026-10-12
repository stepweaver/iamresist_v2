/**
 * Process-local last successful payloads.
 * Used only after an upstream failure. Successful empty results do not count
 * unless the caller marks them authoritative and clears the previous value.
 * This is not a substitute for ranking: callers must pass values that already
 * went through the normal selection path, or feed them back through it.
 */

const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const store = new Map();

export function rememberLastKnownGood(key, value, now = Date.now()) {
  if (!key || value == null) return;
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    store.set(key, { value: value.slice(), savedAt: now, maxAgeMs: DEFAULT_MAX_AGE_MS });
    return;
  }
  store.set(key, { value, savedAt: now, maxAgeMs: DEFAULT_MAX_AGE_MS });
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
  store.delete(key);
}

export function clearLastKnownGoodForTests() {
  store.clear();
}

/**
 * Run `load`. Remember non-empty successes. On an upstream failure, return the
 * last non-empty success when one is still fresh; otherwise rethrow so the
 * caller does not treat the miss as a real empty dataset.
 */
export async function readThroughLastKnownGood(key, load, { authoritativeEmpty = false } = {}) {
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
    const snap = recallLastKnownGood(key);
    if (Array.isArray(snap) && snap.length > 0) return snap;
    throw err;
  }
}

function isUpstreamCode(err) {
  return Boolean(err && err.code === 'UPSTREAM_FAILED');
}
