import { formatDate } from '@/lib/utils/date';
import { sourceStatusLabel, summarizeSourceAudit } from '@/lib/design/sourceOverview';

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
  const rawEntryCount = typeof meta.rawEntryCount === 'number' ? meta.rawEntryCount : null;
  const failureCategory = typeof meta.failureCategory === 'string' ? meta.failureCategory : null;
  const outcome = typeof meta.outcome === 'string' ? meta.outcome : null;
  const redirects = Array.isArray(meta.redirects) ? meta.redirects : null;

  const parts = [];
  if (outcome) parts.push(outcome);
  if (failureCategory) parts.push(failureCategory);
  if (httpStatus != null) parts.push(`HTTP ${httpStatus}`);
  if (rawEntryCount != null) parts.push(`raw ${rawEntryCount}`);
  if (itemsParsed != null) parts.push(`parsed ${itemsParsed}`);
  if (redirects && redirects.length) parts.push(`redirects ${redirects.length}`);
  if (finalUrl) parts.push(finalUrl);

  return parts.length ? parts.join(' · ') : null;
}

const STATUS_TONE = {
  enabled_healthy: 'nominal',
  enabled_valid_empty: 'nominal',
  enabled_stale: 'watch',
  enabled_not_publishing: 'watch',
  enabled_unproven: 'attention',
  enabled_parser_mismatch: 'attention',
  needs_configuration: 'attention',
  enabled_failing: 'fault',
  enabled_blocked: 'fault',
  enabled_misconfigured: 'fault',
  enabled_quarantined: 'fault',
  disabled_policy: 'idle',
  disabled_placeholder: 'idle',
  disabled_env_gated: 'idle',
  disabled_other: 'idle',
};

function HealthBadge({ health }) {
  const tone = ['healthy', 'stale', 'failing', 'disabled', 'unproven'].includes(health)
    ? health
    : 'unproven';
  return <span className={`obs-status obs-status--${tone}`}>{health}</span>;
}

function StatusBadge({ bucket }) {
  if (!bucket) return null;
  const tone = STATUS_TONE[bucket] || 'idle';
  return <span className={`obs-status obs-status--${tone}`}>{sourceStatusLabel(bucket)}</span>;
}

function Readout({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RunError({ row }) {
  if (!row.lastRunError) return null;
  const meta = formatRunMeta(row.lastRunMeta);
  return (
    <div className="obs-fault">
      <p className="obs-fault__label">Last run error</p>
      <p className="obs-fault__body">{row.lastRunError}</p>
      {meta ? <p className="obs-fault__meta">{meta}</p> : null}
    </div>
  );
}

function FullRecord({ row, showError = true }) {
  return (
    <div className="obs-record__body">
      {showError ? <RunError row={row} /> : null}
      {row.purpose ? <p className="obs-record__purpose">{row.purpose}</p> : null}
      <dl className="obs-readout">
        <Readout label="Provenance">{row.provenanceClass}</Readout>
        <Readout label="Database">{row.isEnabled ? 'Enabled' : 'Not enabled'}</Readout>
        <Readout label="Manifest">{row.manifestEnabled ? 'Listed' : 'Not listed'}</Readout>
        <Readout label="Fetch">{row.fetchKind}</Readout>
        <Readout label="Endpoint">{row.endpointDisplay}</Readout>
        <Readout label="Latest run">
          {row.lastRunStatus ?? '—'} · {formatIso(row.lastRunFinishedAt)}
        </Readout>
        <Readout label="Latest success">{formatIso(row.lastSuccessAt)}</Readout>
        <Readout label="Last successful fetch">{formatIso(row.lastSuccessfulFetchAt)}</Readout>
        <Readout label="Last successful parse">{formatIso(row.lastSuccessfulParseAt)}</Readout>
        <Readout label="Newest article">{formatIso(row.newestArticlePublishedAt)}</Readout>
        <Readout label="Latest item fetch">{formatIso(row.lastItemFetchedAt)}</Readout>
        <Readout label="Items, 24h / 7d / total">
          {row.items24h} / {row.items7d} / {row.itemTotal}
        </Readout>
        <Readout label="Surfaced / downranked / suppressed, 7d">
          {row.surfaced7d} / {row.downranked7d} / {row.suppressed7d}
        </Readout>
        <Readout label="Surfaced / downranked / suppressed, all">
          {row.surfacedTotal} / {row.downrankedTotal} / {row.suppressedTotal}
        </Readout>
        <Readout label="Trusted for">{row.trustedFor ?? '—'}</Readout>
        <Readout label="Not trusted for">{row.notTrustedFor ?? '—'}</Readout>
      </dl>
      {row.manifestEnabled && !row.isEnabled ? (
        <p className="obs-record__note">Listed in the manifest, not yet active in the database.</p>
      ) : null}
      {row.editorialNotes ? (
        <p className="obs-record__note">
          <span>Editorial / ops notes. </span>
          {row.editorialNotes}
        </p>
      ) : null}
      {row.noiseNotes ? (
        <p className="obs-record__note">
          <span>Relevance — volume / noise. </span>
          {row.noiseNotes}
        </p>
      ) : null}
      {row.relevanceNotes ? (
        <p className="obs-record__note">
          <span>Relevance — scoring notes. </span>
          {row.relevanceNotes}
        </p>
      ) : null}
    </div>
  );
}

function SourceIdentity({ row }) {
  return (
    <div className="obs-identity">
      <h2 className="obs-identity__name">{row.name}</h2>
      <p className="obs-identity__slug">{row.slug}</p>
      {row.isCoreSource ? <p className="obs-identity__core">Core source</p> : null}
    </div>
  );
}

function SourceOverview({ rows, staleThresholdMinutes }) {
  const summary = summarizeSourceAudit(rows);
  return (
    <section className="obs-overview" aria-label="Source intake summary" data-testid="source-health-summary">
      <p className="obs-disclaimer">
        Source health describes intake status. It does not verify the claims those sources publish.
      </p>
      <p className="obs-overview__threshold">
        A source is marked stale after {staleThresholdMinutes} minutes without a successful update.
      </p>
      <dl className="obs-overview__counts">
        <div>
          <dt>Sources</dt>
          <dd>{summary.total}</dd>
        </div>
        {summary.byHealth.map((item) => (
          <div key={item.key}>
            <dt>{item.key}</dt>
            <dd>{item.count}</dd>
          </div>
        ))}
      </dl>
      {summary.byStatus.length > 0 ? (
        <ul className="obs-overview__status" aria-label="Status classifications">
          {summary.byStatus.map((item) => (
            <li key={item.key}>
              <span>{item.label}</span>
              <span>{item.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function SourcesAuditSection({ audit }) {
  const { configured, staleThresholdMinutes, rows, errorMessage, build } = audit;

  if (!configured) {
    console.warn('[intel-sources]', errorMessage || 'Source storage is not configured.');
    return (
      <section className="obs-panel">
        <p className="obs-panel__message">Source records are unavailable right now.</p>
      </section>
    );
  }

  if (errorMessage) {
    console.error('[intel-sources]', errorMessage);
    if (/schema|constraint|migration|column|relation/i.test(errorMessage)) {
      console.error(
        '[intel-sources] Apply intel migrations in order through at least 20260418201000_intel_source_items_desk_lane_extend.sql and 20260418120000_intel_source_family_desk_lanes.sql, then run ingest once.',
      );
    }
    return (
      <section className="obs-panel obs-panel--fault">
        <p className="obs-panel__message">Source records could not be read.</p>
      </section>
    );
  }

  console.info('[intel-sources] build', {
    manifestFingerprint: build?.manifestFingerprint ?? null,
    relevanceRuleVersion: build?.relevanceRuleVersion ?? null,
    gitCommitSha: build?.gitCommitSha ?? null,
  });
  for (const row of rows) {
    if (row.manifestEnabled && !row.isEnabled) {
      console.info(
        `[intel-sources] ${row.slug} is listed in the manifest but not active. Run ingest once to sync sources.is_enabled.`,
      );
    }
  }

  return (
    <div className="obs-audit">
      <SourceOverview rows={rows} staleThresholdMinutes={staleThresholdMinutes} />

      {rows.length === 0 ? (
        <p className="obs-panel__message">No sources are listed in this record.</p>
      ) : (
      <>
      <div className="obs-scan-wrap hidden lg:block">
        <table className="obs-table">
          <caption className="sr-only">Source intake records</caption>
          <colgroup>
            <col className="obs-table__status" />
            <col className="obs-table__source" />
            <col className="obs-table__fresh" />
            <col className="obs-table__items" />
            <col className="obs-table__treat" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Source</th>
              <th scope="col">Latest success</th>
              <th scope="col">24h / 7d / total</th>
              <th scope="col">Surfaced / down / supp, 7d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="obs-table__row">
                <td>
                  <div className="obs-table__badges">
                    <HealthBadge health={row.health} />
                    <StatusBadge bucket={row.statusBucket} />
                  </div>
                  {row.statusDetail ? <p className="obs-table__reason">{row.statusDetail}</p> : null}
                  {row.healthReason ? <p className="obs-table__reason">{row.healthReason}</p> : null}
                  {row.noiseHint ? <p className="obs-table__reason">{row.noiseHint}</p> : null}
                  <RunError row={row} />
                </td>
                <td>
                  <SourceIdentity row={row} />
                  <p className="obs-table__class">{row.provenanceClass}</p>
                  <details className="obs-fold">
                    <summary>Full record</summary>
                    <FullRecord row={row} showError={false} />
                  </details>
                </td>
                <td className="obs-table__mono">{formatIso(row.lastSuccessAt)}</td>
                <td className="obs-table__mono">
                  {row.items24h} / {row.items7d} / {row.itemTotal}
                </td>
                <td className="obs-table__mono">
                  {row.surfaced7d} / {row.downranked7d} / {row.suppressed7d}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="obs-cards lg:hidden">
        {rows.map((row) => (
          <article key={`card-${row.id}`} className="obs-card">
            <header className="obs-card__header">
              <SourceIdentity row={row} />
              <div className="obs-table__badges">
                <HealthBadge health={row.health} />
                <StatusBadge bucket={row.statusBucket} />
              </div>
            </header>
            {row.statusDetail ? <p className="obs-table__reason">{row.statusDetail}</p> : null}
            {row.healthReason ? <p className="obs-table__reason">{row.healthReason}</p> : null}
            {row.noiseHint ? <p className="obs-table__reason">{row.noiseHint}</p> : null}
            <FullRecord row={row} />
          </article>
        ))}
      </div>
      </>
      )}
    </div>
  );
}
