import type { LiveDeskItem } from '@/lib/intel/rank';

export type AccountabilityEventClass =
  | 'bill_introduced_or_filed'
  | 'executive_order_or_proclamation'
  | 'court_order_or_injunction'
  | 'oversight_subpoena_or_contempt'
  | 'hearing_or_deposition'
  | 'ethics_or_investigation'
  | 'public_claim'
  | 'other';

export type AccountabilityHighlight = {
  id: string;
  eventClass: AccountabilityEventClass;
  severity: number; // 0..100
  title: string;
  canonicalUrl: string;
  publishedAt: string | null;
  provenanceClass: string;
  sourceName: string;
  sourceSlug: string;
  explanations: string[];
};

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function h(title: string, summary: string | null): string {
  return `${title}\n${summary ?? ''}`.toLowerCase();
}

const RE_OVERSIGHT = /\b(subpoena|contempt|refus(?:ed|al)|ignored|stonewall|failure to appear|no[-\s]?show|did not appear|missed deposition|missed hearing)\b/i;
const RE_HEARING = /\b(hearing|deposition|testif(?:y|ies|ied)|appearance|committee)\b/i;
const RE_25A = /\b25th amendment\b|\b25th\s+amendment\b|\btwenty[-\s]?fifth\b/i;
const RE_COURT = /\b(injunction|temporary restraining order|\btro\b|stay|order|opinion)\b/i;
const RE_EO = /\bexecutive\s+order\b|\bproclamation\b/i;

/**
 * Deterministic, debuggable “accountability highlight” overlay.
 * This is intentionally conservative: it does not attempt entity extraction or fuzzy story merges.
 */
export function computeAccountabilityHighlights(
  items: LiveDeskItem[],
  opts?: { max?: number },
): AccountabilityHighlight[] {
  const max = clamp(opts?.max ?? 6, 1, 12);
  if (!Array.isArray(items) || items.length === 0) return [];

  const scored: AccountabilityHighlight[] = [];

  for (const it of items) {
    if (!it?.id || !it?.canonicalUrl || !it?.title) continue;
    if (it.surfaceState !== 'surfaced') continue;
    if (it.isDuplicateLoser) continue;

    const text = h(it.title, it.summary ?? null);
    const explanations: string[] = [];

    let eventClass: AccountabilityEventClass = 'other';
    let severity = 0;

    // Verified action primitives (based on deterministic cluster keys first)
    if (it.clusterKeys?.bill) {
      eventClass = 'bill_introduced_or_filed';
      severity = 62;
      explanations.push('Detected a legislative vehicle (GovInfo bill key).');
    } else if (it.clusterKeys?.executive_order || it.clusterKeys?.proclamation || RE_EO.test(text)) {
      eventClass = 'executive_order_or_proclamation';
      severity = 70;
      explanations.push('Detected an executive instrument (EO/proclamation).');
    } else if (it.clusterKeys?.fr_document_number) {
      eventClass = 'other';
      severity = 55;
      explanations.push('Detected a Federal Register document number.');
    }

    // Accountability escalation patterns (can override “other” and increase severity)
    if (RE_OVERSIGHT.test(text)) {
      eventClass = 'oversight_subpoena_or_contempt';
      severity = Math.max(severity, 86);
      explanations.push('Accountability escalation language (subpoena/contempt/refusal/missed appearance).');
    } else if (RE_HEARING.test(text)) {
      eventClass = 'hearing_or_deposition';
      severity = Math.max(severity, 78);
      explanations.push('Hearing/deposition/testimony pattern.');
    }

    if (RE_25A.test(text)) {
      severity = Math.max(severity, 82);
      explanations.push('25th Amendment pattern (constitutional accountability signal).');
    }

    if (RE_COURT.test(text)) {
      eventClass = 'court_order_or_injunction';
      severity = Math.max(severity, 80);
      explanations.push('Court-order / injunction pattern.');
    }

    if (it.deskLane === 'statements') {
      eventClass = 'public_claim';
      severity = Math.min(severity || 52, 68);
      explanations.push('Statements lane: claims-only posture (quarantined).');
    }

    // Incorporate existing displayPriority as a bounded tie-breaker (keeps overlay aligned with current desk intent).
    const dp = typeof (it as any).displayPriority === 'number' ? (it as any).displayPriority : 50;
    const weighted = clamp(severity + Math.round((dp - 50) * 0.2), 0, 100);
    if (weighted !== severity) {
      explanations.push('Minor alignment with existing display priority.');
    }
    severity = weighted;

    // Skip low-signal classifications.
    if (severity < 72) continue;

    scored.push({
      id: it.id,
      eventClass,
      severity,
      title: it.title,
      canonicalUrl: it.canonicalUrl,
      publishedAt: it.publishedAt ?? null,
      provenanceClass: it.provenanceClass,
      sourceName: it.sourceName,
      sourceSlug: it.sourceSlug,
      explanations: explanations.slice(0, 3),
    });
  }

  scored.sort((a, b) => b.severity - a.severity);

  // Dedupe by canonical URL to avoid repeats.
  const out: AccountabilityHighlight[] = [];
  const seen = new Set<string>();
  for (const x of scored) {
    if (out.length >= max) break;
    const key = x.canonicalUrl.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }

  return out;
}

