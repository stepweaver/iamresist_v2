"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import FilterDropdown from "@/components/FilterDropdown";
import VoiceCard from "@/components/voices/VoiceCard";
import InlinePlayerModal from "@/components/voices/InlinePlayerModalClean";
import { useMediaKeepAlive } from "@/components/useMediaKeepAlive";
import { VOICES_ARCHIVE_PAGE_SIZE } from "@/lib/constants";
import {
  buildTelescreenHref,
  TELESCREEN_FEED_STATUS,
  TELESCREEN_MODES,
  TELESCREEN_MODE_OPTIONS,
  telescreenCollectionMessage,
  telescreenDirectoryMessage,
} from "@/lib/telescreen";
import { beginCollectionRefresh, finishCollectionRefresh } from "@/lib/telescreen/refreshLifecycle";

const MODE_COPY = {
  [TELESCREEN_MODES.curated]: {
    title: "Curated Videos",
    detail: "Editorially selected political videos collected in the archive.",
    empty: "No curated videos are available right now.",
  },
  [TELESCREEN_MODES.voices]: {
    title: "Voices of Dissent",
    detail: "Video feeds from dissenting creators and commentators, filterable by voice.",
    empty: "No voice videos match the current filters.",
  },
  [TELESCREEN_MODES.music]: {
    title: "Protest Music",
    detail: "Protest songs, performances, and resistance music collected by artist.",
    empty: "No protest music matches the current filters.",
  },
};

export default function VoicesArchiveClient({
  initialItems,
  initialHasMore,
  initialFeedStatus = TELESCREEN_FEED_STATUS.ok,
  voicesDirectoryFailed = false,
  voices,
  artists = [],
  currentVoice,
  currentMode,
  currentArtist,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [feedStatus, setFeedStatus] = useState(initialFeedStatus);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const { startKeepAlive, stopKeepAlive } = useMediaKeepAlive();
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef({ requestId: 0, refreshing: false });
  const sentinelRef = useRef(null);
  const shouldScrollResultsRef = useRef(false);

  const modeParam = searchParams.get("mode") || TELESCREEN_MODES.voices;
  const voiceParam = searchParams.get("voice") ?? "";
  const artistParam = searchParams.get("artist") ?? "";
  const activeMode = currentMode || modeParam || TELESCREEN_MODES.voices;

  const handleRefresh = useCallback(() => {
    const next = beginCollectionRefresh(refreshRef.current);
    refreshRef.current = next;
    setRefreshing(true);
    router.refresh();
  }, [router]);

  useEffect(() => {
    const next = finishCollectionRefresh(refreshRef.current, refreshRef.current.requestId);
    if (next !== refreshRef.current) {
      refreshRef.current = next;
      setRefreshing(next.refreshing);
    }
  }, [initialItems, initialHasMore]);

  useEffect(() => {
    if (!refreshing) return undefined;
    const requestId = refreshRef.current.requestId;
    const timer = window.setTimeout(() => {
      const next = finishCollectionRefresh(refreshRef.current, requestId);
      refreshRef.current = next;
      setRefreshing(next.refreshing);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [refreshing]);

  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialHasMore);
    setFeedStatus(initialFeedStatus);
    setPage(1);
    setActiveItem(null);
  }, [modeParam, voiceParam, artistParam, initialItems, initialHasMore, initialFeedStatus]);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 0) setHasUserScrolled(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!shouldScrollResultsRef.current) {
      return;
    }
    shouldScrollResultsRef.current = false;
    requestAnimationFrame(() => {
      document.getElementById("telescreen-archive-primary")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [modeParam, voiceParam, artistParam]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const nextPage = page + 1;
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("limit", String(VOICES_ARCHIVE_PAGE_SIZE));
    if (activeMode !== TELESCREEN_MODES.voices) params.set("mode", activeMode);
    if (voiceParam) params.set("voice", voiceParam);
    if (artistParam) params.set("artist", artistParam);

    try {
      const res = await fetch(`/api/voices-archive?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (
        data.feedStatus === TELESCREEN_FEED_STATUS.unavailable ||
        data.feedStatus === TELESCREEN_FEED_STATUS.invalid
      ) {
        setFeedStatus((current) => (items.length === 0 ? data.feedStatus : current));
        setHasMore(false);
        return;
      }
      if (data.items?.length) {
        setItems((prev) => [...prev, ...data.items]);
      }
      setHasMore(Boolean(data.hasMore));
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [activeMode, artistParam, hasMore, items.length, loading, page, voiceParam]);

  useEffect(() => {
    if (!hasMore || !hasUserScrolled) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(() => loadMore(), {
      root: null,
      rootMargin: "200px",
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, hasUserScrolled, loadMore]);

  const navigateTo = useCallback(
    ({ mode, voice, artist }) => {
      shouldScrollResultsRef.current = true;
      router.push(buildTelescreenHref({ mode, voice, artist }));
    },
    [router]
  );

  const handleModeSelect = useCallback(
    (mode) => {
      setModeDropdownOpen(false);
      navigateTo({
        mode,
        voice: mode === TELESCREEN_MODES.voices ? voiceParam || null : null,
        artist: mode === TELESCREEN_MODES.music ? artistParam || null : null,
      });
    },
    [artistParam, navigateTo, voiceParam]
  );

  const handleVoiceChange = useCallback(
    (voice) => {
      setVoiceDropdownOpen(false);
      navigateTo({ mode: TELESCREEN_MODES.voices, voice: voice || null, artist: null });
    },
    [navigateTo]
  );

  const handleArtistChange = useCallback(
    (artist) => {
      setArtistDropdownOpen(false);
      navigateTo({ mode: TELESCREEN_MODES.music, voice: null, artist: artist || null });
    },
    [navigateTo]
  );

  const showVoiceFilter = activeMode === TELESCREEN_MODES.voices;
  const showArtistFilter = activeMode === TELESCREEN_MODES.music && artists.length > 0;
  const selectedModeLabel =
  TELESCREEN_MODE_OPTIONS.find((option) => option.value === activeMode)?.label || "Voices of Dissent";
  const selectedSlug = currentVoice ?? voiceParam;
  const selectedVoiceLabel =
    voices.find((voice) => voice.slug === selectedSlug)?.title || selectedSlug || "All voices";
  const selectedArtistLabel =
    artists.find((artist) => artist.slug === (currentArtist ?? artistParam))?.title || "All artists";

  const voiceOptions = useMemo(
    () => [{ value: "", label: "All voices" }, ...voices.map((voice) => ({ value: voice.slug, label: voice.title }))],
    [voices]
  );
  const artistOptions = useMemo(
    () => [{ value: "", label: "All artists" }, ...artists.map((artist) => ({ value: artist.slug, label: artist.title }))],
    [artists]
  );

  const modeCopy = MODE_COPY[activeMode] || MODE_COPY[TELESCREEN_MODES.voices];
  const collectionMessage = telescreenCollectionMessage(activeMode, feedStatus);
  const directoryMessage = showVoiceFilter ? telescreenDirectoryMessage(voicesDirectoryFailed) : null;

  return (
    <div className="space-y-5">
      <nav
        aria-label="Breadcrumb"
        className="sticky top-0 z-20 -mx-1 px-1 sm:-mx-2 sm:px-2 lg:-mx-3 lg:px-3 py-2.5 bg-background border-b border-border shadow-[0_1px_0_0_var(--border-color)]"
      >
        <ol className="nav-label flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground/70 max-w-[1600px] mx-auto flex-wrap">
          <li>
            <Link href={buildTelescreenHref({ mode: activeMode })} className="hover:text-primary transition-colors">
              {modeCopy.title}
            </Link>
          </li>
          {(showVoiceFilter && (currentVoice || voiceParam)) || (showArtistFilter && (currentArtist || artistParam)) ? (
            <>
              <li aria-hidden className="text-foreground/40">
                /
              </li>
              <li className="text-foreground truncate" aria-current="page">
                {showVoiceFilter ? selectedVoiceLabel : selectedArtistLabel}
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <section className="machine-panel border border-border p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase block">
              Telescreen mode
            </span>
            <h2 className="section-title text-xl sm:text-2xl font-bold text-foreground">{modeCopy.title}</h2>
            <p className="text-xs sm:text-sm text-foreground/70 uppercase tracking-wider">{modeCopy.detail}</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
            className="button-label inline-flex items-center gap-1.5 text-xs font-bold text-foreground/70 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Refresh collection"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>

        <div
          id="telescreen-archive-toolbar"
          className="flex flex-col gap-4 sm:gap-3 border-t border-border/60 pt-4 scroll-mt-20"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <FilterDropdown
              label="Mode"
              selectedLabel={selectedModeLabel}
              options={TELESCREEN_MODE_OPTIONS}
              value={activeMode}
              onChange={handleModeSelect}
              isOpen={modeDropdownOpen}
              onToggle={() => setModeDropdownOpen((open) => !open)}
              onClose={() => setModeDropdownOpen(false)}
              ariaLabel="Choose telescreen mode"
              className="relative min-w-0 lg:w-[20rem]"
            />

            {showVoiceFilter ? (
              <FilterDropdown
                label="Voice"
                selectedLabel={selectedVoiceLabel}
                options={voiceOptions}
                value={currentVoice ?? voiceParam}
                onChange={(value) => handleVoiceChange(value || null)}
                isOpen={voiceDropdownOpen}
                onToggle={() => setVoiceDropdownOpen((open) => !open)}
                onClose={() => setVoiceDropdownOpen(false)}
                ariaLabel="Choose voice"
                className="relative min-w-0 lg:flex-1"
              />
            ) : null}

            {showArtistFilter ? (
              <FilterDropdown
                label="Artist"
                selectedLabel={selectedArtistLabel}
                options={artistOptions}
                value={currentArtist ?? artistParam}
                onChange={(value) => handleArtistChange(value || null)}
                isOpen={artistDropdownOpen}
                onToggle={() => setArtistDropdownOpen((open) => !open)}
                onClose={() => setArtistDropdownOpen(false)}
                ariaLabel="Choose artist"
                className="relative min-w-0 lg:flex-1"
              />
            ) : null}
          </div>
        </div>
      </section>

      <div id="telescreen-archive-primary">
        {directoryMessage ? (
          <p className="system-label text-foreground/70 text-sm mb-4">{directoryMessage}</p>
        ) : null}
        {items.length === 0 ? (
          <p className="system-label text-foreground/70 text-sm" data-feed-status={feedStatus}>
            {collectionMessage}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {items.map((item, index) => (
                <li key={`${item.id ?? item.url}-${index}`}>
                  <VoiceCard
                    item={item}
                    onPlay={(it) => { setActiveItem(it); }}
                    priority={index < 6}
                  />
                </li>
              ))}
            </ul>

            {activeItem ? (
              <InlinePlayerModal
                item={activeItem}
                allItems={items}
                onClose={() => { stopKeepAlive(); setActiveItem(null); }}
                onSelectItem={setActiveItem}
                onPlayStart={startKeepAlive}
              />
            ) : null}

            {hasMore ? (
              <div ref={sentinelRef} className="py-6" aria-hidden>
                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="machine-panel border border-border animate-pulse h-64" />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
