import { readFileSync } from 'node:fs';

import { normalizeWhitespace } from '@/lib/creatorNotes/identity';
import type { CreatorTranscriptInput, CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function optionalSeconds(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function parseSegment(value: unknown, index: number): CreatorTranscriptSegment {
  if (!isPlainObject(value)) {
    throw new Error(`transcript segment ${index} is not an object`);
  }
  const startSeconds = optionalSeconds(value.startSeconds ?? value.start_seconds);
  const endSeconds = optionalSeconds(value.endSeconds ?? value.end_seconds);
  if (typeof value.text !== 'string') {
    throw new Error(`transcript segment ${index} text is not a string`);
  }
  const text = normalizeWhitespace(value.text);
  if (!text) {
    throw new Error(`transcript segment ${index} text is empty`);
  }
  return { startSeconds, endSeconds, text };
}

export function parseTranscriptFilePayload(
  value: unknown,
  sourceItemId: string,
): CreatorTranscriptInput {
  if (!isPlainObject(value)) {
    throw new Error('transcript file must be a JSON object');
  }
  if (!Array.isArray(value.segments)) {
    throw new Error('transcript file must contain a segments array');
  }
  if (value.segments.length === 0) {
    throw new Error('transcript file segments array is empty');
  }

  const segments = value.segments.map((segment, index) => parseSegment(segment, index));
  return {
    sourceItemId: String(sourceItemId || '').trim(),
    creatorId: optionalString(value.creatorId ?? value.creator_id),
    creatorName: optionalString(value.creatorName ?? value.creator_name),
    sourceTitle: optionalString(value.sourceTitle ?? value.source_title ?? value.title),
    sourceUrl: optionalString(value.sourceUrl ?? value.source_url ?? value.url),
    publishedAt: optionalString(value.publishedAt ?? value.published_at),
    sourceIdentityKey: optionalString(value.sourceIdentityKey ?? value.source_identity_key),
    segments,
  };
}

export function loadTranscriptFile(path: string, sourceItemId: string): CreatorTranscriptInput {
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`transcript file is not valid JSON: ${path}`);
  }
  const input = parseTranscriptFilePayload(parsed, sourceItemId);
  if (!input.sourceItemId) {
    throw new Error('source item id is required');
  }
  return input;
}

export function mergeTranscriptMetadata(
  base: CreatorTranscriptInput,
  extra: Partial<CreatorTranscriptInput> | null | undefined,
): CreatorTranscriptInput {
  if (!extra) return base;
  return {
    ...base,
    creatorId: base.creatorId || extra.creatorId || null,
    creatorName: base.creatorName || extra.creatorName || null,
    sourceTitle: base.sourceTitle || extra.sourceTitle || null,
    sourceUrl: base.sourceUrl || extra.sourceUrl || null,
    publishedAt: base.publishedAt || extra.publishedAt || null,
    sourceIdentityKey: base.sourceIdentityKey || extra.sourceIdentityKey || null,
  };
}
