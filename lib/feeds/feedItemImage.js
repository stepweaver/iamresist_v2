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
const HAARETZ_HOST_RE = /(haarets\.co\.il|haaretz\.co\.il|haaretz\.com|haaretz\.co\.uk)/i;

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

function isTinyHaaretzThumb(url) {
  try {
    const parsed = new URL(url);
    if (!HAARETZ_HOST_RE.test(parsed.hostname)) return false;
    const width = parseInt(parsed.searchParams.get("width") || "0", 10);
    const height = parseInt(parsed.searchParams.get("height") || "0", 10);
    if (width > 0 && width <= 480) return true;
    if (height > 0 && height <= 360) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Haaretz often syndicates the same article image with tiny width/height params in RSS.
 * Keep the feed-native asset, but request a readable width instead of rendering the tiny thumb.
 * @param {string} url
 * @returns {string}
 */
function upgradeHaaretzImageUrl(url) {
  try {
    const u = new URL(url);
    if (!HAARETZ_HOST_RE.test(u.hostname) || !isTinyHaaretzThumb(url)) return url;
    u.searchParams.delete("height");
    u.searchParams.delete("h");
    const width = parseInt(u.searchParams.get("width") || u.searchParams.get("w") || "0", 10);
    if (!Number.isFinite(width) || width < 900) {
      if (u.searchParams.has("width")) u.searchParams.set("width", "1200");
      else u.searchParams.set("w", "1200");
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
  const trimmed = url.trim();
  return upgradeRapplerTachyonImageUrl(upgradeHaaretzImageUrl(trimmed));
}

function shouldSkipImgCandidate(url) {
  if (!url || typeof url !== "string") return true;
  const u = url.toLowerCase();
  /** Meduza RSS enclosures point at imgly/share — rendered headline cards, not photos; they crop badly in card frames. */
  if (u.includes("meduza.io") && u.includes("/imgly/share/")) return true;
  /** Federal Register `og:image` is typically site chrome/placeholder, not article-specific photography. */
  if (u.includes("federalregister.gov")) return true;
  if (isRapplerTachyonTinyOrIcon(url)) return true;
  if (u.includes("facebook.com/tr")) return true;
  if (u.includes("google-analytics.com")) return true;
  if (u.includes("doubleclick.net")) return true;
  if (u.includes("1x1") && (u.includes("pixel") || u.includes("gif"))) return true;
  if (u.includes("spacer.gif")) return true;
  if (u.includes("gravatar.com") && u.includes("s=16")) return true;
  return false;
}

function skipReasonForImgCandidate(url) {
  if (!url || typeof url !== "string") return "empty_or_invalid";
  const u = url.toLowerCase();
  if (u.includes("meduza.io") && u.includes("/imgly/share/")) return "meduza_share_card";
  if (u.includes("federalregister.gov")) return "federal_register_placeholder";
  if (isRapplerTachyonTinyOrIcon(url)) return "rappler_tachyon_tiny";
  if (u.includes("facebook.com/tr")) return "tracking_pixel_facebook";
  if (u.includes("google-analytics.com")) return "tracking_pixel_google_analytics";
  if (u.includes("doubleclick.net")) return "tracking_pixel_doubleclick";
  if (u.includes("1x1") && (u.includes("pixel") || u.includes("gif"))) return "tracking_pixel_1x1";
  if (u.includes("spacer.gif")) return "spacer_gif";
  if (u.includes("gravatar.com") && u.includes("s=16")) return "tiny_gravatar";
  return null;
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
 * Inspectable skip reason for audit/debug routes.
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function getFeedImageSkipReason(url) {
  if (!url || typeof url !== "string") return "empty_or_invalid";
  return skipReasonForImgCandidate(url.trim());
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

function inspectCandidate(rawUrl, baseUrl) {
  const resolvedUrl = resolveImageUrl(rawUrl, baseUrl);
  if (!resolvedUrl) {
    return {
      rawUrl: typeof rawUrl === "string" ? rawUrl : null,
      resolvedUrl: null,
      finalUrl: null,
      accepted: false,
      skipReason: "unresolvable_url",
    };
  }
  const skipReason = skipReasonForImgCandidate(resolvedUrl);
  if (skipReason) {
    return {
      rawUrl: typeof rawUrl === "string" ? rawUrl : null,
      resolvedUrl,
      finalUrl: null,
      accepted: false,
      skipReason,
    };
  }
  const finalUrl = polishFeedCardImageUrl(resolvedUrl);
  return {
    rawUrl: typeof rawUrl === "string" ? rawUrl : null,
    resolvedUrl,
    finalUrl,
    accepted: Boolean(finalUrl),
    skipReason: finalUrl ? null : "finalize_failed",
  };
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

function pickBestSrcsetCandidate(raw) {
  if (!raw || typeof raw !== "string") return null;
  const entries = raw
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const [url, descriptor] = trimmed.split(/\s+/, 2);
      const widthMatch = descriptor?.match(/^(\d+)w$/i);
      return {
        url,
        width: widthMatch ? parseInt(widthMatch[1], 10) : 0,
      };
    })
    .filter(Boolean);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.width - a.width);
  return entries[0]?.url ?? null;
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
  return inspectFeedItemImage(item).image;
}

/**
 * Audit-focused image extraction report for one parsed feed item.
 * Keeps the production extraction order identical to {@link extractFeedImage}.
 * @param {Record<string, unknown>} item
 */
export function inspectFeedItemImage(item) {
  const link = item.link || item.links?.[0]?.href || "";
  const candidates = [];
  let accepted = null;

  function consider(stage, rawUrl) {
    const inspected = inspectCandidate(rawUrl, link);
    const candidate = {
      stage,
      ...inspected,
    };
    candidates.push(candidate);
    if (!accepted && candidate.accepted && candidate.finalUrl) {
      accepted = candidate;
    }
    return candidate;
  }

  for (const enc of collectEnclosures(item)) {
    const u = enc?.url;
    if (!u) continue;
    const t = enc.type || "";
    if (t.startsWith("image/") || (!t && looksLikeImageUrl(u))) {
      const candidate = consider("enclosure", u);
      if (candidate.accepted) {
        return {
          image: candidate.finalUrl,
          acceptedCandidate: candidate,
          firstCandidate: candidates[0] ?? null,
          skippedByPolicy: false,
          skipReason: null,
          candidates,
        };
      }
    }
  }

  for (const L of item.links || []) {
    const href = L.href || L.url;
    if (!href) continue;
    const type = L.type || "";
    if (type.startsWith("image/")) {
      const candidate = consider("link:image", href);
      if (candidate.accepted) {
        return {
          image: candidate.finalUrl,
          acceptedCandidate: candidate,
          firstCandidate: candidates[0] ?? null,
          skippedByPolicy: false,
          skipReason: null,
          candidates,
        };
      }
    }
    if ((L.rel === "enclosure" || L.rel === "preview") && looksLikeImageUrl(href)) {
      const candidate = consider(`link:${L.rel}`, href);
      if (candidate.accepted) {
        return {
          image: candidate.finalUrl,
          acceptedCandidate: candidate,
          firstCandidate: candidates[0] ?? null,
          skippedByPolicy: false,
          skipReason: null,
          candidates,
        };
      }
    }
  }

  const thumb = item["media:thumbnail"]?.[0]?.$?.url;
  if (thumb) {
    const candidate = consider("media:thumbnail", thumb);
    if (candidate.accepted) {
      return {
        image: candidate.finalUrl,
        acceptedCandidate: candidate,
        firstCandidate: candidates[0] ?? null,
        skippedByPolicy: false,
        skipReason: null,
        candidates,
      };
    }
  }

  const media = item["media:content"]?.find((m) => {
    const type = m?.$?.type ?? "";
    const medium = m?.$?.medium ?? "";
    return type.startsWith("image/") || medium === "image";
  })?.$?.url;
  if (media) {
    const candidate = consider("media:content", media);
    if (candidate.accepted) {
      return {
        image: candidate.finalUrl,
        acceptedCandidate: candidate,
        firstCandidate: candidates[0] ?? null,
        skippedByPolicy: false,
        skipReason: null,
        candidates,
      };
    }
  }

  const htmlParts = [
    item["content:encoded"],
    item.content,
    item.summary,
    item.description,
  ].filter(Boolean);
  const html = htmlParts.join("\n");

  const htmlOg = extractMetaOgFromHtml(html, link);
  if (htmlOg) {
    const candidate = consider("html:meta-og", htmlOg);
    if (candidate.accepted) {
      return {
        image: candidate.finalUrl,
        acceptedCandidate: candidate,
        firstCandidate: candidates[0] ?? null,
        skippedByPolicy: false,
        skipReason: null,
        candidates,
      };
    }
  }

  const imgPatterns = [
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+data-src=["']([^"']+)["']/gi,
  ];
  for (const re of imgPatterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const candidate = consider("html:img", m[1]);
      if (candidate.accepted) {
        return {
          image: candidate.finalUrl,
          acceptedCandidate: candidate,
          firstCandidate: candidates[0] ?? null,
          skippedByPolicy: false,
          skipReason: null,
          candidates,
        };
      }
    }
  }

  const srcset = html.match(/srcset=["']([^"']+)["']/i);
  if (srcset?.[1]) {
    const best = pickBestSrcsetCandidate(srcset[1]);
    const candidate = consider("html:srcset", best);
    if (candidate.accepted) {
      return {
        image: candidate.finalUrl,
        acceptedCandidate: candidate,
        firstCandidate: candidates[0] ?? null,
        skippedByPolicy: false,
        skipReason: null,
        candidates,
      };
    }
  }

  const firstSkipped = candidates.find((candidate) => candidate.skipReason);
  return {
    image: null,
    acceptedCandidate: null,
    firstCandidate: candidates[0] ?? null,
    skippedByPolicy: Boolean(firstSkipped),
    skipReason: firstSkipped?.skipReason ?? null,
    candidates,
  };
}
