import 'server-only';

import { extractFrClusterKeys } from '@/lib/intel/clusterKeys';
import { hashNormalizedItem } from '@/lib/intel/hash';
import type { FederalRegisterDoc, NormalizedItem, StateChangeType } from '@/lib/intel/types';

type FrResults = { results?: FederalRegisterDoc[] };

function parseFrDate(d: string | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

function normalizeFrDoc(
  doc: FederalRegisterDoc,
  stateChangeType: StateChangeType,
): NormalizedItem | null {
  const url = doc.html_url;
  const documentNumber = doc.document_number;
  if (!url || !documentNumber) return null;

  const title = (doc.title || '').trim() || 'Federal Register document';
  const summary = doc.abstract ? String(doc.abstract).slice(0, 4000) : null;
  const publishedAt =
    stateChangeType === 'pre_publication'
      ? parseFrDate(doc.filed_at) || parseFrDate(doc.publication_date) || null
      : parseFrDate(doc.publication_date) || parseFrDate(doc.filed_at) || null;

  const clusterKeys = extractFrClusterKeys(documentNumber);

  const base = {
    externalId: documentNumber,
    canonicalUrl: url,
    title,
    summary,
    publishedAt,
    imageUrl: null as string | null,
    structured: {
      fr_type: doc.type ?? null,
      document_number: documentNumber,
    },
    clusterKeys,
    stateChangeType,
  };

  return {
    ...base,
    contentHash: hashNormalizedItem(base),
  };
}

/** Throws on invalid JSON so ingest can mark the run failed / partial honestly. */
export function parseFederalRegisterPublishedJson(jsonText: string): NormalizedItem[] {
  const data = JSON.parse(jsonText) as FrResults;
  const results = data.results ?? [];
  return results
    .map((d) => normalizeFrDoc(d, 'published_document'))
    .filter((x): x is NormalizedItem => x != null);
}

export function parseFederalRegisterPiJson(jsonText: string): NormalizedItem[] {
  const data = JSON.parse(jsonText) as FrResults;
  const results = data.results ?? [];
  return results
    .map((d) => normalizeFrDoc(d, 'pre_publication'))
    .filter((x): x is NormalizedItem => x != null);
}
