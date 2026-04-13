import type { ProvenanceClass } from '@/lib/intel/types';

/**
 * Rule templates only — no LLM. Uses provenance + state_change_type + cluster_keys.
 */
export function whyItMattersStub(
  provenanceClass: ProvenanceClass,
  stateChangeType: string,
  clusterKeys: Record<string, string>,
): string {
  if (clusterKeys.fr_document_number) {
    return stateChangeType === 'pre_publication'
      ? 'Official Federal Register filing (public inspection) — watch for final publication and effective dates.'
      : 'Published Federal Register document — primary regulatory / executive-branch text.';
  }
  if (clusterKeys.bill) {
    return 'Legislative vehicle on GovInfo — follow committee, floor, and enrollment.';
  }
  if (clusterKeys.executive_order || clusterKeys.proclamation) {
    return 'Presidential instrument — track implementation, agency guidance, and court challenges.';
  }

  if (stateChangeType === 'congressional_record_feed_item') {
    return 'Congressional Record material — procedural and floor context (verify against official daily digest when needed).';
  }
  if (stateChangeType === 'press_statement') {
    return 'White House communications — compare with agency filings and wire verification.';
  }
  if (stateChangeType === 'commentary_item' || provenanceClass === 'COMMENTARY') {
    return 'Creator commentary — not a primary document; follow the canonical link to read or listen at the source.';
  }
  if (provenanceClass === 'WIRE') {
    return 'Wire-speed headline — use to sanity-check against primary documents.';
  }
  if (provenanceClass === 'SPECIALIST') {
    return 'Specialist interpretation — read alongside primary sources, not instead of them.';
  }
  if (provenanceClass === 'PRIMARY') {
    return 'Primary institutional signal — prioritize over commentary.';
  }

  return 'Institutional or wire signal — confirm details at the canonical link.';
}
