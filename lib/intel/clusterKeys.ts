/**
 * Deterministic cluster keys only — no fuzzy matching (Milestone 1).
 * Keys are stored on source_items.cluster_keys (JSON); no events table yet.
 */

const BILLS_PATH_RE = /\/details\/BILLS-(\d+)([a-z]+)(\d+)/i;
const EO_TITLE_RE = /executive\s+order\s+(\d+)/i;
const PROC_TITLE_RE = /proclamation\s+(\d+)/i;

export type ParsedBillKey = { congress: string; type: string; number: string };

export function parseBillFromUrl(url: string): ParsedBillKey | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(BILLS_PATH_RE);
    if (!m) return null;
    return { congress: m[1], type: m[2].toLowerCase(), number: m[3] };
  } catch {
    const m = url.match(BILLS_PATH_RE);
    if (!m) return null;
    return { congress: m[1], type: m[2].toLowerCase(), number: m[3] };
  }
}

export function billCanonicalKey(parsed: ParsedBillKey): string {
  return `${parsed.congress}-${parsed.type}-${parsed.number}`;
}

export function extractBillClusterKeys(url: string): Record<string, string> {
  const p = parseBillFromUrl(url);
  if (!p) return {};
  return { bill: billCanonicalKey(p) };
}

export function extractFrClusterKeys(documentNumber: string | undefined): Record<string, string> {
  if (!documentNumber || typeof documentNumber !== 'string') return {};
  const n = documentNumber.trim();
  if (!n) return {};
  return { fr_document_number: n };
}

export function extractExecutiveClusterKeys(title: string): Record<string, string> {
  if (!title || typeof title !== 'string') return {};
  const eo = title.match(EO_TITLE_RE);
  if (eo?.[1]) return { executive_order: eo[1] };
  const pr = title.match(PROC_TITLE_RE);
  if (pr?.[1]) return { proclamation: pr[1] };
  return {};
}

export function mergeClusterParts(
  ...parts: Array<Record<string, string>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) {
      if (v) out[k] = v;
    }
  }
  return out;
}
