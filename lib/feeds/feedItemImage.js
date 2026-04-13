/**
 * Shared RSS item image extraction (newswire + intel ingest).
 * Expects rss-parser output with media:thumbnail, media:content, content:encoded when present in feed.
 */

function resolveImageUrl(url, baseUrl) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  if (!baseUrl || typeof baseUrl !== "string") return null;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol === "http:") {
      resolved.protocol = "https:";
    }
    return resolved.href;
  } catch {
    return null;
  }
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|$)/i;

function looksLikeImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  return IMAGE_EXT_RE.test(url) || /^data:image\//i.test(url);
}

function shouldSkipImgCandidate(url) {
  if (!url || typeof url !== "string") return true;
  const u = url.toLowerCase();
  if (u.includes("facebook.com/tr")) return true;
  if (u.includes("google-analytics.com")) return true;
  if (u.includes("doubleclick.net")) return true;
  if (u.includes("1x1") && (u.includes("pixel") || u.includes("gif"))) return true;
  if (u.includes("spacer.gif")) return true;
  if (u.includes("gravatar.com") && u.includes("s=16")) return true;
  return false;
}

function collectEnclosures(item) {
  const raw = item.enclosure;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function extractFromLinks(item) {
  const link = item.link || item.links?.[0]?.href || "";
  for (const L of item.links || []) {
    const href = L.href || L.url;
    if (!href) continue;
    const type = L.type || "";
    if (type.startsWith("image/")) return resolveImageUrl(href, link);
    if ((L.rel === "enclosure" || L.rel === "preview") && looksLikeImageUrl(href)) {
      return resolveImageUrl(href, link);
    }
  }
  return null;
}

function extractMetaOgFromHtml(html, baseUrl) {
  if (!html) return null;
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  const raw = og?.[1]?.trim();
  if (!raw || raw.startsWith("data:")) return null;
  return resolveImageUrl(raw, baseUrl);
}

/** YouTube watch/embed URLs → static thumbnail. */
export function youtubeThumbFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} item rss-parser item
 * @returns {string | null} https URL or null
 */
export function extractFeedImage(item) {
  const link = item.link || item.links?.[0]?.href || "";

  for (const enc of collectEnclosures(item)) {
    const u = enc?.url;
    if (!u) continue;
    const t = enc.type || "";
    if (t.startsWith("image/") || (!t && looksLikeImageUrl(u))) {
      return resolveImageUrl(u, link);
    }
  }

  const fromLinks = extractFromLinks(item);
  if (fromLinks) return fromLinks;

  const thumb = item["media:thumbnail"]?.[0]?.$?.url;
  if (thumb) return resolveImageUrl(thumb, link);

  const media = item["media:content"]?.find((m) => {
    const type = m?.$?.type ?? "";
    const medium = m?.$?.medium ?? "";
    return type.startsWith("image/") || medium === "image";
  })?.$?.url;
  if (media) return resolveImageUrl(media, link);

  const htmlParts = [
    item["content:encoded"],
    item.content,
    item.summary,
    item.description,
  ].filter(Boolean);
  const html = htmlParts.join("\n");

  const og = extractMetaOgFromHtml(html, link);
  if (og) return og;

  const imgPatterns = [
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+data-src=["']([^"']+)["']/gi,
  ];
  for (const re of imgPatterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const candidate = resolveImageUrl(m[1], link);
      if (candidate && !shouldSkipImgCandidate(candidate)) return candidate;
    }
  }

  const srcset = html.match(/srcset=["']([^"']+)["']/i);
  if (srcset?.[1]) {
    const first = srcset[1].split(",")[0]?.trim().split(/\s+/)[0];
    const candidate = resolveImageUrl(first, link);
    if (candidate && !shouldSkipImgCandidate(candidate)) return candidate;
  }

  return null;
}
