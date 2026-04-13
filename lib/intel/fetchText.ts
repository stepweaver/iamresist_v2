import 'server-only';

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; iamresist-intel/1.0; +https://www.iamresist.org/legal)';

export type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  contentType: string | null;
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
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, application/json;q=0.8, text/html;q=0.7, */*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'User-Agent': DEFAULT_UA,
      },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      finalUrl: res.url || url,
      contentType: res.headers.get('content-type'),
    };
  } finally {
    clearTimeout(t);
  }
}
