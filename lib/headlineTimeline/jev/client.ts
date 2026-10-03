import {
  JEV_DEFAULT_TIMEOUT_MS,
  JEV_MODEL,
  JEV_SYSTEMONE_URL,
} from '@/lib/headlineTimeline/jev/constants';
import type { JevCallOptions } from '@/lib/headlineTimeline/jev/types';

export type JevHttpSuccess = {
  ok: true;
  body: unknown;
  elapsedMs: number;
};

export type JevHttpFailure = {
  ok: false;
  error: string;
  elapsedMs: number | null;
};

export type JevHttpResult = JevHttpSuccess | JevHttpFailure;

export function resolveJevApiKey(explicit: string | null | undefined): string | null {
  if (explicit === null) return null;
  const value = (explicit ?? process.env.TYPESAFE_API_KEY ?? '').trim();
  return value || null;
}

export function resolveJevModel(explicit?: string): string {
  const value = (explicit ?? process.env.TYPESAFE_JEV_MODEL ?? JEV_MODEL).trim();
  return value || JEV_MODEL;
}

export function resolveJevTimeoutMs(explicit?: number): number {
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) return explicit;
  const raw = process.env.TYPESAFE_JEV_TIMEOUT_MS?.trim();
  if (!raw) return JEV_DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return JEV_DEFAULT_TIMEOUT_MS;
  return parsed;
}

function elapsedSince(started: number): number {
  return Math.max(0, Math.round(Date.now() - started));
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String(error.name) : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * One System One request. No retries: a failed call becomes a review,
 * and the lexical timeline stays available.
 */
export async function requestJevSystemOne(
  body: unknown,
  options: JevCallOptions = {},
): Promise<JevHttpResult> {
  const apiKey = resolveJevApiKey(options.apiKey);
  if (!apiKey) {
    return { ok: false, error: 'TYPESAFE_API_KEY is not set', elapsedMs: null };
  }

  const endpoint = options.endpoint?.trim() || JEV_SYSTEMONE_URL;
  const timeoutMs = resolveJevTimeoutMs(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const elapsedMs = elapsedSince(started);
    const text = await response.text();
    if (!response.ok) {
      const label = response.status === 429 ? 'jev rate limited (429)' : `jev http ${response.status}`;
      return { ok: false, error: label, elapsedMs };
    }
    if (!text.trim()) {
      return { ok: false, error: 'jev response was empty', elapsedMs };
    }
    try {
      return { ok: true, body: JSON.parse(text) as unknown, elapsedMs };
    } catch {
      return { ok: false, error: 'jev response was not valid json', elapsedMs };
    }
  } catch (error) {
    const elapsedMs = elapsedSince(started);
    if (isAbortError(error)) {
      return { ok: false, error: 'jev request timed out', elapsedMs };
    }
    return { ok: false, error: 'jev network error', elapsedMs };
  } finally {
    clearTimeout(timer);
  }
}
