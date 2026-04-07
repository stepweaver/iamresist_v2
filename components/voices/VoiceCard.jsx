'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate } from '@/lib/utils/date';
import {
  getYoutubeVideoId,
  youtubeThumbnailCandidates,
} from '@/lib/utils/youtube';
import { Play } from 'lucide-react';

/** i.ytimg.com often fails or returns empty with strict referrers (e.g. localhost dev). */
function thumbReferrerPolicy(src) {
  if (!src || typeof src !== 'string') return 'strict-origin-when-cross-origin';
  if (src.includes('ytimg.com')) return 'no-referrer';
  return 'strict-origin-when-cross-origin';
}

/**
 * Video / intel card thumbnails — hardened like source VoiceFeedCard + NewswireImage:
 * YouTube URLs use CDN fallback chain; non-YouTube feeds use RSS image only.
 */
export default function VoiceCard({ item, onPlay, priority = false }) {
  const { title, url, publishedAt, description, voice, image, sourceId } = item;
  const thumbFromFeed = typeof image === 'string' && image.trim() ? image.trim() : null;

  const candidates = useMemo(() => {
    const yt = youtubeThumbnailCandidates(url, sourceId);
    if (yt.length) {
      const feed = thumbFromFeed;
      if (feed && !yt.includes(feed)) return [feed, ...yt];
      return yt;
    }
    return thumbFromFeed ? [thumbFromFeed] : [];
  }, [url, sourceId, thumbFromFeed]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loadState, setLoadState] = useState('loading');

  useEffect(() => {
    setCandidateIndex(0);
    setLoadState(candidates.length ? 'loading' : 'error');
  }, [item?.id, url, sourceId, thumbFromFeed, candidates.length]);

  const exhausted = candidates.length === 0 || candidateIndex >= candidates.length;
  const thumbSrc = exhausted ? null : candidates[candidateIndex];

  useEffect(() => {
    if (thumbSrc) setLoadState('loading');
  }, [thumbSrc]);

  const onThumbError = useCallback(() => {
    setCandidateIndex((i) => Math.min(i + 1, candidates.length));
  }, [candidates.length]);

  const onThumbLoad = useCallback(() => {
    setLoadState('loaded');
  }, []);

  const voiceName = voice?.title || 'Unknown Voice';
  const voiceHomeUrl =
    typeof voice?.homeUrl === 'string' && voice.homeUrl.trim() ? voice.homeUrl.trim() : null;
  const platform = voice?.platform || 'Feed';
  const isYouTube = Boolean(getYoutubeVideoId(url, sourceId));

  const displayDate = publishedAt ? formatDate(publishedAt) : null;

  const showThumb = Boolean(thumbSrc);
  const canPlayInline = Boolean(isYouTube && typeof onPlay === 'function');

  const onOpenPlayer = useCallback(() => {
    if (!canPlayInline) return;
    onPlay(item);
  }, [canPlayInline, onPlay, item]);

  // If onLoad never fires (referrer/CSP quirks), don't leave the skeleton up forever.
  useEffect(() => {
    if (!thumbSrc || loadState === 'loaded') return undefined;
    const t = window.setTimeout(() => {
      setLoadState((s) => (s === 'loaded' ? s : 'loaded'));
    }, 4000);
    return () => window.clearTimeout(t);
  }, [thumbSrc, loadState]);

  return (
    <article className="machine-panel border border-border relative overflow-hidden group">
      <div className="absolute inset-0 hud-grid opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
      {showThumb ? (
        canPlayInline ? (
          <button
            type="button"
            onClick={onOpenPlayer}
            className="relative z-10 block w-full aspect-video bg-military-grey border-b border-border overflow-hidden text-left"
            aria-label={`Open: ${title || 'item'}`}
          >
            {loadState === 'loading' && (
              <div className="absolute inset-0 animate-pulse bg-muted z-[1]" aria-hidden />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN / RSS URLs */}
            <img
              key={thumbSrc}
              src={thumbSrc}
              alt=""
              referrerPolicy={thumbReferrerPolicy(thumbSrc)}
              className="relative z-[2] h-full w-full object-cover object-center opacity-100 transition-all duration-300 group-hover:scale-[1.02]"
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              onLoad={onThumbLoad}
              onError={onThumbError}
            />
            <span
              className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-t from-black/35 to-transparent"
              aria-hidden
            />
            {isYouTube ? (
              <span
                className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center"
                aria-hidden
              >
                <span className="rounded-full bg-black/60 backdrop-blur-sm p-3 ring-2 ring-white/25 text-white/95">
                  <Play className="h-6 w-6" />
                </span>
              </span>
            ) : null}
          </button>
        ) : (
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 block w-full aspect-video bg-military-grey border-b border-border overflow-hidden"
          >
            {loadState === 'loading' && (
              <div className="absolute inset-0 animate-pulse bg-muted z-[1]" aria-hidden />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN / RSS URLs */}
            <img
              key={thumbSrc}
              src={thumbSrc}
              alt=""
              referrerPolicy={thumbReferrerPolicy(thumbSrc)}
              className="relative z-[2] h-full w-full object-cover object-center opacity-100 transition-all duration-300 group-hover:scale-[1.02]"
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              onLoad={onThumbLoad}
              onError={onThumbError}
            />
            {isYouTube && (
              <span className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-t from-black/25 to-transparent" aria-hidden />
            )}
          </Link>
        )
      ) : null}
      <div className="relative z-10 p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
            {platform}
          </span>
          {displayDate && (
            <>
              <span className="text-hud-dim">|</span>
              <time
                className="font-mono text-[10px] text-hud-dim tracking-wider"
                dateTime={publishedAt || undefined}
              >
                {displayDate}
              </time>
            </>
          )}
        </div>

        <h3 className="section-title text-xl lg:text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
          {canPlayInline ? (
            <button type="button" onClick={onOpenPlayer} className="hover:underline text-left">
              {title || 'Untitled'}
            </button>
          ) : (
            <Link href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {title || 'Untitled'}
            </Link>
          )}
        </h3>

        {description && (
          <p className="prose-copy text-foreground/70 mb-4 line-clamp-3">
            {description}
          </p>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="font-mono text-xs text-hud-dim">
            BY{' '}
            {voiceHomeUrl ? (
              <Link
                href={voiceHomeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                {voiceName.toUpperCase()}
              </Link>
            ) : (
              <span className="text-hud-dim">{voiceName.toUpperCase()}</span>
            )}
          </span>
          {canPlayInline ? (
            <button
              type="button"
              onClick={onOpenPlayer}
              className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
            >
              PLAY →
            </button>
          ) : (
            <Link
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
            >
              OPEN →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
