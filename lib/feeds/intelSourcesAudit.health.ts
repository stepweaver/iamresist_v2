import { publicInspectionDeskClosed } from '@/lib/intel/federalBusinessDay';
import { isCongressGovSource } from '@/lib/feeds/intelSourcesAudit.display';
import type { IngestRunStatus } from '@/lib/intel/types';

export type SourceHealth = 'healthy' | 'stale' | 'failing' | 'disabled' | 'unproven';

export type SourceStatusBucket =
  | 'enabled_healthy'
  | 'enabled_stale'
  | 'enabled_unproven'
  | 'enabled_failing'
  | 'enabled_blocked'
  | 'enabled_misconfigured'
  | 'enabled_quarantined'
  | 'enabled_parser_mismatch'
  | 'enabled_valid_empty'
  | 'enabled_not_publishing'
  | 'disabled_policy'
  | 'disabled_placeholder'
  | 'disabled_env_gated'
  | 'disabled_other'
  | 'needs_configuration';

const PUBLICATION_QUIET_MS = 7 * 24 * 60 * 60 * 1000;

const PARSER_FAILURES = new Set([
  'parser_no_entries',
  'parser_normalization_failure',
  'feed_non_xml_body',
  'parse_error',
]);

export type AuditClassification = {
  health: SourceHealth;
  statusBucket: SourceStatusBucket;
  statusDetail: string | null;
  healthReason: string | null;
};

function metaString(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metaNumber(meta: Record<string, unknown> | null, key: string): number | null {
  const value = meta?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isValidEmptyRun(
  meta: Record<string, unknown> | null,
  errorMessage: string | null,
): boolean {
  if (metaString(meta, 'outcome') === 'valid_empty') return true;
  const sample = metaString(meta, 'bodySample') ?? '';
  if (sample.includes('pil_unavailability') || /"count"\s*:\s*0/.test(sample)) return true;
  const category = metaString(meta, 'failureCategory');
  const trimmed = sample.trim().toLowerCase();
  const xmlish = trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed');
  if (category === 'parser_no_entries' && xmlish && (metaNumber(meta, 'itemsParsed') ?? 0) === 0) return true;
  if (
    !category &&
    metaNumber(meta, 'httpStatus') === 200 &&
    /0 items/i.test(errorMessage || '') &&
    xmlish
  ) {
    return true;
  }
  return false;
}

export function isSuccessfulFetchRun(
  status: IngestRunStatus | null,
  meta: Record<string, unknown> | null,
): boolean {
  if (status === 'success') return true;
  if (isValidEmptyRun(meta, null)) return true;
  const http = metaNumber(meta, 'httpStatus');
  return http != null && http >= 200 && http < 400;
}

/** Older ingest runs used this error for a well-formed Federal Register list with no documents. */
export function isLegacyEmptyJsonRun(
  status: IngestRunStatus | null,
  meta: Record<string, unknown> | null,
  errorMessage: string | null,
): boolean {
  if (status !== 'partial') return false;
  if (!/JSON API parse returned 0 items/i.test(errorMessage || '')) return false;
  if (metaString(meta, 'failureCategory')) return false;
  return (metaNumber(meta, 'rawEntryCount') ?? 0) === 0;
}

export function isSuccessfulParseRun(
  status: IngestRunStatus | null,
  meta: Record<string, unknown> | null,
  errorMessage: string | null,
): boolean {
  if (status === 'success') return true;
  if (isValidEmptyRun(meta, errorMessage)) return true;
  return isLegacyEmptyJsonRun(status, meta, errorMessage);
}

function isOlderThan(iso: string | null, maxAgeMs: number, now: number): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > maxAgeMs;
}

function disabledClassification(input: {
  slug: string;
  manifestEnabled: boolean;
  registryEnabled: boolean;
  fetchKind: string;
  endpointUrl: string | null;
}): AuditClassification {
  if (input.manifestEnabled && !input.registryEnabled) {
    return {
      health: 'disabled',
      statusBucket: 'disabled_other',
      statusDetail: 'Registry not yet synced (run ingest)',
      healthReason: 'Registry out of date — manifest enables this source; run ingest to sync `sources.is_enabled`.',
    };
  }

  if (isCongressGovSource(input.slug)) {
    return {
      health: 'disabled',
      statusBucket: 'needs_configuration',
      statusDetail: 'Needs configuration: set CONGRESS_GOV_API_KEY, then run ingest. These primary records are not broken.',
      healthReason: 'Needs configuration: set CONGRESS_GOV_API_KEY, then run ingest. Not a broken feed.',
    };
  }

  const fetchKind = String(input.fetchKind || '');
  const policySlugs = new Set([
    'dvids-sandbox',
    'statements-public-import',
    'statements-rss-sandbox',
    'war-gov-releases',
    'usni-fleet-tracker',
    'af-mil-news',
    'army-mil-news',
    'centcom-press',
    'eucom-press',
    'forbidden-stories',
    'isw-feeds',
    'rappler',
    'mag-972',
    'indicator-pentagon-pizza',
    'uncovering-epstein-network',
    'robert-reich',
    'g-elliott-morris',
    'on-offense-kris-goldsmith',
    'total-hypocrisy',
  ]);

  if (input.slug === 'reuters-wire') {
    return {
      health: 'disabled',
      statusBucket: 'disabled_env_gated',
      statusDetail: 'INTEL_REUTERS_RSS_URL not set',
      healthReason: 'Env-gated: INTEL_REUTERS_RSS_URL not set.',
    };
  }
  if (input.slug === 'ap-wire') {
    return {
      health: 'disabled',
      statusBucket: 'disabled_env_gated',
      statusDetail: 'INTEL_AP_RSS_URL not set',
      healthReason: 'Env-gated: INTEL_AP_RSS_URL not set.',
    };
  }
  if (policySlugs.has(input.slug) || fetchKind === 'manual') {
    return {
      health: 'disabled',
      statusBucket: 'disabled_policy',
      statusDetail: 'Policy/quarantine: not auto-ingested',
      healthReason: 'Disabled in manifest (`isEnabled: false`); not ingested.',
    };
  }
  if (!input.endpointUrl || fetchKind === 'unsupported') {
    return {
      health: 'disabled',
      statusBucket: 'disabled_placeholder',
      statusDetail: 'Placeholder/not wired',
      healthReason: 'Placeholder/not wired (no endpoint URL).',
    };
  }
  return {
    health: 'disabled',
    statusBucket: 'disabled_other',
    statusDetail: 'Disabled in manifest',
    healthReason: 'Disabled in manifest (`isEnabled: false`); not ingested.',
  };
}

export function classifyIntelSourceAudit(input: {
  slug: string;
  manifestEnabled: boolean;
  registryEnabled: boolean;
  fetchKind: string;
  endpointUrl: string | null;
  isCoreSource: boolean;
  staleThresholdMinutes: number;
  lastRunStatus: IngestRunStatus | null;
  lastRunFinishedAt: string | null;
  lastRunError: string | null;
  lastRunMeta: Record<string, unknown> | null;
  lastSuccessAt: string | null;
  lastFetchAt: string | null;
  newestPublishedAt: string | null;
  itemTotal: number;
  items7d: number;
  now?: Date;
}): AuditClassification {
  if (!input.registryEnabled || !input.manifestEnabled) {
    return disabledClassification(input);
  }

  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const staleMs = input.staleThresholdMinutes * 60 * 1000;
  const meta = input.lastRunMeta;
  const category = metaString(meta, 'failureCategory') ?? '';
  const outcome = metaString(meta, 'outcome');
  const validEmpty =
    outcome === 'valid_empty' ||
    isValidEmptyRun(meta, input.lastRunError) ||
    isLegacyEmptyJsonRun(input.lastRunStatus, meta, input.lastRunError);
  const parserFailure =
    !validEmpty &&
    (PARSER_FAILURES.has(category) ||
      (input.lastRunStatus === 'partial' && /0 items|no valid entries|markup/i.test(input.lastRunError || '')));

  if (parserFailure) {
    const normalization = category === 'parser_normalization_failure';
    return {
      health: 'failing',
      statusBucket: 'enabled_parser_mismatch',
      statusDetail: normalization
        ? 'Parser or normalization failure: entries were present but none became items.'
        : category === 'feed_non_xml_body'
          ? 'Parser failure: the response was not a feed (HTML or other non-XML body).'
          : 'Parser or normalization failure.',
      healthReason: input.lastRunError
        ? `Parser or normalization failure: ${input.lastRunError}`
        : 'Parser or normalization failure.',
    };
  }

  if (input.lastRunStatus === 'failed' || category === 'http_403' || category.startsWith('http_')) {
    if (category === 'http_403') {
      return {
        health: 'failing',
        statusBucket: 'enabled_blocked',
        statusDetail: 'Access restriction (HTTP 403). The publisher blocked the ingest client.',
        healthReason: input.lastRunError ? `Access restriction: ${input.lastRunError}` : 'Access restriction (HTTP 403).',
      };
    }
    if (category === 'http_404') {
      return {
        health: 'failing',
        statusBucket: 'enabled_misconfigured',
        statusDetail: 'Endpoint not found (HTTP 404)',
        healthReason: input.lastRunError ? `Upstream HTTP failure: ${input.lastRunError}` : 'Upstream HTTP failure (404).',
      };
    }
    if (category === 'redirect_loop' || category === 'redirect_count_exceeded') {
      return {
        health: 'failing',
        statusBucket: 'enabled_quarantined',
        statusDetail: 'Redirect instability (loop / excessive redirects)',
        healthReason: input.lastRunError ? `Upstream fetch failure: ${input.lastRunError}` : 'Redirect instability.',
      };
    }
    if (input.lastRunStatus === 'failed' || category === 'http_5xx' || category === 'http_error' || category === 'fetch_error') {
      return {
        health: 'failing',
        statusBucket: 'enabled_failing',
        statusDetail: 'Upstream HTTP or fetch failure',
        healthReason: input.lastRunError ? `Upstream failure: ${input.lastRunError}` : 'Latest fetch failed.',
      };
    }
  }

  const fetchFresh = !isOlderThan(input.lastSuccessAt, staleMs, nowMs);
  if (!input.lastSuccessAt && input.itemTotal === 0 && !validEmpty) {
    return {
      health: 'unproven',
      statusBucket: 'enabled_unproven',
      statusDetail: null,
      healthReason: !input.lastRunFinishedAt ? 'No ingest runs recorded yet' : 'No successful ingest runs yet',
    };
  }

  if (!fetchFresh) {
    return {
      health: 'stale',
      statusBucket: 'enabled_stale',
      statusDetail: 'Latest successful fetch is outside the ingest freshness window.',
      healthReason: `Latest successful fetch is older than ${input.staleThresholdMinutes}m`,
    };
  }

  const piMessage = metaString(meta, 'piUnavailabilityMessage');
  const piClosed =
    input.slug === 'fr-public-inspection' && (Boolean(piMessage) || publicInspectionDeskClosed(now).closed);
  const publicationOld =
    input.newestPublishedAt != null && isOlderThan(input.newestPublishedAt, PUBLICATION_QUIET_MS, nowMs);
  const coreQuiet = input.isCoreSource && input.itemTotal > 0 && input.items7d === 0;
  const notPublishing = !validEmpty && (publicationOld || coreQuiet);

  if (validEmpty) {
    if (coreQuiet && !piClosed) {
      return {
        health: 'stale',
        statusBucket: 'enabled_not_publishing',
        statusDetail: 'Valid empty response, and this core source has no items from the last 7 days.',
        healthReason: 'Source not publishing recently (valid empty response; no items in the last 7d).',
      };
    }
    const closed = publicInspectionDeskClosed(now);
    const detail = piMessage
      ? `Valid empty response. ${piMessage}`
      : piClosed && closed.reason
        ? `Valid empty response. ${closed.reason}`
        : 'Valid empty response. The fetch succeeded and the publisher returned no entries.';
    return {
      health: 'healthy',
      statusBucket: 'enabled_valid_empty',
      statusDetail: detail,
      healthReason: detail,
    };
  }

  if (notPublishing) {
    const reason = publicationOld
      ? 'Source not publishing recently (newest article is older than 7d). The latest fetch succeeded.'
      : 'Source not publishing recently (0 items in the last 7d). The latest fetch succeeded.';
    return {
      health: 'stale',
      statusBucket: 'enabled_not_publishing',
      statusDetail: reason,
      healthReason: reason,
    };
  }

  return {
    health: 'healthy',
    statusBucket: 'enabled_healthy',
    statusDetail: null,
    healthReason: null,
  };
}
