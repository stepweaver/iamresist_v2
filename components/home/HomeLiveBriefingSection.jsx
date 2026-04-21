import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import NewswireHeadlineCard from '@/components/newswire/NewswireHeadlineCard';
import RemoteCoverImage from '@/components/newswire/RemoteCoverImage';
import ShareButton from '@/components/ShareButton';
import { formatDate } from '@/lib/utils/date';
import { briefingLaneLabel } from '@/lib/feeds/homepageBriefing.weights';
import { getIntelSourceLinkLabel } from '@/lib/sourceLinkLabels';

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
  const linkLabel = getIntelSourceLinkLabel(row);

  const reasonLabels = Array.isArray(row.promotionReasons) ? row.promotionReasons : [];
  const why =
    reasonLabels.length > 0
      ? reasonLabels
          .slice(0, 3)
          .map((c) => {
            if (c === 'fresh_high_priority_event') return 'fresh · high priority';
            if (c === 'primary_source') return 'primary source';
            if (c === 'court_or_legal_action') return 'court/legal';
            if (c === 'accountability_signal') return 'accountability';
            if (c === 'corroborated_multi_source') return 'corroborated';
            if (c === 'corroborated_multi_lane') return 'cross-lane';
            if (c === 'new_phase_in_active_story') return 'new phase';
            if (c === 'contradiction_or_evasion') return 'contradiction/evasion';
            if (c === 'resignation_or_ethics_signal') return 'ethics/resignation';
            if (c === 'major_government_action') return 'major action';
            if (c === 'claims_lane_penalty') return 'claims surface';
            if (c === 'repeat_coverage_penalty') return 'repeat coverage';
            return String(c).replace(/_/g, ' ');
          })
          .join(' · ')
      : null;

  const panelClass = compact
    ? 'border border-border machine-panel p-3 sm:p-4 hover:border-primary/35 transition-colors'
    : 'border border-border machine-panel p-3 sm:p-5 hover:border-primary/35 transition-colors';
  const shareDescription = row.sourceName || row.whyItMatters || '';

  if (hero) {
    return (
      <article className={`${panelClass} group`}>
        <div className="flex flex-col gap-3 sm:gap-4">
          {row.imageUrl ? (
            <RemoteCoverImage
              src={row.imageUrl}
              className="relative w-full aspect-[2/1] max-h-[200px] sm:max-h-none sm:aspect-video rounded overflow-hidden bg-muted"
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <BriefingLaneBadge lane={row.briefLane} />
            <span className="hud-label text-[10px] sm:text-xs truncate">{row.sourceName}</span>
            {when ? (
              <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums">{when}</span>
            ) : null}
          </div>
          {why ? (
            <p className="font-mono text-[10px] sm:text-xs text-foreground/60 leading-relaxed">
              Why: {why}
            </p>
          ) : null}
          <h2 className="font-ui text-base sm:text-xl lg:text-2xl font-bold leading-snug text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
              {row.title || 'Untitled'}
            </a>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-primary font-bold hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {linkLabel}
            </a>
            <ShareButton
              url={url}
              title={row.title}
              description={shareDescription}
              heading="Share Intel item"
            />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={panelClass}>
      <div
        className={row.imageUrl ? 'flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-start' : undefined}
      >
        {row.imageUrl ? (
          <RemoteCoverImage
            src={row.imageUrl}
            className="relative min-h-0 w-full shrink-0 overflow-hidden border border-border/60 bg-muted aspect-[4/3] sm:aspect-square sm:h-28 sm:w-28 sm:max-w-none rounded"
          />
        ) : null}
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex flex-wrap gap-2 mb-1">
            <BriefingLaneBadge lane={row.briefLane} />
          </div>
          <span className="hud-label text-[10px] sm:text-xs truncate">{row.sourceName}</span>
          {why ? (
            <p className="font-mono text-[10px] text-foreground/60 leading-relaxed mt-1">
              Why: {why}
            </p>
          ) : null}
          <h3 className="font-ui text-sm sm:text-base font-bold leading-snug text-foreground mt-1 line-clamp-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
              {row.title || 'Untitled'}
            </a>
          </h3>
          {when ? (
            <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums mt-1">{when}</span>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-primary font-bold hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {linkLabel}
            </a>
            <ShareButton
              url={url}
              title={row.title}
              description={shareDescription}
              heading="Share Intel item"
            />
          </div>
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
