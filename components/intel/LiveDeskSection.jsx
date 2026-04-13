import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';

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

function ClusterHint({ clusterKeys }) {
  const keys = clusterKeys && typeof clusterKeys === 'object' ? Object.entries(clusterKeys) : [];
  if (keys.length === 0) return null;
  const label = keys.map(([k, v]) => `${k}:${v}`).join(' · ');
  return (
    <p className="font-mono text-[10px] text-hud-dim tracking-wide mt-2" title="Deterministic cluster keys">
      Keys: {label}
    </p>
  );
}

function RelevanceStrip({ row }) {
  const tags = Array.isArray(row.missionTags) ? row.missionTags : [];
  const explain = Array.isArray(row.relevanceExplanations) ? row.relevanceExplanations : [];
  const top = explain.slice(0, 4);
  return (
    <div className="mt-3 space-y-1.5 border border-border/60 bg-foreground/[0.02] px-3 py-2 rounded">
      <p className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">Relevance (rules)</p>
      <div className="flex flex-wrap gap-2 items-center text-[10px] font-mono text-foreground/75">
        <span>score {row.relevanceScore ?? '—'}</span>
        <span className="text-hud-dim">|</span>
        <span>{row.branchOfGovernment ?? 'unknown'}</span>
        <span className="text-hud-dim">|</span>
        <span>{row.institutionalArea ?? 'unknown'}</span>
      </div>
      {tags.length > 0 ? (
        <p className="font-mono text-[10px] text-foreground/70 leading-snug">
          Tags: {tags.join(', ')}
        </p>
      ) : null}
      {top.length > 0 ? (
        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-foreground/65 leading-relaxed">
          {top.map((e) => (
            <li key={`${e.ruleId}-${e.message.slice(0, 40)}`}>
              <span className="text-hud-dim">{e.ruleId}</span> — {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatFreshnessIso(iso) {
  if (!iso) return '—';
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
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

function DeskStateBadge({ freshnessMeta, snapshotFallback }) {
  if (!freshnessMeta) return null;
  const deskState = snapshotFallback ? 'snapshot' : freshnessMeta.deskState;
  const base =
    'font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 border rounded shrink-0';
  if (deskState === 'snapshot') {
    return (
      <span
        className={`${base} border-amber-500/60 text-amber-600 dark:text-amber-400 bg-amber-500/10`}
        title="Not a live query — last saved desk"
      >
        Saved snapshot
      </span>
    );
  }
  if (deskState === 'stale') {
    return (
      <span
        className={`${base} border-primary/50 text-primary bg-primary/5`}
        title="Data older than freshness threshold"
      >
        Stale
      </span>
    );
  }
  return (
    <span
      className={`${base} border-emerald-500/40 text-emerald-700 dark:text-emerald-400/90 bg-emerald-500/10`}
      title="Within freshness threshold"
    >
      Fresh
    </span>
  );
}

export default function LiveDeskSection({ desk }) {
  const {
    configured,
    stale,
    dataStale,
    snapshotFallback,
    liveReadOk,
    intelSchemaMisconfigured,
    items,
    suppressedItems = [],
    duplicateItems = [],
    message,
    freshness,
    freshnessMeta,
    deskLane = 'osint',
  } = desk;

  const deskLabel = deskLane === 'voices' ? 'Voices' : 'OSINT';

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

  return (
    <div className="space-y-6">
      {showFreshnessStrip && freshness ? (
        <div className="flex flex-wrap items-start gap-3 border border-border machine-panel p-4">
          <DeskStateBadge freshnessMeta={freshnessMeta} snapshotFallback={snapshotFallback} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-mono text-[10px] text-hud-dim tracking-wide uppercase">
              Latest item fetch: {formatFreshnessIso(freshness.latestFetchedAt)} · Last successful ingest:{' '}
              {formatFreshnessIso(freshness.latestSuccessfulIngestAt)}
            </p>
            {freshnessMeta ? (
              <p className="font-mono text-[10px] text-foreground/65 tracking-wide">
                Threshold: {freshnessMeta.thresholdMinutes}m
                {freshnessMeta.latestFetchedAgeMinutes != null
                  ? ` · Last fetch age: ${freshnessMeta.latestFetchedAgeMinutes}m`
                  : ''}
                {freshnessMeta.latestSuccessAgeMinutes != null
                  ? ` · Last success age: ${freshnessMeta.latestSuccessAgeMinutes}m`
                  : ''}
              </p>
            ) : null}
            <p className="font-mono text-[10px] text-foreground/55 tracking-wide mt-2 max-w-3xl leading-relaxed">
              Desk build: surfaced rows first, then a capped downranked pool; suppressed fetched separately. Duplicate
              cluster losers are grouped below the main list (not deleted).
            </p>
          </div>
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

      {liveReadOk && items.length === 0 ? (
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

      {!liveReadOk && !snapshotFallback && items.length === 0 ? (
        <section className="border border-border p-6 machine-panel">
          <p className="text-foreground/80 text-sm uppercase tracking-wider">
            Nothing to show yet — {deskLabel} read failed and no saved desk snapshot exists.
          </p>
        </section>
      ) : null}

      <ul className="space-y-4">
        {items.map((row) => {
          const when = row.publishedAt ? formatDate(row.publishedAt) : '—';
          return (
            <li key={row.id} className="machine-panel border border-border p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 gap-y-2 mb-3">
                <ProvenanceChip provenanceClass={row.provenanceClass} />
                <SurfaceChip surfaceState={row.surfaceState ?? 'surfaced'} isDuplicateLoser={false} />
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
              <RelevanceStrip row={row} />
              <ClusterHint clusterKeys={row.clusterKeys} />
              <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3">
                <Link
                  href={row.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
                >
                  {linkCtaLabel(row)}
                </Link>
                <span className="font-mono text-[10px] text-hud-dim self-center">
                  state: {row.stateChangeType}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {duplicates.length > 0 ? (
        <details className="border border-border machine-panel p-4 sm:p-5 group">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-foreground/85 list-none flex items-center gap-2">
            <span className="text-primary group-open:rotate-90 transition-transform inline-block">▸</span>
            Duplicate cluster pointers ({duplicates.length}) — not on main surface
          </summary>
          <p className="mt-2 text-[10px] font-mono text-hud-dim leading-relaxed">
            Same deterministic cluster key as a stronger line already shown above. Rule id{' '}
            <code className="text-primary/90">desk:duplicate_cluster</code> in relevance notes on each row.
          </p>
          <ul className="mt-4 space-y-3 border-t border-border pt-4">
            {duplicates.map((row) => (
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
                  {(Array.isArray(row.relevanceExplanations)
                    ? row.relevanceExplanations.find((e) => e.ruleId === 'desk:duplicate_cluster')?.message
                    : null) ?? 'Weaker duplicate of another desk line'}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {suppressed.length > 0 ? (
        <details className="border border-border machine-panel p-4 sm:p-5 group">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-foreground/85 list-none flex items-center gap-2">
            <span className="text-primary group-open:rotate-90 transition-transform inline-block">▸</span>
            Suppressed on default surface ({suppressed.length}) — retained in storage, rule-based
          </summary>
          <p className="mt-2 text-[10px] font-mono text-hud-dim leading-relaxed">
            Ingest-time <code className="text-primary/90">surface_state = suppressed</code>. Counts in /intel/sources
            include these rows.
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
                  {row.sourceName} · {row.suppressionReason ?? 'Suppressed (see rules in /intel/sources)'}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
