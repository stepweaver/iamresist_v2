"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Play, X } from "lucide-react";
import ShareButton from "@/components/ShareButton";
import useHorizontalSwipe from "@/components/useHorizontalSwipe";
import useModalFocusTrap from "@/components/useModalFocusTrap";
import { getYoutubeVideoId, youtubeThumbnailCandidates } from "@/lib/utils/youtube";
import { formatDate } from "@/lib/utils/date";

const MOBILE_RELATED_CAP = 4;
const DESKTOP_RELATED_CAP = 6;

function isSameItem(a, b) {
  const aYt = getYoutubeVideoId(a?.url, a?.sourceId);
  const bYt = getYoutubeVideoId(b?.url, b?.sourceId);
  if (aYt && bYt) return aYt === bYt;
  return a?.url === b?.url || a?.id === b?.id;
}

function sameCreator(a, b) {
  const aKey = a?.voice?.slug || a?.voice?.id;
  const bKey = b?.voice?.slug || b?.voice?.id;
  return aKey && bKey && aKey === bKey;
}

function dedupeByVideoKey(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const yt = getYoutubeVideoId(it?.url, it?.sourceId);
    const key = yt ? `yt:${yt}` : it?.url ? `url:${it.url}` : it?.id || null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function intelUrlForCreator(item) {
  if (item?.sourceType === "curated-videos" || item?.voice?.slug === "curated-videos") {
    return "/voices?source=curated-videos";
  }
  if (!item?.voice?.slug) return "/voices";
  return `/voices?source=voices&voice=${encodeURIComponent(item.voice.slug)}`;
}

export default function InlinePlayerModalClean({ item, allItems = [], onClose, onSelectItem }) {
  const [lazyExtraItems, setLazyExtraItems] = useState([]);
  const [lazyExtraLoading, setLazyExtraLoading] = useState(false);

  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mainScrollRef = useRef(null);
  const railScrollRef = useRef(null);
  const ytIframeRef = useRef(null);

  useModalFocusTrap(dialogRef, closeButtonRef);

  const videoId = getYoutubeVideoId(item?.url, item?.sourceId);
  const isYouTube = Boolean(videoId);
  const embedUrl = isYouTube
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${
        typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""
      }`
    : "";

  const creatorSlug = useMemo(() => {
    const slug = item?.voice?.slug;
    return slug ? String(slug).trim().toLowerCase() : "";
  }, [item?.voice?.slug]);

  const isCuratedBucket = useMemo(
    () => item?.sourceType === "curated-videos" || creatorSlug === "curated-videos",
    [item?.sourceType, creatorSlug]
  );

  useEffect(() => {
    if (!isCuratedBucket && !creatorSlug) {
      setLazyExtraItems([]);
      setLazyExtraLoading(false);
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    setLazyExtraLoading(true);
    setLazyExtraItems([]);

    const url = isCuratedBucket
      ? "/api/voices-more?bucket=curated"
      : `/api/voices-more?slug=${encodeURIComponent(creatorSlug)}`;

    (async () => {
      try {
        const res = await fetch(url, {
          signal: ac.signal,
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setLazyExtraItems(Array.isArray(data.items) ? data.items : []);
      } catch (e) {
        if (e?.name === "AbortError") return;
      } finally {
        if (!cancelled) setLazyExtraLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [creatorSlug, isCuratedBucket]);

  const moreFromCreator = useMemo(() => {
    if (!item) return [];
    const fromPage = Array.isArray(allItems)
      ? allItems.filter((it) => sameCreator(it, item) && !isSameItem(it, item))
      : [];
    const fromLazy = (lazyExtraItems || []).filter(
      (it) => sameCreator(it, item) && !isSameItem(it, item),
    );
    const merged = dedupeByVideoKey([...fromPage, ...fromLazy]);
    merged.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    return merged;
  }, [item, allItems, lazyExtraItems]);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    railScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [item?.id, item?.url]);

  const currentIndex = useMemo(
    () => allItems.findIndex((candidate) => isSameItem(candidate, item)),
    [allItems, item],
  );
  const prevItem = currentIndex > 0 ? allItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null;

  const nextItemRef = useRef(nextItem);
  nextItemRef.current = nextItem;

  const swipeHandlers = useHorizontalSwipe({
    onSwipeLeft: () => nextItem && onSelectItem?.(nextItem),
    onSwipeRight: () => prevItem && onSelectItem?.(prevItem),
  });

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowLeft" && prevItem) onSelectItem?.(prevItem);
      if (e.key === "ArrowRight" && nextItem) onSelectItem?.(nextItem);
    };

    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const { body } = document;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.overflow = "hidden";

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.overflow = "";
      window.scrollTo(scrollX, scrollY);
    };
  }, [prevItem, nextItem, onClose, onSelectItem]);

  useEffect(() => {
    if (!isYouTube || !videoId) return;
    const iframe = ytIframeRef.current;
    if (!iframe) return;

    function subscribe() {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening" }), "https://www.youtube.com");
    }

    function onMessage(e) {
      if (e.origin !== "https://www.youtube.com") return;
      let data = e.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (data?.event === "onStateChange" && data?.info === 0) {
        const nxt = nextItemRef.current;
        if (nxt) onSelectItem?.(nxt);
      }
    }

    iframe.addEventListener("load", subscribe);
    subscribe();
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      iframe.removeEventListener("load", subscribe);
    };
  }, [isYouTube, videoId, onSelectItem]);

  if (!item) return null;

  const shareUrl = item.url || "";
  const relatedShown = moreFromCreator.slice(0, DESKTOP_RELATED_CAP);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/85 md:items-center md:justify-center md:p-4"
      style={{ touchAction: "pan-y" }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inline-player-title"
        className="relative flex h-full max-h-dvh w-full min-h-0 flex-col overflow-hidden border-0 border-white/10 bg-background machine-panel md:h-auto md:max-h-[90vh] md:max-w-6xl md:rounded-sm md:border"
        onClick={(e) => e.stopPropagation()}
        {...swipeHandlers}
      >
        <div className="flex shrink-0 items-center border-b border-border px-3 py-2">
          <div className="flex flex-1 justify-center md:hidden">
            <div className="h-1 w-10 shrink-0 rounded-full bg-foreground/30" aria-hidden />
          </div>
          <div className="hidden flex-1 md:block" aria-hidden />
          <div className="flex shrink-0 items-center gap-3">
            <ShareButton
              url={shareUrl}
              title={item.title}
              description={item.voice?.title || item.description}
              iconOnly={true}
              className="border border-border/50 bg-military-grey p-2 text-foreground/90 hover:bg-military-black hover:text-primary hover:border-primary/50"
            />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="border border-border bg-military-grey p-2 text-foreground/90 hover:bg-military-black focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative aspect-video w-full max-h-[45vh] min-h-[200px] shrink-0 bg-black">
              {isYouTube ? (
                <iframe
                  ref={ytIframeRef}
                  src={embedUrl}
                  title={item.title || "YouTube video"}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-foreground/70 text-sm">
                  No embeddable video for this item.
                </div>
              )}
            </div>

            <div className="shrink-0 border-b border-border px-4 py-3">
              <h2 id="inline-player-title" className="font-ui break-words text-sm font-bold text-foreground">
                {item.title || "Untitled"}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {item.voice?.title ? (
                  <p className="text-xs uppercase tracking-wider text-foreground/60">{item.voice.title}</p>
                ) : null}
                {item.publishedAt ? (
                  <span className="font-mono text-[10px] text-foreground/50 tabular-nums">
                    {formatDate(item.publishedAt)}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => prevItem && onSelectItem?.(prevItem)}
                  disabled={!prevItem}
                  className="border border-border bg-military-grey p-2 text-foreground/90 hover:bg-military-black disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Previous item"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => nextItem && onSelectItem?.(nextItem)}
                  disabled={!nextItem}
                  className="border border-border bg-military-grey p-2 text-foreground/90 hover:bg-military-black disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Next item"
                >
                  →
                </button>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-label inline-flex items-center gap-2 border border-border/60 bg-military-grey px-3 py-2 text-xs font-bold text-foreground hover:border-primary hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                    Open source
                  </a>
                ) : null}
                {currentIndex >= 0 && allItems.length ? (
                  <span className="ml-auto font-mono text-[10px] text-foreground/50 tabular-nums">
                    {currentIndex + 1} / {allItems.length}
                  </span>
                ) : null}
              </div>
            </div>

            <div ref={mainScrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
              <div className="space-y-4 px-4 py-3">
                {item.description ? (
                  <p className="prose-copy whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                    {item.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {item.voice ? (
            <aside
              ref={railScrollRef}
              className="hidden min-h-0 w-72 shrink-0 overflow-y-auto overscroll-y-contain border-border md:flex md:flex-col md:border-l"
            >
              <div className="p-4 border-b border-border">
                <span className="font-mono block text-[10px] text-hud-dim tracking-wider uppercase">
                  More from {item.voice?.title || "this creator"}
                </span>
              </div>
              <div className="p-4">
                {lazyExtraLoading ? (
                  <p className="mb-2 font-mono text-[10px] text-foreground/50">Loading more…</p>
                ) : null}
                <ul className="space-y-2">
                  {relatedShown.map((sibling, idx) => {
                    const thumbUrl = youtubeThumbnailCandidates(sibling.url, sibling.sourceId)[0] || null;
                    return (
                      <li key={sibling.id ?? sibling.url ?? idx}>
                        <button
                          type="button"
                          onClick={() => onSelectItem?.(sibling)}
                          className="flex w-full items-center gap-3 border border-border/30 hover:border-border/60 hover:bg-military-grey/15 p-2 text-left"
                        >
                          <div className="relative h-11 w-20 shrink-0 overflow-hidden bg-military-grey">
                            {thumbUrl ? (
                              <Image
                                src={thumbUrl}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="80px"
                                unoptimized
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Play className="h-4 w-4 text-white/90" aria-hidden />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-semibold text-foreground">
                              {sibling.title || "Untitled"}
                            </p>
                            {sibling.publishedAt ? (
                              <span className="font-mono text-[10px] text-foreground/50">
                                {formatDate(sibling.publishedAt)}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={intelUrlForCreator(item)}
                  onClick={onClose}
                  className="button-label mt-3 inline-flex w-full items-center justify-center border border-primary/50 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  View more from {item.voice?.title || "this creator"} →
                </Link>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

