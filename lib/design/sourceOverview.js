/**
 * Counts for the public source monitor.
 * Groups rows by the classifications the audit already assigned.
 * Does not score claims, invent confidence, or treat intake health as verification.
 */

export const SOURCE_HEALTH_ORDER = ['healthy', 'stale', 'unproven', 'failing', 'disabled'];

export const SOURCE_STATUS_LABELS = {
  enabled_healthy: 'Healthy',
  enabled_stale: 'Ingest stale',
  enabled_unproven: 'Unproven',
  enabled_failing: 'Upstream failure',
  enabled_blocked: 'Access restricted',
  enabled_misconfigured: 'Misconfigured',
  enabled_quarantined: 'Redirect failure',
  enabled_parser_mismatch: 'Parser failure',
  enabled_valid_empty: 'Valid empty',
  enabled_not_publishing: 'Not publishing',
  disabled_policy: 'Disabled',
  disabled_placeholder: 'Placeholder',
  disabled_env_gated: 'Not configured',
  disabled_other: 'Disabled',
  needs_configuration: 'Needs configuration',
};

const STATUS_ORDER = Object.keys(SOURCE_STATUS_LABELS);

export function sourceStatusLabel(bucket) {
  if (!bucket) return '';
  return SOURCE_STATUS_LABELS[bucket] || bucket;
}

export function summarizeSourceAudit(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const healthCounts = Object.create(null);
  const statusCounts = Object.create(null);

  for (const row of list) {
    const health = SOURCE_HEALTH_ORDER.includes(row?.health) ? row.health : 'unproven';
    healthCounts[health] = (healthCounts[health] || 0) + 1;
    const bucket = row?.statusBucket;
    if (typeof bucket === 'string' && bucket) {
      statusCounts[bucket] = (statusCounts[bucket] || 0) + 1;
    }
  }

  const knownStatus = STATUS_ORDER.filter((key) => statusCounts[key]);
  const otherStatus = Object.keys(statusCounts)
    .filter((key) => !STATUS_ORDER.includes(key))
    .sort();

  return {
    total: list.length,
    byHealth: SOURCE_HEALTH_ORDER.filter((key) => healthCounts[key]).map((key) => ({
      key,
      count: healthCounts[key],
    })),
    byStatus: [...knownStatus, ...otherStatus].map((key) => ({
      key,
      label: sourceStatusLabel(key),
      count: statusCounts[key],
    })),
  };
}
