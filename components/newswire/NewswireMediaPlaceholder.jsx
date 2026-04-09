'use client';

import { Newspaper } from 'lucide-react';

/** Neutral stand-in when RSS/OG did not yield a usable image (keeps card layout consistent). */
export default function NewswireMediaPlaceholder({ className = '' }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-2 bg-military-grey/40 text-foreground/60 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40 bg-[linear-gradient(135deg,transparent_0%,transparent_45%,rgba(211,47,47,0.12)_45%,rgba(211,47,47,0.12)_55%,transparent_55%,transparent_100%)]"
        aria-hidden
      />
      <Newspaper className="h-8 w-8 stroke-[1.5] text-primary/70 sm:h-9 sm:w-9" aria-hidden />
      <span className="hud-label text-[10px] uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
        Image unavailable
      </span>
      <span className="sr-only">Preview image unavailable for this article</span>
    </div>
  );
}
