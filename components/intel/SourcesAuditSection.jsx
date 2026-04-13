function formatIso(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
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
  const map = {
    healthy: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/[0.06]',
    stale: 'border-amber-500/40 text-amber-300 bg-amber-500/[0.06]',
    failing: 'border-red-500/40 text-red-300 bg-red-500/[0.06]',
    disabled: 'border-white/15 text-white/45 bg-white/[0.03]',
    unproven: 'border-yellow-500/40 text-yellow-300 bg-yellow-500/[0.06]',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 border text-[10px] font-mono uppercase tracking-[0.22em] ${map[health] || map.disabled}`}
    >
      {health}
    </span>
  );
}

function CountPill({ label, value }) {
  return (
    <div className="border border-white/10 px-2 py-1">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/45">{label}</div>
      <div className="font-mono text-xs text-white/90 mt-1">{value}</div>
    </div>
  );
}

export default function SourcesAuditSection({ audit }) {
  if (!audit?.configured) {
    return (
      <section className="border border-red-500/30 bg-red-500/[0.04] p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-red-400">
          Sources audit unavailable
        </p>
        <p className="mt-2 text-sm text-white/70">{audit?.message || 'Unknown configuration error.'}</p>
      </section>
    );
  }

  const rows = audit.rows || [];

  return (
    <section className="space-y-4">
      <div className="border border-white/10 bg-black/20 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">
          Relevance rule version <span className="text-red-400">{audit.versionLabel}</span>
        </p>
        <p className="mt-2 text-sm text-white/65">
          This page shows actual source health, ingest history, and the most recent error we have for
          each source.
        </p>
      </div>

      <div className="hidden md:block overflow-x-auto border border-white/10">
        <table className="w-full text-left">
          <thead className="border-b border-white/10 bg-white/[0.02]">
            <tr className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
              <th className="p-3">Health</th>
              <th className="p-3">Source</th>
              <th className="p-3">Class</th>
              <th className="p-3">Items</th>
              <th className="p-3">Latest run</th>
              <th className="p-3">Latest success</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-white/10 align-top">
                <td className="p-3">
                  <HealthBadge health={r.health} />
                  {r.healthReason ? (
                    <div className="mt-2 text-xs text-white/50 max-w-[220px]">{r.healthReason}</div>
                  ) : null}
                </td>

                <td className="p-3">
                  <div className="text-base font-semibold text-white">{r.name}</div>
                  <div className="mt-1 font-mono text-[11px] text-white/40">{r.slug}</div>
                  <div className="mt-2 font-mono text-[10px] text-white/35">{r.endpointDisplay}</div>

                  {r.purpose ? (
                    <div className="mt-3 text-sm text-white/70 leading-relaxed">{r.purpose}</div>
                  ) : null}

                  {r.lastRunError ? (
                    <div className="mt-3 border border-red-500/30 bg-red-500/[0.04] p-2">
                      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-red-400">
                        Last run error
                      </div>
                      <div className="mt-1 text-xs text-red-300 break-words">{r.lastRunError}</div>
                      {formatRunMeta(r.lastRunMeta) ? (
                        <div className="mt-1 text-[11px] text-white/45 break-words">
                          {formatRunMeta(r.lastRunMeta)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </td>

                <td className="p-3">
                  <div className="font-mono text-xs uppercase tracking-[0.22em] text-white/80">
                    {r.provenanceClass}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-white/40">{r.fetchKind}</div>
                  {r.isCoreSource ? (
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-red-400">
                      Core
                    </div>
                  ) : null}
                </td>

                <td className="p-3">
                  <div className="grid grid-cols-2 gap-2 max-w-[220px]">
                    <CountPill label="total" value={r.itemTotal} />
                    <CountPill label="24h" value={r.items24h} />
                    <CountPill label="7d surfaced" value={r.surfaced7d} />
                    <CountPill label="7d supp." value={r.suppressed7d} />
                  </div>
                </td>

                <td className="p-3">
                  <div className="font-mono text-xs text-white/85">{r.lastRunStatus || '—'}</div>
                  <div className="mt-1 text-xs text-white/45">{formatIso(r.lastRunFinishedAt)}</div>
                </td>

                <td className="p-3">
                  <div className="text-xs text-white/70">{formatIso(r.lastSuccessAt)}</div>
                  <div className="mt-1 text-xs text-white/45">
                    last item {formatIso(r.lastItemFetchedAt)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:hidden">
        {rows.map((r) => (
          <article key={r.id} className="border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <HealthBadge health={r.health} />
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
                {r.provenanceClass}
              </div>
            </div>

            <h2 className="mt-3 text-xl font-semibold text-white">{r.name}</h2>
            <div className="mt-1 font-mono text-[11px] text-white/40">{r.slug}</div>
            <div className="mt-2 font-mono text-[11px] text-white/35 break-words">{r.endpointDisplay}</div>

            {r.healthReason ? (
              <p className="mt-3 text-sm text-white/60">{r.healthReason}</p>
            ) : null}

            {r.purpose ? <p className="mt-3 text-sm leading-relaxed text-white/72">{r.purpose}</p> : null}

            {r.lastRunError ? (
              <div className="mt-4 border border-red-500/30 bg-red-500/[0.04] p-3">
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-red-400">
                  Last run error
                </div>
                <div className="mt-2 text-sm text-red-300 break-words">{r.lastRunError}</div>
                {formatRunMeta(r.lastRunMeta) ? (
                  <div className="mt-2 text-xs text-white/45 break-words">{formatRunMeta(r.lastRunMeta)}</div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <CountPill label="total items" value={r.itemTotal} />
              <CountPill label="items 24h" value={r.items24h} />
              <CountPill label="surfaced 7d" value={r.surfaced7d} />
              <CountPill label="suppressed 7d" value={r.suppressed7d} />
            </div>

            <div className="mt-4 grid gap-2 text-sm text-white/68">
              <div>
                <span className="text-white/45">Latest run:</span> {r.lastRunStatus || '—'} ·{' '}
                {formatIso(r.lastRunFinishedAt)}
              </div>
              <div>
                <span className="text-white/45">Latest success:</span> {formatIso(r.lastSuccessAt)}
              </div>
              <div>
                <span className="text-white/45">Latest item fetch:</span> {formatIso(r.lastItemFetchedAt)}
              </div>
              {r.trustedFor ? (
                <div>
                  <span className="text-white/45">Trusted for:</span> {r.trustedFor}
                </div>
              ) : null}
              {r.notTrustedFor ? (
                <div>
                  <span className="text-white/45">Not trusted for:</span> {r.notTrustedFor}
                </div>
              ) : null}
              {r.editorialNotes ? (
                <div>
                  <span className="text-white/45">Notes:</span> {r.editorialNotes}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}