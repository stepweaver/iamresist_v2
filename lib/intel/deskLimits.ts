import 'server-only';

/** Surfaced-only rows fetched for the desk (before merge / dedupe). */
export function parseDeskSurfacedFetchLimit(): number {
  const raw = process.env.INTEL_DESK_SURFACED_FETCH_LIMIT;
  if (raw == null || String(raw).trim() === '') return 160;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 400) : 160;
}

/** Downranked rows appended after surfaced pool (small allowance). */
export function parseDeskDownrankedFetchLimit(): number {
  const raw = process.env.INTEL_DESK_DOWNRANKED_FETCH_LIMIT;
  if (raw == null || String(raw).trim() === '') return 48;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 200) : 48;
}

/** Suppressed section only; does not affect main desk slots. */
export function parseDeskSuppressedFetchLimit(): number {
  const raw = process.env.INTEL_DESK_SUPPRESSED_FETCH_LIMIT;
  if (raw == null || String(raw).trim() === '') return 60;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 60;
}

/** Max cards on the default surface after composition (excludes duplicate cluster losers). */
export function parseDeskMaxVisibleItems(): number {
  const raw = process.env.INTEL_DESK_MAX_VISIBLE_ITEMS;
  if (raw == null || String(raw).trim() === '') return 72;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 72;
}
