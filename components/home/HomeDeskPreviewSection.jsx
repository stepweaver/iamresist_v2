import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import NewswireImage from '@/components/newswire/NewswireImage';
import { formatDate } from '@/lib/utils/date';

const PREVIEW_COUNT = 1;

function topRankedDeskItems(desk) {
  if (!desk?.configured || !Array.isArray(desk.items) || desk.items.length === 0) return [];
  return desk.items.slice(0, PREVIEW_COUNT);
}

function DeskPreviewColumn({ title, href, items }) {
  if (!items.length) return null;

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <span className="kicker text-primary text-xs sm:text-sm tracking-[0.35em] font-bold">{title}</span>
        <Link
          href={href}
          className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap"
        >
          View all →
        </Link>
      </div>
      <ul className="space-y-3 sm:space-y-4">
        {items.map((row) => {
          const url = row.canonicalUrl || '#';
          const when = row.publishedAt ? formatDate(row.publishedAt) : null;
          return (
            <li key={row.id}>
              <article className="border border-border machine-panel p-3 sm:p-4 hover:border-primary/35 transition-colors">
                <div className="flex gap-3 sm:gap-4">
                  <div className="relative w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 rounded overflow-hidden bg-muted">
                    {row.imageUrl ? (
                      <NewswireImage src={row.imageUrl} alt="" objectPosition="top" />
                    ) : (
                      <div className="absolute inset-0 bg-muted" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col">
                    <span className="hud-label text-[10px] sm:text-xs truncate">{row.sourceName}</span>
                    <h3 className="font-ui text-sm sm:text-base font-bold leading-snug text-foreground mt-1 line-clamp-3">
                      {row.title || 'Untitled'}
                    </h3>
                    {when && (
                      <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums mt-1">
                        {when}
                      </span>
                    )}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-primary font-bold hover:underline mt-2"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {row.deskLane === 'voices' || row.contentUseMode === 'preview_and_link'
                        ? 'Read / listen at source'
                        : 'Open canonical'}
                    </a>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Surfaces top-ranked items from the live Intel desks (same ordering as /intel/osint and /intel/voices).
 */
export default function HomeDeskPreviewSection({ osintDesk, voicesDesk }) {
  const osintItems = topRankedDeskItems(osintDesk);
  const voiceItems = topRankedDeskItems(voicesDesk);
  const showOsint = osintItems.length > 0;
  const showVoices = voiceItems.length > 0;

  if (!showOsint && !showVoices) {
    return null;
  }

  const gridCols =
    showOsint && showVoices ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1';

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
        <div>
          <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block">
            Intel desks
          </span>
          <p className="text-[11px] sm:text-xs text-foreground/60 font-mono mt-1 max-w-2xl leading-relaxed">
            The top item from each live desk — same ordering as the full OSINT and Voices pages.
          </p>
        </div>
      </div>

      <div className={`grid ${gridCols} gap-6 lg:gap-8`}>
        {showOsint ? (
          <DeskPreviewColumn title="OSINT" href="/intel/osint" items={osintItems} />
        ) : null}
        {showVoices ? (
          <DeskPreviewColumn title="Voices" href="/intel/voices" items={voiceItems} />
        ) : null}
      </div>
    </section>
  );
}
