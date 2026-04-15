import 'server-only';

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; iamresist-intel/1.0; +https://www.iamresist.org/legal)';

const BROWSERISH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  contentType: string | null;
  redirects: {
    status: number;
    from: string;
    to: string;
    location: string;
  }[];
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function canonHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function normalizeForLoopCheck(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim();
  }

  // Normalize obvious noise so redirect loop detection doesn't miss "same URL" variants.
  u.hash = '';

  // Tracking params commonly added in redirect chains.
  const dropPrefixes = ['utm_'];
  const dropExact = new Set([
    'fbclid',
    'gclid',
    'mc_cid',
    'mc_eid',
    'ref',
    'ref_src',
    'ref_url',
    'source',
    'igshid',
  ]);
  for (const key of Array.from(u.searchParams.keys())) {
    const k = key.toLowerCase();
    if (dropExact.has(k) || dropPrefixes.some((p) => k.startsWith(p))) {
      u.searchParams.delete(key);
    }
  }

  // Stable-ish host comparison. Keep path case as-is (servers can be case sensitive).
  u.hostname = canonHost(u.hostname);

  // Drop default ports.
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
    u.port = '';
  }

  // Normalize protocol to https where possible.
  if (u.protocol === 'http:') u.protocol = 'https:';

  // Normalize a trailing slash only for bare host paths.
  if (u.pathname === '') u.pathname = '/';

  // Ensure params are in a stable order.
  if (u.searchParams.size > 1) {
    const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of entries) u.searchParams.append(k, v);
  }

  return u.toString();
}

function resolveRedirectUrl(currentUrl: string, location: string): string | null {
  const loc = (location || '').trim();
  if (!loc) return null;
  try {
    return new URL(loc, currentUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Cron-safe fetch: no Next.js ISR cache. Stale data = last DB snapshot, not silent downgrade.
 */
export async function fetchTextNoStore(
  url: string,
  { timeoutMs = 20000, maxRedirects = 6 }: { timeoutMs?: number; maxRedirects?: number } = {},
): Promise<FetchTextResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // Some public sites (notably .mil syndication/listing endpoints) return 403 to non-browser-ish clients.
    // Keep this modest and transparent: do not emulate cookies or JS execution; only broaden UA + nav-like headers.
    const headers: Record<string, string> = {
      Accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, application/json;q=0.8, text/html;q=0.7, */*;q=0.5',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': DEFAULT_UA,
    };

    const browserishHosts = new Set(['www.centcom.mil', 'www.eucom.mil']);
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    const useBrowserish = host && browserishHosts.has(host.toLowerCase());
    if (useBrowserish) {
      headers.Accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      headers['User-Agent'] = BROWSERISH_UA;
      headers['Upgrade-Insecure-Requests'] = '1';
      headers['Sec-Fetch-Dest'] = 'document';
      headers['Sec-Fetch-Mode'] = 'navigate';
      headers['Sec-Fetch-Site'] = 'none';
      headers['Sec-Fetch-User'] = '?1';
    }

    let currentUrl = url;
    const seen = new Set<string>();
    const redirects: FetchTextResult['redirects'] = [];

    for (let i = 0; i <= maxRedirects; i++) {
      const loopKey = normalizeForLoopCheck(currentUrl);
      if (seen.has(loopKey)) {
        const err = new Error(`Redirect loop detected: ${loopKey}`);
        // Attach redirect chain for ingest diagnostics (do not log full bodies).
        Object.assign(err, { redirects });
        throw err;
      }
      seen.add(loopKey);

      const res = await fetch(currentUrl, {
        cache: 'no-store',
        redirect: 'manual',
        signal: ac.signal,
        headers,
      });

      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get('location') || '';
        const nextUrl = resolveRedirectUrl(currentUrl, location);
        if (!nextUrl) {
          const text = await res.text();
          return {
            ok: res.ok,
            status: res.status,
            text,
            finalUrl: res.url || currentUrl,
            contentType: res.headers.get('content-type'),
            redirects,
          };
        }
        redirects.push({ status: res.status, from: currentUrl, to: nextUrl, location });
        if (i === maxRedirects) {
          const err = new Error(
            `Redirect count exceeded (${maxRedirects}) for ${normalizeForLoopCheck(url)}`,
          );
          Object.assign(err, { redirects });
          throw err;
        }
        currentUrl = nextUrl;
        continue;
      }

      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        text,
        finalUrl: res.url || currentUrl,
        contentType: res.headers.get('content-type'),
        redirects,
      };
    }

    const err = new Error(`Redirect count exceeded (${maxRedirects}) for ${normalizeForLoopCheck(url)}`);
    Object.assign(err, { redirects });
    throw err;
  } finally {
    clearTimeout(t);
  }
}
