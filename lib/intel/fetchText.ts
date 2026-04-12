import 'server-only';

const DEFAULT_UA =
  'iamresist.org intel-ingest/1.0 (+https://www.iamresist.org/legal)';

export type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
};

/**
 * Cron-safe fetch: no Next.js ISR cache. Stale data = last DB snapshot, not silent downgrade.
 */
export async function fetchTextNoStore(
  url: string,
  { timeoutMs = 20000 }: { timeoutMs?: number } = {},
): Promise<FetchTextResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ac.signal,
      headers: {
        Accept: 'application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': DEFAULT_UA,
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, finalUrl: res.url || url };
  } finally {
    clearTimeout(t);
  }
}
