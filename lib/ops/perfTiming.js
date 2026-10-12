/**
 * Inexpensive server timing logs for content delivery.
 *
 * PERF_TIMING=1 logs every timed operation.
 * PERF_TIMING=0 silences them.
 * Unset logs failures and operations slower than PERF_SLOW_MS (default 1500).
 *
 * In Vercel logs, filter for "[perf]". A cold request logs both the homepage
 * section timer and the underlying aggregation. A warm request logs only the
 * section timer, and only when it is slow or PERF_TIMING=1. Pair that with
 * the browser Network waterfall: document TTFB is the shell, and each
 * homepage section arrives in its own streamed chunk.
 *
 * Logs include operation name, duration, and counts. They do not include
 * credentials, payloads, or user data.
 */

const DEFAULT_SLOW_MS = 1500;

function slowThresholdMs() {
  const parsed = Number(process.env.PERF_SLOW_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SLOW_MS;
}

function shouldLog(ok, durationMs) {
  const flag = String(process.env.PERF_TIMING ?? '').trim();
  if (flag === '0') return false;
  if (flag === '1') return true;
  return !ok || durationMs >= slowThresholdMs();
}

function summarizeResult(result) {
  const summary = {};
  if (Array.isArray(result)) {
    summary.itemCount = result.every(Array.isArray)
      ? result.reduce((count, rows) => count + rows.length, 0)
      : result.length;
    return summary;
  }
  if (!result || typeof result !== 'object') return summary;
  if (typeof result.failureCount === 'number') summary.failureCount = result.failureCount;
  if (typeof result.emptyCount === 'number') summary.emptyCount = result.emptyCount;
  if (typeof result.staleCount === 'number') summary.staleCount = result.staleCount;
  if (typeof result.itemCount === 'number') summary.itemCount = result.itemCount;
  else if (Array.isArray(result.items)) summary.itemCount = result.items.length;
  return summary;
}

const FIELD_KEYS = ['lane', 'target', 'scope', 'status'];

function pickFields(fields) {
  const out = {};
  if (!fields || typeof fields !== 'object') return out;
  for (const key of FIELD_KEYS) {
    const value = fields[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 80) out[key] = value;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function formatFields(fields) {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

export function logPerf(entry) {
  try {
    const durationMs = Math.max(0, Number(entry?.durationMs) || 0);
    const ok = entry?.ok !== false;
    if (!shouldLog(ok, durationMs)) return;
    const operation = String(entry?.operation || 'unknown').slice(0, 80);
    const fields = formatFields({
      ...pickFields(entry),
      ...summarizeResult(entry?.result),
      ...(typeof entry?.failureCount === 'number' ? { failureCount: entry.failureCount } : {}),
      ...(typeof entry?.itemCount === 'number' ? { itemCount: entry.itemCount } : {}),
    });
    const line = `[perf] operation=${operation} durationMs=${durationMs} ok=${ok ? 1 : 0}${fields ? ` ${fields}` : ''}`;
    if (ok) console.info(line);
    else console.warn(line);
  } catch {
    // Diagnostics must never affect the request.
  }
}

/**
 * @template T
 * @param {string} operation
 * @param {() => Promise<T>} fn
 * @param {Record<string, string | number>} [fields]
 * @returns {Promise<T>}
 */
export async function timeAsync(operation, fn, fields = {}) {
  const started = Date.now();
  try {
    const result = await fn();
    logPerf({
      operation,
      durationMs: Date.now() - started,
      ok: true,
      result,
      ...pickFields(fields),
    });
    return result;
  } catch (err) {
    const failureCount = typeof err?.failureCount === 'number' ? err.failureCount : undefined;
    logPerf({
      operation,
      durationMs: Date.now() - started,
      ok: false,
      failureCount,
      ...pickFields(fields),
    });
    throw err;
  }
}
