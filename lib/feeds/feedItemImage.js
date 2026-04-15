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

const RAPPLER_HOST_RE = /(^|\.)rappler\.com$/i;

/** Site chrome / favicon-scale Tachyon assets (not article photos). */
function isRapplerTachyonTinyOrIcon(url) {
  try {
    const parsed = new URL(url);
    if (!RAPPLER_HOST_RE.test(parsed.hostname) || !parsed.pathname.includes("/tachyon/")) {
      return false;
    }
    const path = parsed.pathname.toLowerCase();
    if (path.includes("piano-small") || path.includes("cropped-piano")) return true;

    const fit = parsed.searchParams.get("fit");
    if (fit) {
      const parts = fit.split(",").map((s) => parseInt(String(s).trim(), 10));
      const [a, b] = parts;
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && a <= 64 && b <= 64) {
        return true;
      }
    }
    const w = parseInt(parsed.searchParams.get("w") || "0", 10);
    const h = parseInt(parsed.searchParams.get("h") || "0", 10);
    if (w > 0 && w <= 120) return true;
    if (h > 0 && h <= 120) return true;
    const resize = parsed.searchParams.get("resize");
    if (resize) {
      const [rw, rh] = resize.split(",").map((s) => parseInt(String(s).trim(), 10));
      if (Number.isFinite(rw) && Number.isFinite(rh) && rw > 0 && rh > 0 && rw <= 120 && rh <= 120) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Rappler (Altis Tachyon) often ships RSS/OG URLs with small `w`/`fit` — fine in a 80px list, blurry in our cards.
 * Strip crop/size hints and request ~1280px max width for retina-safe display.
 * @param {string} url
 * @returns {string}
 */
function upgradeRapplerTachyonImageUrl(url) {
  try {
    const u = new URL(url);
    if (!RAPPLER_HOST_RE.test(u.hostname) || !u.pathname.includes("/tachyon/")) return url;
    ["fit", "resize", "lb", "h", "crop", "zoom"].forEach((k) => u.searchParams.delete(k));
    const w = parseInt(u.searchParams.get("w") || "0", 10);
    if (!Number.isFinite(w) || w < 600) {
      u.searchParams.set("w", "1280");
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function polishFeedCardImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  return upgradeRapplerTachyonImageUrl(url.trim());
}

function shouldSkipImgCandidate(url) {
  if (!url || typeof url !== "string") return true;
  const u = url.toLowerCase();
  /** Meduza RSS enclosures point at imgly/share — rendered headline cards, not photos; they crop badly in card frames. */
  if (u.includes("meduza.io") && u.includes("/imgly/share/")) return true;
  if (isRapplerTachyonTinyOrIcon(url)) return true;
  if (u.includes("facebook.com/tr")) return true;
  if (u.includes("google-analytics.com")) return true;
  if (u.includes("doubleclick.net")) return true;
  if (u.includes("1x1") && (u.includes("pixel") || u.includes("gif"))) return true;
  if (u.includes("spacer.gif")) return true;
  if (u.includes("gravatar.com") && u.includes("s=16")) return true;
  return false;
}

/**
 * Use when assigning any RSS/OG image to a card — same rules as {@link extractFeedImage} inner skips.
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function shouldSkipFeedImageCandidate(url) {
  if (!url || typeof url !== "string") return true;
  return shouldSkipImgCandidate(url.trim());
}

/**
 * Apply skip rules + Rappler Tachyon width upgrade for any resolved image URL.
 * @param {string | null | undefined} resolved
 * @returns {string | null}
 */
function finalizeFeedImageCandidate(resolved) {
  if (!resolved) return null;
  if (shouldSkipImgCandidate(resolved)) return null;
  return polishFeedCardImageUrl(resolved);
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
    if (type.startsWith("image/")) {
      const f = finalizeFeedImageCandidate(resolveImageUrl(href, link));
      if (f) return f;
    }
    if ((L.rel === "enclosure" || L.rel === "preview") && looksLikeImageUrl(href)) {
      const f = finalizeFeedImageCandidate(resolveImageUrl(href, link));
      if (f) return f;
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
      const f = finalizeFeedImageCandidate(resolveImageUrl(u, link));
      if (f) return f;
    }
  }

  const fromLinks = extractFromLinks(item);
  if (fromLinks) return fromLinks;

  const thumb = item["media:thumbnail"]?.[0]?.$?.url;
  if (thumb) {
    const f = finalizeFeedImageCandidate(resolveImageUrl(thumb, link));
    if (f) return f;
  }

  const media = item["media:content"]?.find((m) => {
    const type = m?.$?.type ?? "";
    const medium = m?.$?.medium ?? "";
    return type.startsWith("image/") || medium === "image";
  })?.$?.url;
  if (media) {
    const f = finalizeFeedImageCandidate(resolveImageUrl(media, link));
    if (f) return f;
  }

  const htmlParts = [
    item["content:encoded"],
    item.content,
    item.summary,
    item.description,
  ].filter(Boolean);
  const html = htmlParts.join("\n");

  const og = finalizeFeedImageCandidate(extractMetaOgFromHtml(html, link));
  if (og) return og;

  const imgPatterns = [
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+data-src=["']([^"']+)["']/gi,
  ];
  for (const re of imgPatterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const candidate = finalizeFeedImageCandidate(resolveImageUrl(m[1], link));
      if (candidate) return candidate;
    }
  }

  const srcset = html.match(/srcset=["']([^"']+)["']/i);
  if (srcset?.[1]) {
    const first = srcset[1].split(",")[0]?.trim().split(/\s+/)[0];
    const candidate = finalizeFeedImageCandidate(resolveImageUrl(first, link));
    if (candidate) return candidate;
  }

  return null;
}
