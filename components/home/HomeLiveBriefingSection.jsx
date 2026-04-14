import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import NewswireHeadlineCard from '@/components/newswire/NewswireHeadlineCard';
import NewswireImage from '@/components/newswire/NewswireImage';
import { formatDate } from '@/lib/utils/date';
import { briefingLaneLabel } from '@/lib/feeds/homepageBriefing.weights';

function BriefingLaneBadge({ lane }) {
  const label = briefingLaneLabel(lane);
  return (
    <span className="inline-block font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-primary border border-primary/40 px-2 py-0.5 rounded-sm">
      {label}
    </span>
  );
}

function IntelBriefingCard({ row, hero = false, compact = false }) {
  const url = row.canonicalUrl || '#';
  const when = row.publishedAt ? formatDate(row.publishedAt) : null;
  const linkLabel =
    row.deskLane === 'voices' || row.contentUseMode === 'preview_and_link'
      ? 'Read / listen at source'
      : 'Open canonical';

  const panelClass = compact
    ? 'border border-border machine-panel p-3 sm:p-4 hover:border-primary/35 transition-colors'
    : 'border border-border machine-panel p-3 sm:p-5 hover:border-primary/35 transition-colors';

  if (hero) {
    return (
      <article className={`${panelClass} group`}>
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="relative w-full aspect-[2/1] max-h-[200px] sm:max-h-none sm:aspect-video rounded overflow-hidden bg-muted">
            {row.imageUrl ? (
              <NewswireImage src={row.imageUrl} alt="" objectPosition="top" />
            ) : (
              <div className="absolute inset-0 bg-muted" aria-hidden />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BriefingLaneBadge lane={row.briefLane} />
            <span className="hud-label text-[10px] sm:text-xs truncate">{row.sourceName}</span>
            {when ? (
              <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums">{when}</span>
            ) : null}
          </div>
          <h2 className="font-ui text-base sm:text-xl lg:text-2xl font-bold leading-snug text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
              {row.title || 'Untitled'}
            </a>
          </h2>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-primary font-bold hover:underline w-fit"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {linkLabel}
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className={panelClass}>
      <div className="flex gap-3 sm:gap-4">
        <div className="relative w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 rounded overflow-hidden bg-muted">
          {row.imageUrl ? (
            <NewswireImage src={row.imageUrl} alt="" objectPosition="top" />
          ) : (
            <div className="absolute inset-0 bg-muted" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex flex-wrap gap-2 mb-1">
            <BriefingLaneBadge lane={row.briefLane} />
          </div>
          <span className="hud-label text-[10px] sm:text-xs truncate">{row.sourceName}</span>
          <h3 className="font-ui text-sm sm:text-base font-bold leading-snug text-foreground mt-1 line-clamp-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
              {row.title || 'Untitled'}
            </a>
          </h3>
          {when ? (
            <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums mt-1">{when}</span>
          ) : null}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-primary font-bold hover:underline mt-2"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {linkLabel}
          </a>
        </div>
      </div>
    </article>
  );
}

/**
 * @param {object} props
 * @param {Awaited<ReturnType<typeof import('@/lib/feeds/homepageBriefing.service').getHomeLiveBriefing>>} props.briefing
 */
export default function HomeLiveBriefingSection({ briefing }) {
  const items = briefing?.items ?? [];
  if (items.length === 0) return null;

  const [lead, ...rest] = items;

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
        <div>
          <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block">Live briefing</span>
          <p className="text-[11px] sm:text-xs text-foreground/60 font-mono mt-1 max-w-2xl leading-relaxed">
            What changed, what matters now, and what is verified enough to trust — ranked across newswire and intel
            desks.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
            <Link href="/intel/osint" className="text-foreground/50 hover:text-primary transition-colors">
              OSINT desk →
            </Link>
            <Link href="/intel/newswire" className="text-foreground/50 hover:text-primary transition-colors">
              Newswire →
            </Link>
            <Link href="/intel/watchdogs" className="text-foreground/50 hover:text-primary transition-colors">
              Watchdogs →
            </Link>
            <Link href="/intel/defense" className="text-foreground/50 hover:text-primary transition-colors">
              Defense →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-3 sm:gap-5 xl:items-start">
        <div className="min-w-0">
          {lead.kind === 'newswire' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <BriefingLaneBadge lane={lead.briefLane} />
              </div>
              <NewswireHeadlineCard story={lead.story} hero />
            </div>
          ) : (
            <IntelBriefingCard
              hero
              row={{
                ...lead.intelItem,
                briefLane: lead.briefLane,
              }}
            />
          )}
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:gap-4 min-w-0 list-none p-0 m-0">
          {rest.map((entry) => (
            <li key={entry.kind === 'newswire' ? entry.story.id : entry.intelItem.id}>
              {entry.kind === 'newswire' ? (
                <div className="space-y-2">
                  <BriefingLaneBadge lane={entry.briefLane} />
                  <NewswireHeadlineCard story={entry.story} compact />
                </div>
              ) : (
                <IntelBriefingCard
                  compact
                  row={{
                    ...entry.intelItem,
                    briefLane: entry.briefLane,
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
