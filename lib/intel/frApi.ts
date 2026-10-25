import 'server-only';

import { extractFrClusterKeys } from '@/lib/intel/clusterKeys';
import { hashNormalizedItem } from '@/lib/intel/hash';
import type { FederalRegisterDoc, NormalizedItem, StateChangeType } from '@/lib/intel/types';

export type FederalRegisterInspection = {
  items: NormalizedItem[];
  /** Documents in the payload before normalization. */
  rawEntryCount: number;
  /** Documents that became ingest items before any per-run cap. */
  normalizedCount: number;
  outcome: 'items' | 'valid_empty' | 'normalization_failure';
  detail: string | null;
  unavailabilityMessage: string | null;
};

function parseFrDate(d: string | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

function documentNumber(doc: FederalRegisterDoc): string | null {
  const explicit = typeof doc.document_number === 'string' ? doc.document_number.trim() : '';
  if (explicit) return explicit;
  for (const raw of [doc.html_url, doc.pdf_url, doc.public_inspection_pdf_url]) {
    const match = String(raw || '').match(/(\d{4}-\d{3,})/);
    if (match) return match[1];
  }
  return null;
}

function documentUrl(doc: FederalRegisterDoc): string | null {
  for (const raw of [doc.html_url, doc.pdf_url, doc.public_inspection_pdf_url]) {
    if (typeof raw === 'string' && /^https?:\/\//i.test(raw.trim())) return raw.trim();
  }
  return null;
}

function normalizeFrDoc(
  doc: FederalRegisterDoc,
  stateChangeType: StateChangeType,
): NormalizedItem | null {
  const url = documentUrl(doc);
  const documentNumberValue = documentNumber(doc);
  if (!url || !documentNumberValue) return null;

  const title = (doc.title || '').trim() || 'Federal Register document';
  const summary = doc.abstract ? String(doc.abstract).slice(0, 4000) : null;
  const publishedAt =
    stateChangeType === 'pre_publication'
      ? parseFrDate(doc.filed_at) || parseFrDate(doc.publication_date) || null
      : parseFrDate(doc.publication_date) || parseFrDate(doc.filed_at) || null;

  const clusterKeys = extractFrClusterKeys(documentNumberValue);

  const base = {
    externalId: documentNumberValue,
    canonicalUrl: url,
    title,
    summary,
    publishedAt,
    imageUrl: null as string | null,
    structured: {
      fr_type: doc.type ?? null,
      document_number: documentNumberValue,
    },
    clusterKeys,
    stateChangeType,
  };

  return {
    ...base,
    contentHash: hashNormalizedItem(base),
  };
}

function unavailabilityMessage(data: Record<string, unknown>): string | null {
  const meta = data.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const message = (meta as Record<string, unknown>).pil_unavailability_message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

/**
 * Throws on invalid JSON so ingest can mark the run failed honestly.
 * A well-formed empty list, including the overnight Public Inspection
 * unavailability payload, is `valid_empty` rather than a parser failure.
 */
export function inspectFederalRegisterJson(
  jsonText: string,
  stateChangeType: StateChangeType,
): FederalRegisterInspection {
  const data = JSON.parse(jsonText) as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Federal Register JSON was not an object');
  }
  const record = data as Record<string, unknown>;
  const message = unavailabilityMessage(record);
  const results = record.results;

  if (results == null) {
    const count = typeof record.count === 'number' ? record.count : 0;
    if (count === 0 || message) {
      return {
        items: [],
        rawEntryCount: 0,
        normalizedCount: 0,
        outcome: 'valid_empty',
        detail: message,
        unavailabilityMessage: message,
      };
    }
    throw new Error('Federal Register JSON missing results');
  }
  if (!Array.isArray(results)) throw new Error('Federal Register results was not an array');

  const docs = results.filter(
    (row): row is FederalRegisterDoc => Boolean(row) && typeof row === 'object' && !Array.isArray(row),
  );
  const items = docs
    .map((doc) => normalizeFrDoc(doc, stateChangeType))
    .filter((item): item is NormalizedItem => item != null);

  if (docs.length === 0) {
    return {
      items: [],
      rawEntryCount: 0,
      normalizedCount: 0,
      outcome: 'valid_empty',
      detail: message,
      unavailabilityMessage: message,
    };
  }
  if (items.length === 0) {
    return {
      items: [],
      rawEntryCount: docs.length,
      normalizedCount: 0,
      outcome: 'normalization_failure',
      detail: 'Federal Register documents were present but none had a usable URL and document number.',
      unavailabilityMessage: message,
    };
  }
  return {
    items,
    rawEntryCount: docs.length,
    normalizedCount: items.length,
    outcome: 'items',
    detail: null,
    unavailabilityMessage: message,
  };
}

/** Throws on invalid JSON so ingest can mark the run failed / partial honestly. */
export function parseFederalRegisterPublishedJson(jsonText: string): NormalizedItem[] {
  return inspectFederalRegisterJson(jsonText, 'published_document').items;
}

export function parseFederalRegisterPiJson(jsonText: string): NormalizedItem[] {
  return inspectFederalRegisterJson(jsonText, 'pre_publication').items;
}
