import { formatDate } from '@/lib/utils/date';

function formatIso(iso) {
  if (!iso) return '—';
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
}

function formatRunMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;

  const httpStatus = typeof meta.httpStatus === 'number' ? meta.httpStatus : null;
  const finalUrl = typeof meta.finalUrl === 'string' ? meta.finalUrl : null;
  const itemsParsed = typeof meta.itemsParsed === 'number' ? meta.itemsParsed : null;

  const parts = [];
  if (httpStatus != null) parts.push(`HTTP ${httpStatus}`);
  if (itemsParsed != null) parts.push(`parsed ${itemsParsed}`);
  if (finalUrl) parts.push(finalUrl);

  return parts.length ? parts.join(' · ') : null;
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
  const { configured, staleThresholdMinutes, rows, errorMessage } = audit;

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
          Apply intel migrations in order through at least{' '}
          <code className="text-primary">20260418120000_intel_source_family_desk_lanes.sql</code> (adds{' '}
          <code className="text-primary">source_family</code>, extended desk lanes, snapshots). If RPCs fail, apply
          earlier intel migrations first, then run ingest once to sync the manifest.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <p className="font-mono text-[10px] text-hud-dim tracking-wide uppercase">
        Stale / health threshold: {staleThresholdMinutes}m (INTEL_DESK_STALE_AFTER_MINUTES) · counts from
        source_items · last run from ingest_runs
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
              <th className="p-3 align-bottom">Latest run</th>
              <th className="p-3 align-bottom">Latest success</th>
              <th className="p-3 align-bottom">Latest item fetch</th>
              <th className="p-3 align-bottom">24h / 7d / total</th>
              <th className="p-3 align-bottom">Surfaced / down / supp (7d)</th>
              <th className="p-3 align-bottom">Surfaced / down / supp (all)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/80 align-top hover:bg-foreground/[0.02]">
                <td className="p-3">
                  <HealthBadge health={r.health} />
                  {r.healthReason ? (
                    <p className="font-mono text-[9px] text-foreground/55 mt-2 max-w-[180px] leading-snug">
                      {r.healthReason}
                    </p>
                  ) : null}
                  {r.noiseHint ? (
                    <p className="font-mono text-[9px] text-foreground/45 mt-2 max-w-[180px] leading-snug">
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
                  {r.purpose ? <p className="text-foreground/70 text-xs mt-3 leading-relaxed">{r.purpose}</p> : null}
                  {r.lastRunError ? (
                    <div className="mt-3 border border-red-500/30 bg-red-500/[0.04] p-2">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-red-400">
                        Last run error
                      </div>
                      <div className="text-red-300 text-xs mt-1 break-words">{r.lastRunError}</div>
                      {formatRunMeta(r.lastRunMeta) ? (
                        <div className="text-foreground/45 text-[11px] mt-1 break-words">
                          {formatRunMeta(r.lastRunMeta)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </td>

                <td className="p-3 font-mono text-xs">{r.provenanceClass}</td>
                <td className="p-3 font-mono text-[10px] align-top">
                  <div>
                    <span className="text-hud-dim">DB</span> {r.isEnabled ? 'yes' : 'no'}
                  </div>
                  <div className="mt-0.5">
                    <span className="text-hud-dim">Manifest</span>{' '}
                    {r.manifestEnabled ? 'yes' : 'no'}
                  </div>
                  {r.manifestEnabled && !r.isEnabled ? (
                    <p className="text-amber-700 dark:text-amber-400/90 mt-1.5 max-w-[200px] leading-snug">
                      Run ingest once to sync registry (sources.is_enabled).
                    </p>
                  ) : null}
                </td>
                <td className="p-3 font-mono text-[10px] text-foreground/80 max-w-[220px] break-all">
                  {r.fetchKind}
                  <div className="text-hud-dim mt-1 break-all">{r.endpointDisplay}</div>
                </td>
                <td className="p-3 font-mono text-[10px]">
                  {r.lastRunStatus ?? '—'}
                  <div className="text-hud-dim mt-1">{formatIso(r.lastRunFinishedAt)}</div>
                </td>
                <td className="p-3 font-mono text-[10px] text-foreground/85">{formatIso(r.lastSuccessAt)}</td>
                <td className="p-3 font-mono text-[10px] text-foreground/85">{formatIso(r.lastItemFetchedAt)}</td>
                <td className="p-3 font-mono text-[10px] whitespace-nowrap">
                  {r.items24h} / {r.items7d} / {r.itemTotal}
                </td>
                <td className="p-3 font-mono text-[10px] whitespace-nowrap">
                  {r.surfaced7d} / {r.downranked7d} / {r.suppressed7d}
                </td>
                <td className="p-3 font-mono text-[10px] whitespace-nowrap">
                  {r.surfacedTotal} / {r.downrankedTotal} / {r.suppressedTotal}
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

            {r.lastRunError ? (
              <div className="mb-4 border border-red-500/30 bg-red-500/[0.04] p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-red-400">Last run error</p>
                <p className="mt-2 font-mono text-xs leading-relaxed text-red-300 break-words">
                  {r.lastRunError}
                </p>
                {formatRunMeta(r.lastRunMeta) ? (
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-hud-dim break-words">
                    {formatRunMeta(r.lastRunMeta)}
                  </p>
                ) : null}
              </div>
            ) : null}

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
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">Latest run</dt>
                <dd className="text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                  {r.lastRunStatus ?? '—'} · {formatIso(r.lastRunFinishedAt)}
                </dd>
              </div>

              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">Latest success</dt>
                <dd className="text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                  {formatIso(r.lastSuccessAt)}
                </dd>
              </div>

              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">Latest item fetch</dt>
                <dd className="text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                  {formatIso(r.lastItemFetchedAt)}
                </dd>
              </div>

              <div>
                <dt className="font-mono text-[10px] uppercase text-hud-dim tracking-wider">
                  Ingest-time surfacing (DB)
                </dt>
                <dd className="text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                  Last 7d: {r.surfaced7d} surfaced · {r.downranked7d} downranked · {r.suppressed7d} suppressed — All
                  time: {r.surfacedTotal} / {r.downrankedTotal} / {r.suppressedTotal}
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}