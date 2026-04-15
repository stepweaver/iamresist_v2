"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import FilterDropdown from "@/components/FilterDropdown";
import VoiceCard from "@/components/voices/VoiceCard";
import InlinePlayerModal from "@/components/voices/InlinePlayerModalClean";
import { VOICES_ARCHIVE_PAGE_SIZE } from "@/lib/constants";

const SOURCE_OPTIONS = [
  { value: "", label: "All" },
  { value: "voices", label: "Voices of Dissent" },
  { value: "curated-videos", label: "Curated Videos" },
  { value: "protest-music", label: "Protest Music" },
  { value: "books", label: "Books" },
  { value: "resources", label: "Resources" },
  { value: "journal", label: "Journal" },
];

export default function VoicesArchiveClient({
  initialItems,
  initialHasMore,
  voices,
  artists = [],
  currentVoice,
  currentSource,
  currentArtist,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sentinelRef = useRef(null);
  const skipFilterScrollRef = useRef(true);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1500);
  }, [router]);

  const voiceParam = searchParams.get("voice") ?? "";
  const sourceParam = searchParams.get("source") ?? "";
  const artistParam = searchParams.get("artist") ?? "";

  // Reset when filters change via URL (server sends new initialItems)
  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialHasMore);
    setPage(1);
    setActiveItem(null);
  }, [voiceParam, sourceParam, artistParam, initialItems, initialHasMore]);

  // Scroll detection to prevent immediate page-2 loads
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 0) setHasUserScrolled(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keep results in view after changing section / voice / artist (not on initial mount).
  useEffect(() => {
    if (skipFilterScrollRef.current) {
      skipFilterScrollRef.current = false;
      return;
    }
    requestAnimationFrame(() => {
      document.getElementById('telescreen-archive-primary')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [sourceParam, voiceParam, artistParam]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const nextPage = page + 1;
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("limit", String(VOICES_ARCHIVE_PAGE_SIZE));
    if (voiceParam) params.set("voice", voiceParam);
    if (sourceParam) params.set("source", sourceParam);
    if (artistParam) params.set("artist", artistParam);

    try {
      const res = await fetch(`/api/voices-archive?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (data.items?.length) {
        setItems((prev) => [...prev, ...data.items]);
      }
      setHasMore(Boolean(data.hasMore));
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [page, hasMore, loading, voiceParam, sourceParam, artistParam]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!hasMore || !hasUserScrolled) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      () => loadMore(),
      { root: null, rootMargin: "200px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, hasUserScrolled, loadMore]);

  const buildSearchParams = useCallback(
    (overrides = {}) => {
      const params = new URLSearchParams();
      const v = overrides.voice !== undefined ? (overrides.voice == null ? "" : overrides.voice) : voiceParam;
      const s = overrides.source !== undefined ? (overrides.source == null ? "" : overrides.source) : sourceParam;
      const a = overrides.artist !== undefined ? (overrides.artist == null ? "" : overrides.artist) : artistParam;
      if (v) params.set("voice", v);
      if (s) params.set("source", s);
      if (a) params.set("artist", a);
      return params;
    },
    [voiceParam, sourceParam, artistParam]
  );

  const handleSourceChange = useCallback(
    (source) => {
      const params = buildSearchParams({
        source: source ? source : null,
        voice: source === "protest-music" ? null : source ? undefined : null,
        artist: source === "voices" ? null : source ? undefined : null,
      });
      const qs = params.toString();
      router.push(qs ? `/telescreen?${qs}` : "/telescreen");
    },
    [router, buildSearchParams]
  );

  const handleVoiceChange = useCallback(
    (voice) => {
      setVoiceDropdownOpen(false);
      const params = buildSearchParams({ voice: voice || undefined });
      router.push(`/telescreen?${params.toString()}`);
    },
    [router, buildSearchParams]
  );

  const handleArtistChange = useCallback(
    (artist) => {
      setArtistDropdownOpen(false);
      const params = buildSearchParams({ artist: artist || undefined });
      router.push(`/telescreen?${params.toString()}`);
    },
    [router, buildSearchParams]
  );

  const showVoiceFilter = sourceParam === "voices";
  const showArtistFilter = sourceParam === "protest-music" && artists.length > 0;

  const selectedSourceLabel =
    SOURCE_OPTIONS.find(
      (o) => (o.value === "" && !sourceParam) || o.value === sourceParam
    )?.label ?? "All";

  const voiceOptions = [
    { value: "", label: "All voices" },
    ...voices.map((v) => ({ value: v.slug, label: v.title })),
  ];
  const artistOptions = [
    { value: "", label: "All artists" },
    ...artists.map((a) => ({ value: a.slug, label: a.title })),
  ];

  const handleSourceSelect = useCallback(
    (source) => {
      setSourceDropdownOpen(false);
      handleSourceChange(source || undefined);
    },
    [handleSourceChange]
  );

  return (
    <div className="space-y-5">
      {/* Sticky breadcrumbs — context while scrolling */}
      <nav
        aria-label="Breadcrumb"
        className="sticky top-0 z-20 -mx-1 px-1 sm:-mx-2 sm:px-2 lg:-mx-3 lg:px-3 py-2.5 bg-background border-b border-border shadow-[0_1px_0_0_var(--border-color)]"
      >
        <ol className="nav-label flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground/70 max-w-[1600px] mx-auto flex-wrap">
          <li>
            <Link
              href={sourceParam ? `/telescreen?source=${sourceParam}` : "/telescreen"}
              className="hover:text-primary transition-colors"
            >
              {sourceParam === "curated-videos"
                ? "Curated Videos"
                : sourceParam === "protest-music"
                  ? "Protest Music"
                  : sourceParam === "voices"
                    ? "Voices of Dissent"
                    : sourceParam === "books"
                      ? "Books"
                      : sourceParam === "resources"
                        ? "Resources"
                        : sourceParam === "journal"
                          ? "Journal"
                          : "Collection"}
            </Link>
          </li>
          {(showVoiceFilter && voiceParam) || (showArtistFilter && artistParam) ? (
            <>
              <li aria-hidden className="text-foreground/40">/</li>
              <li className="text-foreground truncate" aria-current="page">
                {voiceParam
                  ? voices.find((v) => v.slug === voiceParam)?.title ?? voiceParam
                  : artists.find((a) => a.slug === artistParam)?.title ?? artistParam}
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      {/* Filters sit directly above the grid so choosing a section does not leave results far below */}
      <div
        id="telescreen-archive-toolbar"
        className="flex flex-col gap-4 sm:gap-3 border-b border-border/60 pb-4 scroll-mt-20"
      >
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          <FilterDropdown
            label="Section"
            selectedLabel={selectedSourceLabel}
            options={SOURCE_OPTIONS}
            value={sourceParam}
            onChange={(v) => handleSourceSelect(v)}
            isOpen={sourceDropdownOpen}
            onToggle={() => setSourceDropdownOpen((o) => !o)}
            onClose={() => setSourceDropdownOpen(false)}
            ariaLabel="Choose section"
          />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="button-label flex items-center gap-1.5 text-xs font-bold text-foreground/70 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Refresh collection"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>
        {(showVoiceFilter || showArtistFilter) && (
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-stretch sm:items-end">
            {showVoiceFilter && (
              <FilterDropdown
                label="Voice"
                selectedLabel={currentVoice || "All voices"}
                options={voiceOptions}
                value={currentVoice ?? voiceParam}
                onChange={(v) => handleVoiceChange(v || null)}
                isOpen={voiceDropdownOpen}
                onToggle={() => setVoiceDropdownOpen((o) => !o)}
                onClose={() => setVoiceDropdownOpen(false)}
                ariaLabel="Choose voice"
                className="relative flex-1 min-w-0"
              />
            )}
            {showArtistFilter && (
              <FilterDropdown
                label="Artist"
                selectedLabel={currentArtist || "All artists"}
                options={artistOptions}
                value={currentArtist ?? artistParam}
                onChange={(v) => handleArtistChange(v || null)}
                isOpen={artistDropdownOpen}
                onToggle={() => setArtistDropdownOpen((o) => !o)}
                onClose={() => setArtistDropdownOpen(false)}
                ariaLabel="Choose artist"
                className="relative flex-1 min-w-0"
              />
            )}
          </div>
        )}
      </div>

      <div id="telescreen-archive-primary">
      {items.length === 0 ? (
        <p className="system-label text-foreground/70 text-sm">
          No videos match the current filters.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {items.map((it, index) => (
              <li key={`${it.id ?? it.url}-${index}`}>
                <VoiceCard item={it} onPlay={setActiveItem} priority={index < 6} />
              </li>
            ))}
          </ul>

          {activeItem && (
            <InlinePlayerModal
              item={activeItem}
              allItems={items}
              onClose={() => setActiveItem(null)}
              onSelectItem={setActiveItem}
            />
          )}

          {/* Sentinel for infinite scroll */}
          {hasMore && (
            <div ref={sentinelRef} className="py-6" aria-hidden>
              {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="machine-panel border border-border animate-pulse h-64" />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
