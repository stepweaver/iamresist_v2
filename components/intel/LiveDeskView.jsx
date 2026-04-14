import Link from 'next/link';
import NewswireImage from '@/components/newswire/NewswireImage';
import { formatDate } from '@/lib/utils/date';

export function deskLabelForLane(deskLane) {
  if (deskLane === 'voices') return 'Voices';
  if (deskLane === 'watchdogs') return 'Watchdogs';
  if (deskLane === 'defense_ops') return 'Defense';
  if (deskLane === 'indicators') return 'Indicators';
  if (deskLane === 'statements') return 'Statements';
  return 'OSINT';
}

/** Human relative age for freshness line (minutes/hours/days). */
export function formatRelativeAgeMinutes(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ProvenanceChip({ provenanceClass }) {
  const base =
    'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded';
  const tone = {
    PRIMARY: 'text-primary border-primary/50 bg-primary/5',
    WIRE: 'text-foreground border-foreground/30 bg-foreground/5',
    SPECIALIST: 'text-foreground/90 border-foreground/25',
    INDIE: 'text-foreground/80 border-foreground/20',
    COMMENTARY: 'text-foreground/70 border-foreground/15',
    SCHEDULE: 'text-foreground/70 border-foreground/15',
  };
  const c = tone[provenanceClass] || tone.SPECIALIST;
  return (
    <span className={`${base} ${c}`} title="Provenance class">
      {provenanceClass}
    </span>
  );
}

function SurfaceChip({ surfaceState, isDuplicateLoser }) {
  const base =
    'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded';
  const map = {
    surfaced: 'border-emerald-500/35 text-emerald-800 dark:text-emerald-400/90 bg-emerald-500/10',
    downranked: 'border-amber-500/40 text-amber-800 dark:text-amber-400/85 bg-amber-500/10',
  };
  const c = map[surfaceState] || map.surfaced;
  return (
    <span className={`${base} ${c}`} title="Ingest-time surface state (rule-based)">
      {surfaceState}
      {isDuplicateLoser ? ' · dup' : ''}
    </span>
  );
}

function TrustChip({ badge }) {
  if (!badge) return null;
  const base =
    'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded';
  const map = {
    neutral: 'border-foreground/25 text-foreground/80 bg-foreground/[0.02]',
    info: 'border-primary/50 text-primary bg-primary/5',
    caution: 'border-amber-500/45 text-amber-800 dark:text-amber-400/90 bg-amber-500/10',
    high: 'border-red-500/45 text-red-700 dark:text-red-400 bg-red-500/[0.06]',
  };
  const tone = badge.tone && map[badge.tone] ? badge.tone : 'info';
  return (
    <span className={`${base} ${map[tone]}`} title={badge.tooltip || 'Trust warning'}>
      {badge.label}
    </span>
  );
}

function truncatePreview(text, max = 280) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function linkCtaLabel(row) {
  const mode = row.contentUseMode;
  const lane = row.deskLane;
  if (lane === 'voices' || mode === 'preview_and_link') {
    return 'Read / listen at source →';
  }
  return 'Open canonical →';
}

function feedTransparencyHint(row) {
  if (row.deskLane === 'voices' || row.contentUseMode === 'preview_and_link') {
    return 'Preview via public feed · Read or subscribe at source';
  }
  if (row.contentUseMode === 'metadata_only') {
    return 'Metadata only — full text at source';
  }
  return null;
}

function hasActionableTrustWarning(row) {
  const badges = Array.isArray(row.trustBadges) ? row.trustBadges : [];
  return badges.some((b) => b?.tone === 'caution' || b?.tone === 'high');
}

function duplicateGroupingUserNote(row) {
  const entry = Array.isArray(row.relevanceExplanations)
    ? row.relevanceExplanations.find((e) => e.ruleId === 'desk:duplicate_cluster')
    : null;
  const raw = entry?.message?.trim();
  if (!raw) {
    return 'Similar report consolidated under a stronger line above';
  }
  const m = raw.match(/stronger line is [“"]([^”"]+)[”"]/i);
  if (m?.[1]) {
    const title = m[1].trim();
    return `Related coverage is grouped with a stronger report above: “${title}”`;
  }
  return 'Similar report consolidated under a stronger line above';
}

function topHumanReason(row) {
  const hiddenRuleIds = new Set([
    'source:baseline',
    'score:default_priority',
    'fr:fr_type',
    'desk:duplicate_cluster',
  ]);

  const display = Array.isArray(row.displayExplanations) ? row.displayExplanations : [];
  const relevance = Array.isArray(row.relevanceExplanations) ? row.relevanceExplanations : [];

  const messages = [...display, ...relevance]
    .filter((e) => e?.message && !hiddenRuleIds.has(e.ruleId))
    .map((e) => e.message.trim());

  return [...new Set(messages)][0] || null;
}

function CompactSignalMeta({ row, showBucket = false }) {
  const tags = Array.isArray(row.missionTags) ? row.missionTags.slice(0, 2) : [];
  const reason = topHumanReason(row);

  const bits = [];

  if (showBucket && row.displayBucket && row.displayBucket !== 'routine') {
    bits.push(row.displayBucket);
  }

  bits.push(...tags);

  if (reason) {
    bits.push(reason);
  }

  if (!bits.length) return null;

  return (
    <p className="mt-3 font-mono text-[10px] text-foreground/60 leading-relaxed">
      {bits.join(' · ')}
    </p>
  );
}

function CompactFreshnessLine({
  snapshotFallback,
  dataStale,
  freshness,
  freshnessMeta,
}) {
  if (snapshotFallback) {
    return (
      <p className="text-xs text-foreground/75 font-mono tracking-wide">
        Saved snapshot · live read failed
      </p>
    );
  }

  const successRel = formatRelativeAgeMinutes(freshness?.latestSuccessfulIngestAt);
  const fetchRel = formatRelativeAgeMinutes(
    freshness?.latestFetchedAt ?? freshness?.latestSuccessfulIngestAt,
  );

  if (dataStale || freshnessMeta?.deskState === 'stale') {
    return (
      <p className="text-xs text-foreground/75 font-mono tracking-wide">
        Stale{successRel ? ` · last success ${successRel}` : ''}
      </p>
    );
  }

  return (
    <p className="text-xs text-foreground/75 font-mono tracking-wide">
      Fresh{fetchRel ? ` · updated ${fetchRel}` : ''}
    </p>
  );
}

/**
 * @param {{
 *   desk: Record<string, unknown>,
 *   sourceFilterSlot?: import('react').ReactNode,
 *   laneWarningSlot?: import('react').ReactNode,
 *   emptyAfterSourceFilter?: boolean,
 * }} props
 */
export default function LiveDeskView({
  desk,
  sourceFilterSlot = null,
  laneWarningSlot = null,
  emptyAfterSourceFilter = false,
}) {
  const {
    configured,
    stale,
    dataStale,
    snapshotFallback,
    liveReadOk,
    intelSchemaMisconfigured,
    items,
    leadItems = [],
    secondaryLeadItems = [],
    suppressedItems = [],
    duplicateItems = [],
    metadataOnlyItems = [],
    message,
    freshness,
    freshnessMeta,
    deskLane = 'osint',
  } = desk;

  const deskLabel = deskLabelForLane(deskLane);
  const usesLeadBlockLayout = deskLane !== 'voices';

  const hasFreshnessData =
    Boolean(freshness?.latestFetchedAt) || Boolean(freshness?.latestSuccessfulIngestAt);
  const showFreshnessStrip = liveReadOk || snapshotFallback || hasFreshnessData;

  if (!configured) {
    return (
      <section className="border border-border p-6 machine-panel">
        <p className="text-foreground/80 text-sm uppercase tracking-wider">
          Intel desk storage is not configured (set Supabase env vars and apply the{' '}
          <code className="font-mono text-xs">intel</code> schema migrations).
        </p>
      </section>
    );
  }

  const showBanner = Boolean(message) && (stale || snapshotFallback);
  const suppressed = Array.isArray(suppressedItems) ? suppressedItems : [];
  const duplicates = Array.isArray(duplicateItems) ? duplicateItems : [];
  const metaOnly = Array.isArray(metadataOnlyItems) ? metadataOnlyItems : [];
  const leads = Array.isArray(leadItems) ? leadItems : [];
  const secondary = Array.isArray(secondaryLeadItems) ? secondaryLeadItems : [];
  const leadIds = new Set([...leads, ...secondary].map((x) => x?.id).filter(Boolean));
  const rest = Array.isArray(items) ? items.filter((x) => !leadIds.has(x.id)) : [];
  const listForEmptyCheck = [...leads, ...secondary, ...rest];
  const hasMainStack = listForEmptyCheck.length > 0;
  const hasAnyDeskContent =
    hasMainStack || duplicates.length > 0 || suppressed.length > 0 || metaOnly.length > 0;

  return (
    <div className="space-y-6">
      {laneWarningSlot}

      {(showFreshnessStrip && freshness) || sourceFilterSlot ? (
        <div className="flex flex-wrap items-center justify-between gap-3 gap-y-2">
          {showFreshnessStrip && freshness ? (
            <CompactFreshnessLine
              snapshotFallback={snapshotFallback}
              dataStale={dataStale}
              freshness={freshness}
              freshnessMeta={freshnessMeta}
            />
          ) : (
            <span />
          )}
          {sourceFilterSlot}
        </div>
      ) : null}

      {showBanner ? (
        <div
          className={`border px-4 py-3 text-sm text-foreground/90 ${
            snapshotFallback ? 'border-amber-500/50 bg-amber-500/5' : 'border-primary/40 bg-primary/5'
          }`}
        >
          <span className="font-bold uppercase tracking-wider text-primary">
            {snapshotFallback
              ? `Stale — saved ${deskLabel} snapshot`
              : intelSchemaMisconfigured
                ? 'Supabase configuration'
                : 'Freshness warning'}
          </span>
          <p className="mt-1 font-mono text-xs text-foreground/80">{message}</p>
        </div>
      ) : null}

      {emptyAfterSourceFilter ? (
        <section className="border border-border p-6 machine-panel">
          <p className="text-foreground/80 text-sm uppercase tracking-wider">No items from this source.</p>
        </section>
      ) : null}

      {!emptyAfterSourceFilter && liveReadOk && !hasAnyDeskContent ? (
        <section className="border border-border p-6 machine-panel">
          <p className="text-foreground/80 text-sm mb-2 uppercase tracking-wider">
            No ingested items yet.
          </p>
          <p className="text-foreground/60 text-xs font-mono leading-relaxed">
            Run a secured ingest:{' '}
            <code className="text-primary">GET /api/cron/ingest-signal</code> with{' '}
            <code className="text-primary">Authorization: Bearer CRON_SECRET</code>
            . Ensure the <code className="text-primary">intel</code> schema is exposed in Supabase API
            settings.
          </p>
        </section>
      ) : null}

      {!emptyAfterSourceFilter && !liveReadOk && !snapshotFallback && !hasAnyDeskContent ? (
        <section className="border border-border p-6 machine-panel">
          <p className="text-foreground/80 text-sm uppercase tracking-wider">
            Nothing to show yet — {deskLabel} read failed and no saved desk snapshot exists.
          </p>
        </section>
      ) : null}

      {!emptyAfterSourceFilter && hasAnyDeskContent && usesLeadBlockLayout && (leads.length > 0 || secondary.length > 0) ? (
        <section className="border border-border machine-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="section-title text-base sm:text-lg font-bold text-foreground">
              Lead developments
            </h2>
            <p className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">
              Selected for importance, not just recency
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {leads.map((row) => {
              const when = row.publishedAt ? formatDate(row.publishedAt) : '—';
              return (
                <article
                  key={row.id}
                  className="border border-primary/40 bg-primary/[0.03] p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-2 gap-y-2 mb-3">
                    <ProvenanceChip provenanceClass={row.provenanceClass} />
                    <SurfaceChip surfaceState={row.surfaceState ?? 'surfaced'} isDuplicateLoser={false} />
                    {Array.isArray(row.trustBadges)
                      ? row.trustBadges.slice(0, 2).map((b) => (
                          <TrustChip key={`${b.label}-${b.tone}`} badge={b} />
                        ))
                      : null}
                    <span className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">
                      {row.sourceName}
                    </span>
                    <span className="text-hud-dim">|</span>
                    <time
                      className="font-mono text-[10px] text-hud-dim tracking-wider"
                      dateTime={row.publishedAt || undefined}
                    >
                      {when}
                    </time>
                  </div>
                  {row.imageUrl ? (
                    <div className="relative mb-4 aspect-[4/3] w-full max-w-2xl overflow-hidden border border-border/60 bg-muted sm:aspect-video">
                      <NewswireImage src={row.imageUrl} alt="" objectPosition="top" />
                    </div>
                  ) : null}
                  <h3 className="section-title text-xl sm:text-2xl font-bold text-foreground mb-2">
                    <Link
                      href={row.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary hover:underline"
                    >
                      {row.title}
                    </Link>
                  </h3>
                  <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed border-l-2 border-primary/60 pl-3">
                    {row.whyItMatters}
                  </p>
                  {hasActionableTrustWarning(row) && row.trustExplain ? (
                    <p
                      className="mt-2 font-mono text-[10px] text-foreground/70 leading-relaxed max-w-3xl"
                      title={row.trustWarningText || undefined}
                    >
                      {row.trustExplain}
                    </p>
                  ) : null}
                  {row.summary && row.contentUseMode !== 'metadata_only' ? (
                    <p className="mt-3 text-xs text-foreground/70 leading-relaxed max-w-3xl">
                      {truncatePreview(row.summary, 360)}
                    </p>
                  ) : null}
                  <CompactSignalMeta row={row} showBucket />
                </article>
              );
            })}

            {secondary.length > 0 ? (
              <div className="space-y-3">
                <p className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">
                  Secondary
                </p>
                <ul className="space-y-3">
                  {secondary.map((row) => (
                    <li key={row.id} className="border border-border/80 bg-foreground/[0.01] p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <ProvenanceChip provenanceClass={row.provenanceClass} />
                        <SurfaceChip surfaceState={row.surfaceState ?? 'surfaced'} isDuplicateLoser={false} />
                        {Array.isArray(row.trustBadges)
                          ? row.trustBadges.slice(0, 1).map((b) => (
                              <TrustChip key={`${b.label}-${b.tone}`} badge={b} />
                            ))
                          : null}
                        <span className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">
                          {row.sourceName}
                        </span>
                      </div>
                      <Link
                        href={row.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-foreground hover:text-primary hover:underline"
                      >
                        {row.title}
                      </Link>
                      <CompactSignalMeta row={row} showBucket />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {!emptyAfterSourceFilter && hasAnyDeskContent ? (
      <section className="space-y-3">
        {usesLeadBlockLayout ? (
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="section-title text-base sm:text-lg font-bold text-foreground">
              Live signal desk
            </h2>
            <p className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">
              Live desk from primary records, specialist reporting, and vetted feeds
            </p>
          </div>
        ) : null}

        <ul className="space-y-4">
          {(usesLeadBlockLayout ? rest : items).map((row) => {
            const when = row.publishedAt ? formatDate(row.publishedAt) : '—';
            return (
              <li
                key={row.id}
                className={`machine-panel border border-border p-5 sm:p-6 ${
                  row.imageUrl ? 'flex flex-col gap-4 sm:flex-row sm:gap-5' : ''
                }`}
              >
                {row.imageUrl ? (
                  <div className="relative min-h-0 w-full shrink-0 overflow-hidden border border-border/60 bg-muted aspect-[4/3] sm:aspect-square sm:h-36 sm:w-36 sm:max-w-none">
                    <NewswireImage src={row.imageUrl} alt="" objectPosition="top" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 gap-y-2 mb-3">
                    <ProvenanceChip provenanceClass={row.provenanceClass} />
                    <SurfaceChip surfaceState={row.surfaceState ?? 'surfaced'} isDuplicateLoser={false} />
                    {Array.isArray(row.trustBadges)
                      ? row.trustBadges.slice(0, 2).map((b) => (
                          <TrustChip key={`${b.label}-${b.tone}`} badge={b} />
                        ))
                      : null}
                    <span className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">
                      {row.sourceName}
                    </span>
                    <span className="text-hud-dim">|</span>
                    <time
                      className="font-mono text-[10px] text-hud-dim tracking-wider"
                      dateTime={row.publishedAt || undefined}
                    >
                      {when}
                    </time>
                  </div>
                  <h2 className="section-title text-lg sm:text-xl font-bold text-foreground mb-2">
                    <Link
                      href={row.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary hover:underline"
                    >
                      {row.title}
                    </Link>
                  </h2>
                  <p className="text-xs sm:text-sm text-foreground/75 leading-relaxed border-l-2 border-primary/40 pl-3">
                    {row.whyItMatters}
                  </p>
                  {hasActionableTrustWarning(row) && row.trustExplain ? (
                    <p
                      className="mt-2 font-mono text-[10px] text-foreground/65 leading-relaxed max-w-3xl"
                      title={row.trustWarningText || undefined}
                    >
                      {row.trustExplain}
                    </p>
                  ) : null}
                  {row.summary && row.contentUseMode !== 'metadata_only' ? (
                    <p className="mt-2 text-xs text-foreground/65 leading-relaxed max-w-3xl">
                      {truncatePreview(row.summary)}
                    </p>
                  ) : null}
                  {feedTransparencyHint(row) ? (
                    <p className="mt-1 font-mono text-[10px] text-primary/80 uppercase tracking-wider">
                      {feedTransparencyHint(row)}
                    </p>
                  ) : null}
                  <CompactSignalMeta row={row} showBucket={row.displayBucket !== 'routine'} />
                  <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3">
                    <Link
                      href={row.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
                    >
                      {linkCtaLabel(row)}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      ) : null}

      {!emptyAfterSourceFilter && deskLane === 'indicators' && metaOnly.length > 0 ? (
        <details className="border border-border machine-panel p-4 sm:p-5 group">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-foreground/85 list-none flex items-center gap-2">
            <span className="text-primary group-open:rotate-90 transition-transform inline-block">▸</span>
            Index / schedule pointers ({metaOnly.length})
          </summary>
          <p className="mt-2 text-xs text-foreground/70 leading-relaxed max-w-3xl">
            Metadata-only items are hidden from the main stack by default. Open a link for the canonical record at the
            source.
          </p>
          <ul className="mt-4 space-y-2 border-t border-border pt-4">
            {metaOnly.map((row) => (
              <li key={row.id} className="text-sm">
                <Link
                  href={row.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-foreground hover:text-primary hover:underline"
                >
                  {row.title}
                </Link>
                <p className="font-mono text-[10px] text-hud-dim mt-1">{row.sourceName}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!emptyAfterSourceFilter && duplicates.length > 0 ? (
        <details className="border border-border machine-panel p-4 sm:p-5 group">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-foreground/85 list-none flex items-center gap-2">
            <span className="text-primary group-open:rotate-90 transition-transform inline-block">▸</span>
            Why some items are grouped ({duplicates.length})
          </summary>
          <p className="mt-2 text-xs text-foreground/70 leading-relaxed max-w-3xl">
            Related coverage is grouped under the strongest version of a story so the desk stays readable. Similar
            reports are consolidated to reduce repetition; this list points to items linked to a broader developing
            story already shown above.
          </p>
          <ul className="mt-4 space-y-3 border-t border-border pt-4">
            {duplicates.map((row) => {
              return (
                <li key={row.id} className="text-sm">
                  <Link
                    href={row.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-foreground hover:text-primary hover:underline"
                  >
                    {row.title}
                  </Link>
                  <p className="font-mono text-[10px] text-hud-dim mt-1">
                    {row.sourceName} · {duplicateGroupingUserNote(row)}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {!emptyAfterSourceFilter && suppressed.length > 0 ? (
        <details className="border border-border machine-panel p-4 sm:p-5 group">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-foreground/85 list-none flex items-center gap-2">
            <span className="text-primary group-open:rotate-90 transition-transform inline-block">▸</span>
            Not on the default desk ({suppressed.length})
          </summary>
          <p className="mt-2 text-xs text-foreground/70 leading-relaxed max-w-3xl">
            These items stay in the full record but are not prioritized for the live surface. Use Sources for the
            complete picture, including ingest and diagnostics.
          </p>
          <ul className="mt-4 space-y-3 border-t border-border pt-4">
            {suppressed.map((row) => (
              <li key={row.id} className="text-sm">
                <Link
                  href={row.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-foreground hover:text-primary hover:underline"
                >
                  {row.title}
                </Link>
                <p className="font-mono text-[10px] text-hud-dim mt-1">
                  {row.sourceName} ·{' '}
                  {row.suppressionReason?.trim() ||
                    'Available in the full record, but not elevated on the main desk'}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
