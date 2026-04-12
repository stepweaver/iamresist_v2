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

export default function LiveDeskSection({ desk }) {
  const { configured, stale, items, message } = desk;

  if (!configured) {
    return (
      <section className="border border-border p-6 machine-panel">
        <p className="text-foreground/80 text-sm uppercase tracking-wider">
          Live desk storage is not configured (set Supabase env vars and apply the{' '}
          <code className="font-mono text-xs">intel</code> schema migration).
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {stale && message ? (
        <div className="border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-foreground/90">
          <span className="font-bold uppercase tracking-wider text-primary">Stale / error</span>
          <p className="mt-1 font-mono text-xs text-foreground/80">{message}</p>
        </div>
      ) : null}

      {!stale && items.length === 0 ? (
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

      <ul className="space-y-4">
        {items.map((row) => {
          const when = row.publishedAt ? formatDate(row.publishedAt) : '—';
          return (
            <li key={row.id} className="machine-panel border border-border p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 gap-y-2 mb-3">
                <ProvenanceChip provenanceClass={row.provenanceClass} />
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
              <ClusterHint clusterKeys={row.clusterKeys} />
              <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3">
                <Link
                  href={row.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
                >
                  Open canonical →
                </Link>
                <span className="font-mono text-[10px] text-hud-dim self-center">
                  state: {row.stateChangeType}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
