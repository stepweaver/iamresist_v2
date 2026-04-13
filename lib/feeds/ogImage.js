import 'server-only';

import pLimit from 'p-limit';
import { unstable_cache } from 'next/cache';

const FEED_CACHE_TAG = 'newswire';

function toHttpsArticleUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return `https://${t.slice('http://'.length)}`;
  return null;
}

function resolveAgainstBase(url, baseUrl) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  if (!baseUrl || typeof baseUrl !== 'string') return null;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol === 'http:') {
      resolved.protocol = 'https:';
    }
    return resolved.href;
  } catch {
    return null;
  }
}

function extractMetaImageFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']thumbnailUrl["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const raw = m[1].trim();
      if (raw && !raw.startsWith('data:')) return raw;
    }
  }
  const jsonLd =
    html.match(/"image"\s*:\s*"(https?:[^"]+)"/i) ||
    html.match(/"thumbnailUrl"\s*:\s*"(https?:[^"]+)"/i);
  if (jsonLd?.[1]?.startsWith('http')) return jsonLd[1];
  return null;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** Direct HTML fetch + meta parse (no Next cache). Use for intel desk or when avoiding nested unstable_cache. */
export async function fetchOgImageUncached(articleUrl) {
  if (!articleUrl || typeof articleUrl !== 'string') return null;
  const normalized = toHttpsArticleUrl(articleUrl);
  if (!normalized) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(normalized, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const raw = extractMetaImageFromHtml(html.slice(0, 600_000));
    if (!raw) return null;
    return resolveAgainstBase(raw, normalized);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached OG/Twitter image lookup per article URL (24h). Tagged with newswire for bulk invalidation.
 */
export async function getOgImageCached(articleUrl) {
  const normalized = toHttpsArticleUrl(articleUrl);
  if (!normalized) return null;
  return unstable_cache(
    async () => fetchOgImageUncached(normalized),
    ['newswire-og-image-v2', normalized],
    { revalidate: 86_400, tags: [FEED_CACHE_TAG] }
  )();
}

/**
 * For stories missing `image`, fetch og:image from the article page (bounded concurrency).
 * @param {Array<{ url?: string, image?: string | null }>} stories
 * @param {{ max?: number, concurrency?: number }} [opts]
 */
export async function enrichStoriesWithOgImages(stories, opts = {}) {
  const max = Math.min(80, Math.max(0, Number(opts.max) ?? 48));
  const concurrency = Math.min(8, Math.max(1, Number(opts.concurrency) ?? 5));
  if (!Array.isArray(stories) || max === 0) return stories;

  const need = [];
  for (const s of stories) {
    if (!s?.url || s.image) continue;
    need.push(s);
    if (need.length >= max) break;
  }
  if (need.length === 0) return stories;

  const limit = pLimit(concurrency);
  await Promise.all(
    need.map((story) =>
      limit(async () => {
        const og = await getOgImageCached(story.url);
        if (og) story.image = og;
      })
    )
  );

  return stories;
}
