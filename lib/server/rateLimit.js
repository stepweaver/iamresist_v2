import "server-only";

import { NextResponse } from "next/server";

/** Per-route sliding window limits (per client key, best-effort per server instance). */
const ROUTE_CONFIG = {
  "voices-archive": { limit: 120, windowMs: 60_000 },
  "voices-feed": { limit: 120, windowMs: 60_000 },
  "voices-more": { limit: 180, windowMs: 60_000 },
  checkout: { limit: 40, windowMs: 60_000 },
};

const buckets = new Map();

/**
 * Client identity for anonymous rate limiting (Vercel sets x-forwarded-for).
 * @param {Request} request
 */
export function getRateLimitClientKey(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  return "unknown";
}

function pruneIfNeeded(now, windowMs) {
  if (buckets.size < 2_000) return;
  const cutoff = now - windowMs * 2;
  for (const [k, v] of buckets) {
    if (v.windowStart < cutoff) buckets.delete(k);
  }
}

/**
 * @param {string} routeKey
 * @param {Request} request
 * @returns {NextResponse | null} 429 response or null if allowed
 */
export function rateLimitedResponse(routeKey, request) {
  const cfg = ROUTE_CONFIG[routeKey];
  if (!cfg) return null;

  const now = Date.now();
  pruneIfNeeded(now, cfg.windowMs);

  const id = `${routeKey}:${getRateLimitClientKey(request)}`;
  let b = buckets.get(id);
  if (!b || now - b.windowStart >= cfg.windowMs) {
    buckets.set(id, { windowStart: now, count: 1 });
    return null;
  }
  b.count += 1;
  if (b.count > cfg.limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((cfg.windowMs - (now - b.windowStart)) / 1000)
    );
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "Cache-Control": "no-store",
        },
      }
    );
  }
  return null;
}

/** Reset state between Vitest cases (no-op in production). */
export function resetRateLimitForTests() {
  if (process.env.NODE_ENV !== "test") return;
  buckets.clear();
}
