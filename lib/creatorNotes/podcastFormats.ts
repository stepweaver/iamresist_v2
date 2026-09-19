import { normalizeWhitespace } from '@/lib/creatorNotes/identity';
import {
  normalizeCaptionCues,
  type CaptionCue,
} from '@/lib/creatorNotes/normalizeCaptions';
import type { CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

function optionalFinite(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseTimestampToSeconds(raw: string | null | undefined): number | null {
  const value = String(raw || '').trim().replace(',', '.');
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return nums[0] * 60 + nums[1];
}

export function stripCueFormatting(text: string): string {
  let out = String(text || '');
  out = out.replace(/<br\s*\/?>/gi, ' ');
  out = out.replace(/<\/?v[^>]*>/gi, ' ');
  out = out.replace(/<[^>]+>/g, ' ');
  out = out.replace(/&nbsp;/gi, ' ');
  out = out.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return normalizeWhitespace(out);
}

function pushCue(cues: CaptionCue[], start: number | null, end: number | null, text: string) {
  const cleaned = stripCueFormatting(text);
  if (!cleaned) return;
  cues.push({
    startSeconds: optionalFinite(start),
    endSeconds: optionalFinite(end),
    text: cleaned,
  });
}

export function parseVttTranscript(payload: string): CaptionCue[] {
  const text = String(payload || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const cues: CaptionCue[] = [];
  let i = 0;
  if (/^WEBVTT/i.test(lines[0] || '')) i = 1;

  while (i < lines.length) {
    const line = lines[i].trim();
    i += 1;
    if (!line || /^NOTE\b/i.test(line) || /^STYLE\b/i.test(line) || /^REGION\b/i.test(line)) {
      if (/^NOTE\b/i.test(line) || /^STYLE\b/i.test(line) || /^REGION\b/i.test(line)) {
        while (i < lines.length && lines[i].trim()) i += 1;
      }
      continue;
    }
    let timing = line;
    if (!/-->/.test(timing) && i < lines.length && /-->/.test(lines[i])) {
      timing = lines[i].trim();
      i += 1;
    }
    const ts = timing.match(/([0-9:.]+)\s*-->\s*([0-9:.]+)/);
    if (!ts) continue;
    const start = parseTimestampToSeconds(ts[1]);
    const end = parseTimestampToSeconds(ts[2]);
    const body: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      body.push(lines[i]);
      i += 1;
    }
    pushCue(cues, start, end, body.join(' '));
  }
  return cues;
}

export function parseSrtTranscript(payload: string): CaptionCue[] {
  const text = String(payload || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = text.split(/\n{2,}/);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trimEnd()).filter((line, index, all) => !(index === 0 && all.length > 1 && /^\d+$/.test(line.trim())));
    if (!lines.length) continue;
    const timingLine = lines[0];
    const ts = timingLine.match(/([0-9:,.]+)\s*-->\s*([0-9:,.]+)/);
    if (!ts) continue;
    pushCue(cues, parseTimestampToSeconds(ts[1]), parseTimestampToSeconds(ts[2]), lines.slice(1).join(' '));
  }
  return cues;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cueFromUnknown(value: unknown): CaptionCue | null {
  const row = asRecord(value);
  if (!row) return null;
  const text = stripCueFormatting(
    String(row.body ?? row.text ?? row.utterance ?? row.content ?? ''),
  );
  if (!text) return null;
  const start = optionalFinite(row.startTime ?? row.startSeconds ?? row.start_seconds ?? row.start ?? row.begin);
  const end = optionalFinite(row.endTime ?? row.endSeconds ?? row.end_seconds ?? row.end);
  return { startSeconds: start, endSeconds: end, text };
}

export function parseJsonTranscript(payload: string): CaptionCue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('invalid json');
  }

  const cues: CaptionCue[] = [];
  const root = asRecord(parsed);
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(root?.segments)
      ? root?.segments
      : Array.isArray(root?.cues)
        ? root?.cues
        : Array.isArray(root?.results)
          ? root?.results
          : null;

  if (Array.isArray(rows)) {
    for (const row of rows) {
      const cue = cueFromUnknown(row);
      if (cue) cues.push(cue);
    }
    if (cues.length) return cues;
  }

  if (typeof root?.transcript === 'string') {
    return parsePlainTextTranscript(root.transcript);
  }

  throw new Error('unrecognized json transcript structure');
}

export function parsePlainTextTranscript(payload: string): CaptionCue[] {
  const text = String(payload || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/);
  const cues: CaptionCue[] = [];
  for (const paragraph of paragraphs) {
    const cleaned = stripCueFormatting(paragraph.replace(/\n/g, ' '));
    if (cleaned) cues.push({ startSeconds: null, endSeconds: null, text: cleaned });
  }
  return cues;
}

const TIMESTAMP_PREFIX = /^\(?(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\)?[-–—:]?\s+/;

export function parseHtmlTranscriptParagraphs(paragraphs: string[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const paragraph of paragraphs) {
    const cleaned = stripCueFormatting(paragraph);
    if (!cleaned) continue;
    const ts = cleaned.match(TIMESTAMP_PREFIX);
    if (ts) {
      const start = parseTimestampToSeconds(ts[1]);
      pushCue(cues, start, null, cleaned.slice(ts[0].length));
      continue;
    }
    cues.push({ startSeconds: null, endSeconds: null, text: cleaned });
  }
  return cues;
}

export function sniffTranscriptKind(
  payload: string,
  mimeType: string | null,
  url: string | null,
): 'vtt' | 'srt' | 'json' | 'plain' | 'html' | 'unknown' {
  const mime = String(mimeType || '').toLowerCase();
  const href = String(url || '').toLowerCase();
  const trimmed = String(payload || '').trim();
  const lower = trimmed.toLowerCase();
  if (mime.includes('pdf') || mime.includes('zip') || lower.startsWith('%pdf')) return 'unknown';
  if (mime === 'text/vtt' || href.endsWith('.vtt') || /^WEBVTT/i.test(trimmed)) {
    if (trimmed && !/^WEBVTT/i.test(trimmed) && !trimmed.includes('-->')) return 'unknown';
    return 'vtt';
  }
  if (
    mime === 'application/x-subrip' ||
    mime === 'application/srt' ||
    mime === 'text/srt' ||
    href.endsWith('.srt') ||
    /^\d+\s*\n\s*\d{1,2}:\d{2}/.test(trimmed)
  ) {
    return 'srt';
  }
  if (mime === 'application/json' || mime === 'text/json' || href.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  if (mime === 'text/html' || mime === 'application/xhtml+xml' || trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
    return 'html';
  }
  if (mime.includes('pdf') || mime.includes('zip') || mime.includes('octet-stream') || trimmed.startsWith('%pdf')) {
    return 'unknown';
  }
  if (mime === 'text/plain' || href.endsWith('.txt')) return 'plain';
  if (trimmed.includes('-->')) return /WEBVTT/i.test(trimmed) ? 'vtt' : 'srt';
  if (trimmed) return 'plain';
  return 'unknown';
}

export function cuesFromTranscriptPayload(input: {
  payload: string;
  mimeType: string | null;
  url: string | null;
  allowHtml?: boolean;
}): { kind: ReturnType<typeof sniffTranscriptKind>; cues: CaptionCue[] } {
  const kind = sniffTranscriptKind(input.payload, input.mimeType, input.url);
  if (kind === 'vtt') return { kind, cues: parseVttTranscript(input.payload) };
  if (kind === 'srt') return { kind, cues: parseSrtTranscript(input.payload) };
  if (kind === 'json') return { kind, cues: parseJsonTranscript(input.payload) };
  if (kind === 'plain') return { kind, cues: parsePlainTextTranscript(input.payload) };
  if (kind === 'html') {
    if (!input.allowHtml) throw new Error('html transcript requires an official adapter');
    return { kind, cues: [] };
  }
  throw new Error(`unsupported transcript format: ${kind}`);
}

export function normalizeTranscriptCues(cues: CaptionCue[]): CreatorTranscriptSegment[] {
  return normalizeCaptionCues(cues);
}
