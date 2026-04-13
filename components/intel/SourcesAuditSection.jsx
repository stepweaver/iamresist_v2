import { formatDate } from '@/lib/utils/date';

function formatIso(iso) {
  if (!iso) return '—';
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
}

function HealthBadge({ health }) {
  const base =
    'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded whitespace-nowrap';
  const map = {
    healthy: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400/90 bg-emerald-500/10',
    stale: 'border-primary/50 text-primary bg-primary/5',
    failing: 'border-red-500/50 text-red-700 dark:text-red-400 bg-red-500/10',
    disabled: 'border-border text-foreground/50 bg-foreground/5',
    unproven: 'border-amber-500/40 text-amber-700 dark:text-amber-400/80 bg-amber-500/10',
  };
  return <span className={`${base} ${map[health] || map.unproven}`}>{health}</span>;
}

export default function SourcesAuditSection({ audit }) {
  const { configured, staleThresholdMinutes, relevanceRuleVersion, rows, errorMessage } = audit;

  if (!configured) {
    return (
      <section className="border border-border p-6 machine-panel">
        <p className="text-foreground/80 text-sm uppercase tracking-wider">{errorMessage}</p>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="border border-red-500/40 p-6 machine-panel">
        <p className="text-red-700 dark:text-red-400 text-sm font-mono">{errorMessage}</p>
        <p className="text-foreground/60 text-xs mt-2 font-mono">
          Apply intel migrations through{' '}
          <code className="text-primary">20260412160000_intel_milestone1_75_relevance.sql</code> if RPC or columns
          are missing, then run ingest once to sync manifest fields.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <p className="font-mono text-[10px] text-hud-dim tracking-wide uppercase">
        Stale / health threshold: {staleThresholdMinutes}m (INTEL_DESK_STALE_AFTER_MINUTES) · counts from
        source_items · last run from ingest_runs · app relevance rule version{' '}
        <code className="text-primary/90">{relevanceRuleVersion ?? '—'}</code> (stale counts vs this version)
      </p>

      <div className="overflow-x-auto border border-border machine-panel">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wider text-hud-dim">
              <th className="p-3 align-bottom">Health</th>
              <th className="p-3 align-bottom">Source</th>
              <th className="p-3 align-bottom">Class</th>
              <th className="p-3 align-bottom">Enabled</th>
              <th className="p-3 align-bottom">Fetch</th>
              <th className="p-3 align-bottom">Last ingest</th>
              <th className="p-3 align-bottom">Last OK</th>
              <th className="p-3 align-bottom">Last item fetch</th>
              <th className="p-3 align-bottom">24h / 7d / total</th>
              <th className="p-3 align-bottom">Surfaced / down / supp (7d)</th>
              <th className="p-3 align-bottom">Surfaced / down / supp (all)</th>
              <th className="p-3 align-bottom">Unscored / rule-stale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/80 align-top hover:bg-foreground/[0.02]">
                <td className="p-3">
                  <HealthBadge health={r.health} />
                  {r.noiseHint ? (
                    <p className="font-mono text-[9px] text-foreground/55 mt-2 max-w-[140px] leading-snug">
                      {r.noiseHint}
                    </p>
                  ) : null}
                </td>
                <td className="p-3">
                  <div className="font-bold text-foreground">{r.name}</div>
                  <div className="font-mono text-[10px] text-hud-dim mt-0.5">{r.slug}</div>
                  {r.isCoreSource ? (
                    <span className="inline-block mt-1 font-mono text-[9px] uppercase text-primary/80">
                      Core
                    </span>
                  ) : null}
                </td>
                <td className="p-3 font-mono text-xs">{r.provenanceClass}</td>
                <td className="p-3 font-mono text-xs">{r.isEnabled ? 'yes' : 'no'}</td>
                <td className="p-3 font-mono text-[10px] text-foreground/80 max-w-[200px] break-all">
                  {r.fetchKind}
                  <div className="text-hud-dim mt-1 break-all">{r.endpointDisplay}</div>
                </td>
                <td className="p-3 font-mono text-[10px]">
                  {r.lastRunStatus ?? '—'}
                  <div className="text-hud-dim mt-1">{formatIso(r.lastRunFinishedAt)}</div>
                </td>
                <td className="p-3 font-mono text-[10px] text-foreground/85">{formatIso(r.lastSuccessAt)}</td>
                <td className="p-3 font-mono text-[10px] text-foreground/85">
                  {formatIso(r.lastItemFetchedAt)}
                </td>
                <td className="p-3 font-mono text-[10px] whitespace-nowrap">
                  {r.items24h} / {r.items7d} / {r.itemTotal}
                </td>
                <td className="p-3 font-mono text-[10px] whitespace-nowrap leading-snug">
                  {r.surfaced7d} / {r.downranked7d} / {r.suppressed7d}
                </td>
                <td className="p-3 font-mono text-[10px] whitespace-nowrap leading-snug">
                  {r.surfacedTotal} / {r.downrankedTotal} / {r.suppressedTotal}
                </td>
                <td className="p-3 font-mono text-[10px] whitespace-nowrap leading-snug">
                  {r.itemsNeverScored} / {r.itemsRuleStale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-8">
        {rows.map((r) => (
          <section key={`gov-${r.id}`} className="machine-panel border border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h2 className="section-title text-base font-bold text-foreground">{r.name}</h2>
              <HealthBadge health={r.health} />
            </div>
            <dl className="grid gap-3 sm:grid-cols-1 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">Purpose</dt>
                <dd className="text-foreground/85 mt-1">{r.purpose ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">Trusted for</dt>
                <dd className="text-foreground/85 mt-1">{r.trustedFor ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">Not trusted for</dt>
                <dd className="text-foreground/85 mt-1">{r.notTrustedFor ?? '—'}</dd>
              </div>
              {r.editorialNotes ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">
                    Editorial / ops notes
                  </dt>
                  <dd className="text-foreground/75 mt-1 font-mono text-xs leading-relaxed">{r.editorialNotes}</dd>
                </div>
              ) : null}
              {r.noiseNotes ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">
                    Relevance — volume / noise
                  </dt>
                  <dd className="text-foreground/75 mt-1 font-mono text-xs leading-relaxed">{r.noiseNotes}</dd>
                </div>
              ) : null}
              {r.relevanceNotes ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">
                    Relevance — scoring notes
                  </dt>
                  <dd className="text-foreground/75 mt-1 font-mono text-xs leading-relaxed">{r.relevanceNotes}</dd>
                </div>
              ) : null}
              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">
                  Ingest-time surfacing (DB)
                </dt>
                <dd className="text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                  Last 7d: {r.surfaced7d} surfaced · {r.downranked7d} downranked · {r.suppressed7d} suppressed — All
                  time: {r.surfacedTotal} / {r.downrankedTotal} / {r.suppressedTotal}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">
                  Relevance stamp health
                </dt>
                <dd className="text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                  Missing <code className="text-primary/90">relevance_computed_at</code>: {r.itemsNeverScored} — Rule
                  version ≠ app <code className="text-primary/90">{relevanceRuleVersion ?? '—'}</code>:{' '}
                  {r.itemsRuleStale} (run <code className="text-primary/90">GET /api/cron/intel-rescore</code> with
                  cron secret)
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
