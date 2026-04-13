/**
 * Bump when deterministic relevance rules change materially; ingest/rescore stamp rows.
 * Pass to `source_item_surfacing_stats` RPC so /intel/sources can count rule-stale rows.
 */
export const INTEL_RELEVANCE_RULE_VERSION = '1.8';
