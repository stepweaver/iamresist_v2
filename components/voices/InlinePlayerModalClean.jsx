"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, X } from "lucide-react";
import ShareButton from "@/components/ShareButton";
import { getCanonicalBaseUrl } from "@/lib/siteConfig";
import useHorizontalSwipe from "@/components/useHorizontalSwipe";
import useModalFocusTrap from "@/components/useModalFocusTrap";
import { getYoutubeVideoId, youtubeThumbnailCandidates } from "@/lib/utils/youtube";
import { formatDate } from "@/lib/utils/date";
import { buildTelescreenHref, TELESCREEN_MODES } from "@/lib/telescreen";
import {
  belongsToArtist,
  creatorMoreRequest,
  finalizeProtestRelated,
  limitRelatedSections,
  uploadsDisplayStatus,
} from "@/lib/protestMusic/moreFromArtist";
const MOBILE_RELATED_CAP = 4;
const DESKTOP_RELATED_CAP = 6;
const YOUTUBE_ORIGINS = ["https://www.youtube.com", "https://www.youtube-nocookie.com"];

function isSameItem(a, b) {
  const aYt = getYoutubeVideoId(a?.url, a?.sourceId);
  const bYt = getYoutubeVideoId(b?.url, b?.sourceId);
  if (aYt && bYt) return aYt === bYt;
  return a?.url === b?.url || a?.id === b?.id;
}

function voiceMatchKey(voice) {
  const slug = voice?.slug;
  if (slug != null && String(slug).trim() !== "") {
    return `slug:${String(slug).trim().toLowerCase()}`;
  }
  const id = voice?.id;
  if (id != null && String(id).trim() !== "") {
    return `id:${String(id).trim()}`;
  }
  return "";
}

function sameCreator(a, b) {
  const aKey = voiceMatchKey(a?.voice);
  const bKey = voiceMatchKey(b?.voice);
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
  if (!item?.voice?.slug) return "/telescreen";
  const slug = item.voice.slug;
  if (item.sourceType === "protest-music") {
    return buildTelescreenHref({ mode: TELESCREEN_MODES.music, artist: slug });
  }
  if (item.sourceType === "curated-videos" || slug === "curated-videos") {
    return buildTelescreenHref({ mode: TELESCREEN_MODES.curated });
  }
  return buildTelescreenHref({ mode: TELESCREEN_MODES.voices, voice: slug });
}

const SHORT_FORM_MAX_SECONDS = 180;

function isShortForm(url, title, duration) {
  if (typeof url === "string" && /\/shorts\//i.test(url)) return true;
  if (typeof title === "string" && /#shorts\b/i.test(title)) return true;
  return duration > 0 && duration <= SHORT_FORM_MAX_SECONDS;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function descriptionLabel(item) {
  if (!item?.description) return null;
  if (item.isCurated === true || item.sourceType === "protest-music") {
    return {
      text: "Editorial note",
      className: "text-primary",
    };
  }
  return {
    text: "Source preview",
    className: "text-foreground/60",
  };
}

export default function InlinePlayerModalClean({ item, allItems = [], onClose, onSelectItem, onPlayStart }) {
  const [lazyExtraItems, setLazyExtraItems] = useState([]);
  const [protestMore, setProtestMore] = useState(null);
  const [lazyExtraLoading, setLazyExtraLoading] = useState(false);
  const [ytPlayerState, setYtPlayerState] = useState(-1);

  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mainScrollRef = useRef(null);
  const railScrollRef = useRef(null);
  const ytIframeRef = useRef(null);
  const progressBarRef = useRef(null);
  const progressFillRef = useRef(null);
  const ytProgressRef = useRef({ current: 0, duration: 0, at: 0, playing: false });
  const itemUrlRef = useRef(item?.url);
  const itemTitleRef = useRef(item?.title);
  itemUrlRef.current = item?.url;
  itemTitleRef.current = item?.title;

  useModalFocusTrap(dialogRef, closeButtonRef);

  const videoId = getYoutubeVideoId(item?.url, item?.sourceId);
  const isYouTube = Boolean(videoId);

  const embedUrl = useMemo(() => {
    if (!videoId) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({
      autoplay: "1",
      // Start muted — iOS always permits muted autoplay regardless of gesture
      // context. Timer-based unMute commands below restore audio within ~500ms.
      mute: "1",
      playsinline: "1",
      rel: "0",
      modestbranding: "1",
      enablejsapi: "1",
    });
    if (origin) params.set("origin", origin);
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  }, [videoId]);

  const creatorMore = useMemo(() => creatorMoreRequest(item), [item]);

  useEffect(() => {
    if (!creatorMore?.url) {
      setLazyExtraItems([]);
      setProtestMore(null);
      setLazyExtraLoading(false);
      return;
    }

    const ac = new AbortController();
    let cancelled = false;
    const protest = creatorMore.kind === "protest-music";

    setLazyExtraLoading(true);
    setLazyExtraItems([]);
    setProtestMore(null);

    (async () => {
      try {
        const res = await fetch(creatorMore.url, {
          signal: ac.signal,
        });
        if (cancelled) return;
        if (!res.ok) {
          if (protest) {
            let uploads = { status: "upstream_failed", reason: "request_failed", source: null, rssReason: null };
            try {
              const data = await res.json();
              if (data?.uploads?.status) uploads = data.uploads;
            } catch {
              /* The curated tracks already on the page stay in place. */
            }
            if (!cancelled) setProtestMore({ recent: [], featured: [], uploads });
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (protest) {
          setProtestMore({
            recent: Array.isArray(data.recent) ? data.recent : [],
            featured: Array.isArray(data.featured)
              ? data.featured
              : Array.isArray(data.items)
                ? data.items
                : [],
            uploads: data.uploads || null,
          });
        } else {
          setLazyExtraItems(Array.isArray(data.items) ? data.items : []);
        }
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
  }, [creatorMore?.url, creatorMore?.kind]);

  const artistSlug = item?.voice?.slug;
  const protestRelated = useMemo(() => {
    if (item?.sourceType !== "protest-music" && item?.isProtestMusic !== true) return null;
    const pageFeatured = Array.isArray(allItems)
      ? allItems.filter((it) => belongsToArtist(it, artistSlug) && !it.isDiscoveredUpload)
      : [];
    const apiFeatured = (protestMore?.featured || []).filter((it) => belongsToArtist(it, artistSlug));
    const curated = apiFeatured.length > 0 ? apiFeatured : pageFeatured;
    const uploads = (protestMore?.recent || []).filter((it) => belongsToArtist(it, artistSlug));
    return finalizeProtestRelated({ current: item, uploads, curated });
  }, [item, allItems, protestMore, artistSlug]);

  const moreFromCreator = useMemo(() => {
    if (!item || protestRelated) return [];
    const fromPage = Array.isArray(allItems)
      ? allItems.filter((it) => sameCreator(it, item) && !isSameItem(it, item))
      : [];
    const fromLazy = (lazyExtraItems || []).filter(
      (it) => sameCreator(it, item) && !isSameItem(it, item),
    );
    const merged = dedupeByVideoKey([...fromPage, ...fromLazy]);
    merged.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    return merged;
  }, [item, allItems, lazyExtraItems, protestRelated]);

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
  const prevItemRef = useRef(prevItem);
  prevItemRef.current = prevItem;
  const onPlayStartRef = useRef(onPlayStart);
  onPlayStartRef.current = onPlayStart;

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

    function sendCmd(func, args) {
      const iframe = ytIframeRef.current;
      if (!iframe?.contentWindow) return;
      // Use "*" so the command reaches YouTube regardless of exact iframe origin.
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func, args: args ?? "" }),
          "*",
        );
      } catch {}
    }

    function unmute() {
      sendCmd("unMute");
      sendCmd("setVolume", [100]);
    }

    // Re-read the ref inside this function so retries always hit the live iframe.
    function subscribe() {
      const iframe = ytIframeRef.current;
      if (!iframe?.contentWindow) return;
      const msg = JSON.stringify({ event: "listening" });
      try { iframe.contentWindow.postMessage(msg, "https://www.youtube-nocookie.com"); } catch {}
      try { iframe.contentWindow.postMessage(msg, "https://www.youtube.com"); } catch {}
      try { iframe.contentWindow.postMessage(msg, "*"); } catch {}
    }

    const sample = ytProgressRef.current;
    sample.current = 0;
    sample.duration = 0;
    sample.at = performance.now();
    sample.playing = false;

    function paintProgress() {
      const bar = progressBarRef.current;
      const fill = progressFillRef.current;
      if (!bar || !fill) return;
      const elapsed = sample.playing ? (performance.now() - sample.at) / 1000 : 0;
      const duration = sample.duration;
      const time = duration > 0 ? Math.min(duration, Math.max(0, sample.current + elapsed)) : 0;
      const visible = isShortForm(itemUrlRef.current, itemTitleRef.current, duration) && duration > 0;
      bar.style.opacity = visible ? "1" : "0";
      fill.style.transform = `scaleX(${duration > 0 ? time / duration : 0})`;
      const second = String(Math.floor(time));
      const shown = visible ? "1" : "0";
      if (bar.dataset.second !== second || bar.dataset.visible !== shown) {
        bar.dataset.second = second;
        bar.dataset.visible = shown;
        bar.setAttribute("aria-hidden", visible ? "false" : "true");
        bar.setAttribute("aria-valuemax", String(Math.round(duration) || 0));
        bar.setAttribute("aria-valuenow", String(Math.round(time)));
        bar.setAttribute(
          "aria-valuetext",
          duration > 0 ? `${formatClock(time)} of ${formatClock(duration)}` : "",
        );
      }
    }

    function noteTime(currentTime) {
      if (typeof currentTime !== "number" || !Number.isFinite(currentTime)) return;
      sample.current = currentTime;
      sample.at = performance.now();
    }

    function noteDuration(duration) {
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return;
      sample.duration = duration;
    }

    function onMessage(e) {
      if (!YOUTUBE_ORIGINS.includes(e.origin)) return;
      let data = e.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      const info = data?.info;
      if (info && typeof info === "object") {
        noteDuration(info.duration);
        noteTime(info.currentTime);
        if (typeof info.playerState === "number") {
          const playing = info.playerState === 1;
          if (playing !== sample.playing) sample.at = performance.now();
          sample.playing = playing;
        }
      }
      // Re-subscribe and unmute as soon as the player signals it is ready.
      if (data?.event === "onReady" || data?.event === "initialDelivery") {
        subscribe();
        unmute();
      }
      if (data?.event === "onStateChange") {
        const state = data?.info;
        setYtPlayerState(state);
        sample.playing = state === 1;
        sample.at = performance.now();
        if (state === 1) {
          unmute(); // confirmed playing — unmute if not already done
          onPlayStartRef.current?.();
        }
        if (state === 0) {
          if (sample.duration > 0) sample.current = sample.duration;
          sample.playing = false;
          const nxt = nextItemRef.current;
          if (nxt) onSelectItem?.(nxt);
        }
      }
      paintProgress();
    }

    window.addEventListener("message", onMessage);

    const iframe = ytIframeRef.current;
    if (iframe) iframe.addEventListener("load", subscribe);

    subscribe();
    paintProgress();
    let raf = 0;
    const frame = () => {
      paintProgress();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // Subscription retries to cover slow networks and delayed player.js init.
    const subTimers = [200, 500, 1000, 2000, 3500, 5000].map((ms) =>
      setTimeout(subscribe, ms),
    );
    // Timer-based unmute: fires independently of postMessage events.
    // Guarantees audio on videos where onReady/onStateChange are delayed or missed.
    // Uses "*" so it reaches player.js regardless of subscription state.
    const unmuteTimers = [400, 800, 1500, 2500].map((ms) =>
      setTimeout(unmute, ms),
    );
    // YouTube pushes duration once, then only updates currentTime after a poll.
    const progressPoll = setInterval(() => sendCmd("getCurrentTime"), 500);

    return () => {
      window.removeEventListener("message", onMessage);
      if (iframe) iframe.removeEventListener("load", subscribe);
      subTimers.forEach(clearTimeout);
      unmuteTimers.forEach(clearTimeout);
      clearInterval(progressPoll);
      cancelAnimationFrame(raf);
    };
  }, [isYouTube, videoId, onSelectItem]);

  // Media Session API — lock-screen metadata and controls.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!item) return;

    const thumbnailUrl = youtubeThumbnailCandidates(item.url, item.sourceId)[0] ?? null;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title || "Video",
        artist: item.voice?.title || "",
        album: "iamresist",
        artwork: thumbnailUrl
          ? [{ src: thumbnailUrl, sizes: "480x360", type: "image/jpeg" }]
          : [],
      });
    } catch {}

    function sendYtCmd(func) {
      const iframe = ytIframeRef.current;
      if (!iframe?.contentWindow) return;
      const msg = JSON.stringify({ event: "command", func, args: "" });
      for (const origin of YOUTUBE_ORIGINS) {
        try { iframe.contentWindow.postMessage(msg, origin); } catch {}
      }
    }

    try {
      navigator.mediaSession.setActionHandler("play", () => sendYtCmd("playVideo"));
      navigator.mediaSession.setActionHandler("pause", () => sendYtCmd("pauseVideo"));
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        const nxt = nextItemRef.current;
        if (nxt) onSelectItem?.(nxt);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        const prv = prevItemRef.current;
        if (prv) onSelectItem?.(prv);
      });
    } catch {}

    return () => {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
      } catch {}
    };
  }, [item, onSelectItem]);

  // Keep lock-screen playback indicator in sync with YouTube player state.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      if (ytPlayerState === 1) {
        navigator.mediaSession.playbackState = "playing";
      } else if (ytPlayerState === 2 || ytPlayerState === 5) {
        navigator.mediaSession.playbackState = "paused";
      }
    } catch {}
  }, [ytPlayerState]);

  // Screen Wake Lock — keeps the display on while a video is playing so the
  // screen never auto-locks and cuts off playback mid-video.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (ytPlayerState !== 1) return;

    let lock = null;
    let cancelled = false;

    async function acquire() {
      if (cancelled) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => {
          // Re-acquire after returning from background (e.g. switching apps and back).
          if (!cancelled) {
            document.addEventListener("visibilitychange", onVisible, { once: true });
          }
        });
      } catch {}
    }

    function onVisible() {
      if (!document.hidden && !cancelled) acquire();
    }

    acquire();

    return () => {
      cancelled = true;
      lock?.release().catch(() => {});
    };
  }, [ytPlayerState]);

  if (!item) return null;

  const baseUrl = getCanonicalBaseUrl();
  const shareUrl =
    item.isCurated === true && item.slug && baseUrl
      ? `${baseUrl}/curated/${item.slug}`
      : item.isProtestMusic === true && item.songSlug && baseUrl
        ? `${baseUrl}/music/${item.songSlug}`
        : item.url || "";
  const descriptionMeta = descriptionLabel(item);

  const renderSiblingButton = (sibling, idx) => {
    const thumbUrl = youtubeThumbnailCandidates(sibling.url, sibling.sourceId)[0] || null;
    const playing = isSameItem(sibling, item);
    return (
      <li key={sibling.id ?? sibling.url ?? idx}>
        <button
          type="button"
          onClick={() => onSelectItem?.(sibling)}
          aria-current={playing ? "true" : undefined}
          className={`flex w-full items-center gap-3 border p-2 text-left transition-colors ${playing
              ? "border-primary/60 bg-primary/10"
              : "border-border/30 hover:border-border/60 hover:bg-military-grey/15"
            }`}
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
  };

  const renderRelatedList = (cap) => {
    const creatorName = item.voice?.title || "this creator";
    const protestShown = protestRelated ? limitRelatedSections(protestRelated.recent, protestRelated.featured, cap) : null;
    const shown = protestShown ? [] : moreFromCreator.slice(0, cap);
    const count = protestRelated
      ? protestRelated.recent.length + protestRelated.featured.length
      : moreFromCreator.length;
    const label = count > 0 ? `More from ${creatorName} (${count})` : `More from ${creatorName}`;
    const receivedRecentCount = Array.isArray(protestMore?.recent) ? protestMore.recent.length : 0;
    const matchedRecentCount = (protestMore?.recent || []).filter((it) => belongsToArtist(it, artistSlug)).length;
    const uploadsStatus = protestRelated
      ? uploadsDisplayStatus({
          uploads: protestMore?.uploads,
          receivedRecentCount,
          matchedRecentCount,
          settledRecentCount: protestRelated.recent.length,
          renderedRecentCount: protestShown?.recent.length || 0,
        })
      : null;
    const uploadsNote =
      uploadsStatus === "upstream_failed"
        ? "Recent uploads are temporarily unavailable."
        : uploadsStatus === "rejected"
          ? "Recent uploads could not be verified for this channel."
          : uploadsStatus === "not_rendered"
            ? "Recent uploads could not be shown."
            : null;

    return (
      <div
        className="border-border/50 mt-2 border-t pt-4 md:mt-0 md:border-t-0 md:pt-0"
        data-uploads-status={uploadsStatus || undefined}
        data-uploads-reason={protestMore?.uploads?.reason || undefined}
        data-uploads-source={protestMore?.uploads?.source || undefined}
      >
        <span className="hud-label mb-3 block text-[10px] sm:text-xs">{label}</span>
        {lazyExtraLoading ? (
          <p className="mb-2 font-mono text-[10px] text-foreground/50">Loading more…</p>
        ) : null}
        {uploadsNote ? (
          <p className="mb-2 font-mono text-[10px] text-foreground/50" data-testid="protest-uploads-note">
            {uploadsNote}
          </p>
        ) : null}
        {protestShown ? (
          <>
            {protestShown.recent.length > 0 ? (
              <div>
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-foreground/60">
                  Recent from {creatorName}
                </span>
                <ul className="space-y-2" data-testid="protest-recent">
                  {protestShown.recent.map(renderSiblingButton)}
                </ul>
              </div>
            ) : null}
            {protestShown.featured.length > 0 ? (
              <div className={protestShown.recent.length > 0 ? "mt-4" : undefined}>
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-foreground/60">
                  Featured on I AM [RESIST]
                </span>
                <ul className="space-y-2" data-testid="protest-featured">
                  {protestShown.featured.map(renderSiblingButton)}
                </ul>
              </div>
            ) : null}
          </>
        ) : shown.length > 0 ? (
          <ul className="space-y-2">
            {shown.map(renderSiblingButton)}
          </ul>
        ) : null}
        <Link
          href={intelUrlForCreator(item)}
          onClick={onClose}
          className="button-label mt-3 inline-flex w-full items-center justify-center border border-primary/50 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
        >
          View more from {creatorName} →
        </Link>
      </div>
    );
  };

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
        className="relative flex h-full max-h-dvh w-full min-h-0 flex-col overflow-hidden border-0 border-white/10 bg-background machine-panel hud-stage md:h-auto md:max-h-[90vh] md:max-w-6xl md:rounded-sm md:border"
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
              heading={item.isProtestMusic ? 'Share song' : 'Share video'}
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
                  key={videoId}
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
              {isYouTube ? (
                <div
                  ref={progressBarRef}
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1 bg-white/35 opacity-0"
                  role="progressbar"
                  aria-label="Video progress"
                  aria-hidden="true"
                  aria-valuemin={0}
                  aria-valuemax={0}
                  aria-valuenow={0}
                >
                  <div
                    ref={progressFillRef}
                    className="h-full w-full origin-left bg-white"
                    style={{ transform: "scaleX(0)" }}
                  />
                </div>
              ) : null}
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
                  <div>
                    {descriptionMeta ? (
                      <p
                        className={`mb-2 font-mono text-[10px] uppercase tracking-wider ${descriptionMeta.className}`}
                      >
                        {descriptionMeta.text}
                      </p>
                    ) : null}
                    <p className="prose-copy whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                      {item.description}
                    </p>
                  </div>
                ) : null}
                {item.voice ? <div className="md:hidden">{renderRelatedList(MOBILE_RELATED_CAP)}</div> : null}
              </div>
            </div>
          </div>

          {item.voice ? (
            <aside
              ref={railScrollRef}
              className="hidden min-h-0 w-72 shrink-0 overflow-y-auto overscroll-y-contain border-border md:flex md:flex-col md:border-l"
            >
              <div className="p-4">{renderRelatedList(DESKTOP_RELATED_CAP)}</div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

