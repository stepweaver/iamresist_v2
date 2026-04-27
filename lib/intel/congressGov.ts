import 'server-only';

import { applyContentUseModeToSummary, stripHtmlToText } from '@/lib/intel/contentUse';
import { hashNormalizedItem } from '@/lib/intel/hash';
import type { ContentUseMode, NormalizedItem, StateChangeType } from '@/lib/intel/types';

export const CONGRESS_GOV_API_BASE = 'https://api.congress.gov/v3';

export function congressGovApiKey(): string | null {
  if (typeof process === 'undefined') return null;
  const raw = process.env.CONGRESS_GOV_API_KEY;
  const key = typeof raw === 'string' ? raw.trim() : '';
  return key || null;
}

export function congressGovApiConfigured(): boolean {
  return Boolean(congressGovApiKey());
}

export function buildCongressGovApiUrl(endpointUrl: string, apiKey = congressGovApiKey()): string {
  if (!apiKey) {
    throw new Error('CONGRESS_GOV_API_KEY is not configured');
  }
  const u = new URL(endpointUrl);
  u.searchParams.set('api_key', apiKey);
  if (!u.searchParams.has('format')) u.searchParams.set('format', 'json');
  return u.toString();
}

type ParseCtx = {
  sourceSlug: string;
  provenanceClass: string;
  contentUseMode: ContentUseMode;
  fetchKind: 'congress_api';
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberField(obj: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function arrayField(obj: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value.map(asRecord).filter((v): v is Record<string, unknown> => Boolean(v));
    const rec = asRecord(value);
    if (rec) {
      const nested = rec.item ?? rec.items ?? rec.bill ?? rec.summary ?? rec.houseVote ?? rec.CRSreport;
      if (Array.isArray(nested)) return nested.map(asRecord).filter((v): v is Record<string, unknown> => Boolean(v));
    }
  }
  return [];
}

function firstArray(data: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const direct = data[key];
    if (Array.isArray(direct)) return direct.map(asRecord).filter((v): v is Record<string, unknown> => Boolean(v));
    const rec = asRecord(direct);
    if (rec) {
      const nested = arrayField(rec, 'item', 'items', 'bill', 'summary', 'houseVote', 'CRSreport');
      if (nested.length) return nested;
    }
  }
  return [];
}

function congressBillKey(congress: string | number | null, type: string | null, number: string | number | null): string | null {
  if (!congress || !type || !number) return null;
  return `${congress}-${String(type).toLowerCase()}-${number}`;
}

function itemUrlFromApiUrl(apiUrl: string | null): string | null {
  if (!apiUrl) return null;
  try {
    const u = new URL(apiUrl);
    u.searchParams.delete('api_key');
    u.searchParams.delete('format');
    return u.toString();
  } catch {
    return apiUrl;
  }
}

function makeItem(base: Omit<NormalizedItem, 'contentHash'>): NormalizedItem {
  return {
    ...base,
    contentHash: hashNormalizedItem(base),
  };
}

function consequenceTags(text: string): string[] {
  const tags: string[] = [];
  if (/\bwar\s+powers?\b|\bauthorization\s+for\s+use\s+of\s+military\s+force\b|\baumf\b/i.test(text)) {
    tags.push('war_powers', 'military_authorization');
  }
  if (/\bcivil\s+confinement\b|\binvoluntary\s+commitment\b|\binvoluntary\s+confinement\b/i.test(text)) {
    tags.push('civil_confinement');
  }
  if (/\bmental\s+health\b.*\b(detain|detention|commitment|confinement)\b/i.test(text)) {
    tags.push('mental_health_detention');
  }
  if (/\bimmigration\b.*\b(detain|detention|custody|facility)\b|\bice\b.*\b(detain|detention|facility)\b/i.test(text)) {
    tags.push('immigration_detention');
  }
  if (/\bdetention\s+(?:center|facility|bed|beds|infrastructure)\b|\bcarceral\s+infrastructure\b|\bprison\s+construction\b/i.test(text)) {
    tags.push('carceral_infrastructure');
  }
  if (/\bfisa\b|\bsection\s*702\b|\bsurveillance\b|\bprivacy\b|\bdata\s+broker\b|\bwiretap\b/i.test(text)) {
    tags.push('surveillance_privacy');
  }
  if (/\bdata\s+centers?\b.*\b(grid|water|electric|power|environment)\b|\b(grid|water)\b.*\bdata\s+centers?\b/i.test(text)) {
    tags.push('data_centers_grid_water', 'environmental_health');
  }
  if (/\bsexual\s+violence\b|\bsexual\s+assault\b|\bharassment\b.*\baccountability\b/i.test(text)) {
    tags.push('sexual_violence_accountability');
  }
  if (/\boversight\b|\binspector\s+general\b|\bsubpoena\b|\baccountability\b/i.test(text)) {
    tags.push('executive_oversight');
  }
  if (/\bcivil\s+liberties\b|\bfirst\s+amendment\b|\bfourth\s+amendment\b|\bdue\s+process\b/i.test(text)) {
    tags.push('civil_liberties');
  }
  if (/\belection\b|\bvoting\b|\ballot\b|\belectoral\b/i.test(text)) {
    tags.push('election_power');
  }
  if (/\bfederal\s+agency\b|\bagency\s+authority\b|\badministrative\s+power\b/i.test(text)) {
    tags.push('federal_agency_power');
  }
  return [...new Set(tags)];
}

function normalizeMeeting(row: Record<string, unknown>, ctx: ParseCtx): NormalizedItem | null {
  const eventId = stringField(row, 'eventId', 'eventID', 'event_id', 'id');
  const title = stringField(row, 'title', 'name') || 'Congress.gov committee meeting';
  const meetingType = stringField(row, 'type', 'meetingType') || '';
  const status = stringField(row, 'meetingStatus', 'status') || null;
  const chamber = stringField(row, 'chamber') || (ctx.sourceSlug.includes('senate') ? 'Senate' : 'House');
  const congress = stringField(row, 'congress') || null;
  const apiUrl = itemUrlFromApiUrl(stringField(row, 'url')) || `${CONGRESS_GOV_API_BASE}/committee-meeting/${congress ?? ''}/${String(chamber).toLowerCase()}/${eventId ?? ''}`;
  if (!eventId || !apiUrl) return null;

  const witnesses = arrayField(asRecord(row.witnesses) ?? row, 'witnesses').map((w) => ({
    name: stringField(w, 'name'),
    position: stringField(w, 'position'),
    organization: stringField(w, 'organization'),
  }));
  const witnessDocs = arrayField(asRecord(row.witnessDocuments) ?? row, 'witnessDocuments').map((d) => ({
    documentType: stringField(d, 'documentType'),
    format: stringField(d, 'format'),
    url: itemUrlFromApiUrl(stringField(d, 'url')),
  }));
  const meetingDocs = arrayField(asRecord(row.meetingDocuments) ?? row, 'meetingDocuments').map((d) => ({
    name: stringField(d, 'name'),
    documentType: stringField(d, 'documentType'),
    url: itemUrlFromApiUrl(stringField(d, 'url')),
  }));
  const relatedBills = arrayField(asRecord(asRecord(row.relatedItems)?.bills) ?? {}, 'bill').map((b) => ({
    congress: stringField(b, 'congress'),
    type: stringField(b, 'type'),
    number: stringField(b, 'number'),
  }));
  const hasWitnessStatements = witnessDocs.some((d) => /witness statement/i.test(String(d.documentType ?? '')));
  const hasWitnessList = meetingDocs.some((d) => /witness list/i.test(`${d.name ?? ''} ${d.documentType ?? ''}`));
  const stateChangeType: StateChangeType = /markup/i.test(meetingType)
    ? 'committee_markup'
    : hasWitnessStatements
      ? 'witness_statement_posted'
      : hasWitnessList || witnesses.length > 0
        ? 'witness_list_posted'
        : 'committee_meeting';
  const summaryParts = [
    status ? `Status: ${status}.` : '',
    meetingType ? `Type: ${meetingType}.` : '',
    witnesses.length ? `Witnesses: ${witnesses.map((w) => w.name).filter(Boolean).join(', ')}.` : '',
    hasWitnessStatements ? 'Witness documents posted.' : '',
  ].filter(Boolean);
  const text = `${title}\n${summaryParts.join(' ')}`;
  const billKey = relatedBills.map((b) => congressBillKey(b.congress, b.type, b.number)).find(Boolean) ?? null;
  return makeItem({
    externalId: `committee-meeting:${congress ?? 'unknown'}:${String(chamber).toLowerCase()}:${eventId}`,
    canonicalUrl: apiUrl,
    title,
    summary: applyContentUseModeToSummary(summaryParts.join(' ') || null, ctx.contentUseMode),
    publishedAt: parseDate(row.date) || parseDate(row.updateDate) || null,
    imageUrl: null,
    structured: {
      fetchKind: ctx.fetchKind,
      congress_source: ctx.sourceSlug,
      eventId,
      congress,
      chamber,
      meetingType,
      meetingStatus: status,
      witnesses,
      witnessDocuments: witnessDocs,
      meetingDocuments: meetingDocs,
      relatedBills,
      public_consequence_tags: consequenceTags(text),
    },
    clusterKeys: {
      committee_meeting: `${congress ?? 'unknown'}-${String(chamber).toLowerCase()}-${eventId}`,
      ...(billKey ? { bill: billKey } : {}),
    },
    stateChangeType,
  });
}

function normalizeBill(row: Record<string, unknown>, ctx: ParseCtx): NormalizedItem | null {
  const congress = stringField(row, 'congress');
  const type = stringField(row, 'type');
  const number = stringField(row, 'number');
  const billKey = congressBillKey(congress, type, number);
  const title = stringField(row, 'title') || (billKey ? `${type}.${number}` : 'Congress.gov bill update');
  const apiUrl = itemUrlFromApiUrl(stringField(row, 'url'));
  if (!billKey || !apiUrl) return null;
  const latestAction = asRecord(row.latestAction);
  const latestActionText = stringField(latestAction, 'text') || null;
  const updateIncludingText = stringField(row, 'updateDateIncludingText');
  const updateDate = stringField(row, 'updateDate');
  const textChanged = Boolean(updateIncludingText && updateIncludingText !== updateDate);
  const actionLower = String(latestActionText ?? '').toLowerCase();
  const stateChangeType: StateChangeType = textChanged ? 'bill_text_updated' : latestActionText ? 'bill_action' : 'legislative_feed_item';
  const summary = [latestActionText, textChanged ? 'Bill text updated.' : ''].filter(Boolean).join(' ');
  return makeItem({
    externalId: `bill:${billKey}`,
    canonicalUrl: apiUrl,
    title,
    summary: applyContentUseModeToSummary(summary || null, ctx.contentUseMode),
    publishedAt: parseDate(updateIncludingText) || parseDate(updateDate) || parseDate(latestAction?.actionDate) || null,
    imageUrl: null,
    structured: {
      fetchKind: ctx.fetchKind,
      congress_source: ctx.sourceSlug,
      congress,
      billType: type,
      billNumber: number,
      latestActionText,
      updateDate,
      updateDateIncludingText: updateIncludingText,
      textChanged,
      public_consequence_tags: consequenceTags(`${title}\n${summary}`),
    },
    clusterKeys: { bill: billKey },
    stateChangeType: actionLower.includes('referred') || actionLower.includes('reported') ? 'bill_action' : stateChangeType,
  });
}

function normalizeSummary(row: Record<string, unknown>, ctx: ParseCtx): NormalizedItem | null {
  const congress = stringField(row, 'congress');
  const type = stringField(row, 'type', 'billType');
  const number = stringField(row, 'number', 'billNumber');
  const billKey = congressBillKey(congress, type, number);
  const actionDesc = stringField(row, 'actionDesc') || 'Bill summary';
  const summaryText = stripHtmlToText(stringField(row, 'text', 'summary') || '');
  const title = billKey ? `CRS summary for ${String(type).toUpperCase()}.${number}: ${actionDesc}` : `CRS bill summary: ${actionDesc}`;
  const apiUrl = itemUrlFromApiUrl(stringField(row, 'url')) || (billKey ? `${CONGRESS_GOV_API_BASE}/bill/${congress}/${String(type).toLowerCase()}/${number}/summaries` : null);
  if (!billKey || !apiUrl) return null;
  return makeItem({
    externalId: `bill-summary:${billKey}:${stringField(row, 'versionCode') ?? actionDesc}`,
    canonicalUrl: apiUrl,
    title,
    summary: applyContentUseModeToSummary(summaryText || null, ctx.contentUseMode),
    publishedAt: parseDate(row.updateDate) || parseDate(row.actionDate) || null,
    imageUrl: null,
    structured: {
      fetchKind: ctx.fetchKind,
      congress_source: ctx.sourceSlug,
      congress,
      billType: type,
      billNumber: number,
      actionDesc,
      versionCode: stringField(row, 'versionCode'),
      public_consequence_tags: consequenceTags(`${title}\n${summaryText}`),
    },
    clusterKeys: { bill: billKey },
    stateChangeType: 'bill_summary',
  });
}

function normalizeHouseVote(row: Record<string, unknown>, ctx: ParseCtx): NormalizedItem | null {
  const congress = stringField(row, 'congress');
  const rollNumber = stringField(row, 'rollNumber', 'rollCallNumber', 'number');
  const sessionNumber = stringField(row, 'sessionNumber', 'session');
  const voteQuestion = stringField(row, 'voteQuestion', 'question', 'description') || 'House roll-call vote';
  const result = stringField(row, 'result') || null;
  const apiUrl = itemUrlFromApiUrl(stringField(row, 'url')) || `${CONGRESS_GOV_API_BASE}/house-vote/${congress ?? ''}/${sessionNumber ?? ''}/${rollNumber ?? ''}`;
  if (!rollNumber || !apiUrl) return null;
  const title = result ? `House roll-call vote ${rollNumber}: ${voteQuestion} (${result})` : `House roll-call vote ${rollNumber}: ${voteQuestion}`;
  return makeItem({
    externalId: `house-vote:${congress ?? 'unknown'}:${sessionNumber ?? 'unknown'}:${rollNumber}`,
    canonicalUrl: apiUrl,
    title,
    summary: applyContentUseModeToSummary(result ? `Result: ${result}.` : null, ctx.contentUseMode),
    publishedAt: parseDate(row.date) || parseDate(row.updateDate) || null,
    imageUrl: null,
    structured: {
      fetchKind: ctx.fetchKind,
      congress_source: ctx.sourceSlug,
      congress,
      rollNumber,
      sessionNumber,
      result,
      public_consequence_tags: consequenceTags(title),
    },
    clusterKeys: {
      house_vote: `${congress ?? 'unknown'}-${sessionNumber ?? 'unknown'}-${rollNumber}`,
    },
    stateChangeType: 'house_roll_call_vote',
  });
}

function normalizeCrsReport(row: Record<string, unknown>, ctx: ParseCtx): NormalizedItem | null {
  const id = stringField(row, 'id', 'number');
  const title = stringField(row, 'title') || 'CRS report';
  const apiUrl = itemUrlFromApiUrl(stringField(row, 'url'));
  if (!id || !apiUrl) return null;
  const summary = stripHtmlToText(stringField(row, 'summary') || '');
  const related = arrayField(asRecord(row.relatedMaterials) ?? row, 'relatedMaterials').map((r) => ({
    congress: stringField(r, 'congress'),
    type: stringField(r, 'type'),
    number: stringField(r, 'number'),
    title: stringField(r, 'title'),
  }));
  const billKey = related.map((r) => congressBillKey(r.congress, r.type, r.number)).find(Boolean) ?? null;
  return makeItem({
    externalId: `crs-report:${id}`,
    canonicalUrl: apiUrl,
    title: `CRS report: ${title}`,
    summary: applyContentUseModeToSummary(summary || null, ctx.contentUseMode),
    publishedAt: parseDate(row.updateDate) || parseDate(row.publishDate) || null,
    imageUrl: null,
    structured: {
      fetchKind: ctx.fetchKind,
      congress_source: ctx.sourceSlug,
      crsId: id,
      status: stringField(row, 'status'),
      contentType: stringField(row, 'contentType'),
      relatedMaterials: related,
      public_consequence_tags: consequenceTags(`${title}\n${summary}`),
    },
    clusterKeys: {
      crs_report: id,
      ...(billKey ? { bill: billKey } : {}),
    },
    stateChangeType: 'crs_report',
  });
}

export function parseCongressGovJson(jsonText: string, ctx: ParseCtx): NormalizedItem[] {
  const data = JSON.parse(jsonText) as Record<string, unknown>;
  let rows: Record<string, unknown>[] = [];
  let normalizer: (row: Record<string, unknown>, ctx: ParseCtx) => NormalizedItem | null = normalizeBill;

  if (ctx.sourceSlug.includes('committee-meetings')) {
    rows = firstArray(data, 'committeeMeetings', 'committeeMeeting');
    normalizer = normalizeMeeting;
  } else if (ctx.sourceSlug === 'congress-summaries') {
    rows = firstArray(data, 'summaries', 'summary');
    normalizer = normalizeSummary;
  } else if (ctx.sourceSlug === 'congress-house-votes') {
    rows = firstArray(data, 'houseRollCallVotes', 'houseVotes', 'houseVote', 'votes');
    normalizer = normalizeHouseVote;
  } else if (ctx.sourceSlug === 'congress-crs-reports') {
    rows = firstArray(data, 'CRSreports', 'crsReports', 'CRSreport');
    normalizer = normalizeCrsReport;
  } else {
    rows = firstArray(data, 'bills', 'bill');
    normalizer = normalizeBill;
  }

  return rows.map((row) => normalizer(row, ctx)).filter((item): item is NormalizedItem => Boolean(item));
}

export function currentCongressNumber(now = new Date()): number {
  const year = now.getUTCFullYear();
  return Math.floor((year - 1789) / 2) + 1;
}

export function congressGovEndpoint(path: string, params: Record<string, string | number | boolean | null | undefined> = {}): string {
  const u = new URL(`${CONGRESS_GOV_API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    u.searchParams.set(key, String(value));
  }
  u.searchParams.set('format', 'json');
  return u.toString();
}
