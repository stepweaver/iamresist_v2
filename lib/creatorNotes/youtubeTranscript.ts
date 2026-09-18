import { decodeIntelPlainText } from '@/lib/intel/contentUse';
import {
  captionRequestFailedError,
  emptyNormalizedTranscriptError,
  emptyTranscriptError,
  noCaptionTracksError,
} from '@/lib/creatorNotes/errors';
import { transcriptCharCount } from '@/lib/creatorNotes/identity';
import {
  durationCoveredSeconds,
  normalizeCaptionCues,
  type CaptionCue,
} from '@/lib/creatorNotes/normalizeCaptions';
import type {
  CreatorTranscriptInput,
  ResolvedCreatorSource,
  TranscriptAcquisitionDiagnostics,
  TranscriptGeneratedFlag,
} from '@/lib/creatorNotes/types';
import { requireYouTubeVideoId } from '@/lib/creatorNotes/youtubeIdentity';

const WATCH_TIMEOUT_MS = 20000;
const CAPTION_TIMEOUT_MS = 20000;

const YOUTUBE_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Cookie: 'CONSENT=YES+1',
};

export type YoutubeHttpGet = (url: string, timeoutMs: number) => Promise<{ ok: boolean; status: number; text: string }>;

export type YoutubeTranscriptProviderDeps = {
  get?: YoutubeHttpGet;
  log?: (event: string, extra?: Record<string, unknown>) => void;
};

export interface FetchedCreatorTranscript {
  transcript: CreatorTranscriptInput;
  acquisition: TranscriptAcquisitionDiagnostics;
}

export interface YoutubeCaptionTrack {
  baseUrl: string;
  languageCode: string | null;
  kind: string | null;
  generated: boolean;
}

export interface TranscriptProvider {
  supports(source: ResolvedCreatorSource): boolean;
  fetchTranscript(source: ResolvedCreatorSource): Promise<FetchedCreatorTranscript>;
}

function logEvent(
  log: YoutubeTranscriptProviderDeps['log'],
  event: string,
  extra?: Record<string, unknown>,
) {
  if (log) {
    log(event, extra);
    return;
  }
  if (extra) console.info('[creator-notes-transcript]', event, extra);
  else console.info('[creator-notes-transcript]', event);
}

async function defaultGet(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ac.signal,
      headers: YOUTUBE_HEADERS,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function sliceJsonObject(source: string, start: number): string | null {
  if (source[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

export function extractYtInitialPlayerResponse(html: string): Record<string, unknown> | null {
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf('=', idx);
  if (eq < 0 || eq - idx > 80) return null;
  const start = html.indexOf('{', eq);
  if (start < 0) return null;
  const raw = sliceJsonObject(html, start);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function trackLanguage(track: Record<string, unknown>): string | null {
  const code = typeof track.languageCode === 'string' ? track.languageCode.trim() : '';
  return code || null;
}

function trackKind(track: Record<string, unknown>): string | null {
  const kind = typeof track.kind === 'string' ? track.kind.trim() : '';
  return kind || null;
}

export function parseCaptionTracks(player: Record<string, unknown> | null): YoutubeCaptionTrack[] {
  const captions = asRecord(player?.captions);
  const renderer = asRecord(captions?.playerCaptionsTracklistRenderer);
  const rawTracks = renderer?.captionTracks;
  if (!Array.isArray(rawTracks)) return [];

  const tracks: YoutubeCaptionTrack[] = [];
  for (const entry of rawTracks) {
    const track = asRecord(entry);
    if (!track) continue;
    const baseUrl = typeof track.baseUrl === 'string' ? track.baseUrl.trim() : '';
    if (!baseUrl) continue;
    const kind = trackKind(track);
    tracks.push({
      baseUrl,
      languageCode: trackLanguage(track),
      kind,
      generated: kind === 'asr',
    });
  }
  return tracks;
}

function isEnglishTrack(code: string | null): boolean {
  const lang = String(code || '').toLowerCase();
  return lang === 'en' || lang.startsWith('en-') || lang.startsWith('en_');
}

export function selectCaptionTrack(tracks: YoutubeCaptionTrack[]): YoutubeCaptionTrack | null {
  if (!tracks.length) return null;
  const ranked = [...tracks].sort((a, b) => {
    if (a.generated !== b.generated) return a.generated ? 1 : -1;
    const englishDiff = Number(isEnglishTrack(b.languageCode)) - Number(isEnglishTrack(a.languageCode));
    if (englishDiff !== 0) return englishDiff;
    const exactEnDiff =
      Number(String(b.languageCode || '').toLowerCase() === 'en') -
      Number(String(a.languageCode || '').toLowerCase() === 'en');
    return exactEnDiff;
  });
  return ranked[0] || null;
}

function generatedFlag(track: YoutubeCaptionTrack | null): TranscriptGeneratedFlag {
  if (!track) return 'unknown';
  return track.generated ? 'yes' : 'no';
}

function decodeCaptionText(raw: string): string {
  let text = String(raw || '');
  text = text.replace(/<br\s*\/?>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });
  text = text.replace(/&#(\d+);/g, (_, dec: string) => {
    const code = Number(dec);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });
  return decodeIntelPlainText(text);
}

function captionUrlWithFmt(baseUrl: string, fmt: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('fmt', fmt);
    return url.toString();
  } catch {
    const joiner = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${joiner}fmt=${fmt}`;
  }
}

export function parseJson3Captions(payload: string): CaptionCue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }
  const root = asRecord(parsed);
  const events = root?.events;
  if (!Array.isArray(events)) return [];

  const cues: CaptionCue[] = [];
  for (const event of events) {
    const row = asRecord(event);
    if (!row) continue;
    const segs = row.segs;
    if (!Array.isArray(segs)) continue;
    const parts: string[] = [];
    for (const seg of segs) {
      const rec = asRecord(seg);
      if (typeof rec?.utf8 === 'string') parts.push(rec.utf8);
    }
    const text = decodeCaptionText(parts.join(''));
    if (!text) continue;
    const startMs = typeof row.tStartMs === 'number' && Number.isFinite(row.tStartMs) ? row.tStartMs : null;
    const durMs = typeof row.dDurationMs === 'number' && Number.isFinite(row.dDurationMs) ? row.dDurationMs : null;
    const startSeconds = startMs == null ? null : startMs / 1000;
    const endSeconds = startSeconds == null || durMs == null ? null : startSeconds + durMs / 1000;
    cues.push({ startSeconds, endSeconds, text });
  }
  return cues;
}

export function parseXmlCaptions(payload: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null = re.exec(payload);
  while (match) {
    const attrs = match[1] || '';
    const startMatch = attrs.match(/\bstart="([^"]+)"/i);
    const durMatch = attrs.match(/\bdur="([^"]+)"/i);
    const startSeconds = startMatch ? Number(startMatch[1]) : null;
    const duration = durMatch ? Number(durMatch[1]) : null;
    const text = decodeCaptionText(match[2] || '');
    if (text) {
      cues.push({
        startSeconds: startSeconds != null && Number.isFinite(startSeconds) ? startSeconds : null,
        endSeconds:
          startSeconds != null && Number.isFinite(startSeconds) && duration != null && Number.isFinite(duration)
            ? startSeconds + duration
            : null,
        text,
      });
    }
    match = re.exec(payload);
  }
  return cues;
}

function parseCaptionPayload(payload: string): CaptionCue[] {
  const trimmed = String(payload || '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) {
    const jsonCues = parseJson3Captions(trimmed);
    if (jsonCues.length) return jsonCues;
  }
  return parseXmlCaptions(trimmed);
}

function transcriptFromSource(
  source: ResolvedCreatorSource,
  cues: CaptionCue[],
): CreatorTranscriptInput {
  const segments = normalizeCaptionCues(cues);
  if (!segments.length) throw emptyNormalizedTranscriptError();
  return {
    sourceItemId: source.sourceItemId,
    creatorId: source.creatorId,
    creatorName: source.creatorName,
    sourceTitle: source.title,
    sourceUrl: source.url,
    publishedAt: source.publishedAt,
    sourceIdentityKey: source.url,
    segments,
  };
}

export class YouTubeTranscriptProvider implements TranscriptProvider {
  private readonly get: YoutubeHttpGet;
  private readonly log: YoutubeTranscriptProviderDeps['log'];

  constructor(deps: YoutubeTranscriptProviderDeps = {}) {
    this.get = deps.get || defaultGet;
    this.log = deps.log;
  }

  supports(source: ResolvedCreatorSource): boolean {
    return source.provider === 'youtube';
  }

  async fetchTranscript(source: ResolvedCreatorSource): Promise<FetchedCreatorTranscript> {
    const videoId = requireYouTubeVideoId(source.url, source.externalId);
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    let watch: { ok: boolean; status: number; text: string };
    try {
      watch = await this.get(watchUrl, WATCH_TIMEOUT_MS);
    } catch {
      throw captionRequestFailedError();
    }
    if (!watch.ok) throw captionRequestFailedError();

    const player = extractYtInitialPlayerResponse(watch.text);
    if (!player) throw captionRequestFailedError();

    const tracks = parseCaptionTracks(player);
    if (!tracks.length) throw noCaptionTracksError();

    const selected = selectCaptionTrack(tracks);
    if (!selected) throw noCaptionTracksError();

    logEvent(this.log, 'caption track selected', {
      language: selected.languageCode,
      generated: selected.generated ? 'yes' : 'no',
    });

    const captionUrls = [captionUrlWithFmt(selected.baseUrl, 'json3'), selected.baseUrl];
    let cues: CaptionCue[] = [];
    let captionFailed = false;

    for (const captionUrl of captionUrls) {
      let res: { ok: boolean; status: number; text: string };
      try {
        res = await this.get(captionUrl, CAPTION_TIMEOUT_MS);
      } catch {
        captionFailed = true;
        continue;
      }
      if (!res.ok) {
        captionFailed = true;
        continue;
      }
      cues = parseCaptionPayload(res.text);
      if (cues.length) {
        captionFailed = false;
        break;
      }
    }

    if (!cues.length) {
      throw captionFailed ? captionRequestFailedError() : emptyTranscriptError();
    }

    const transcript = transcriptFromSource(source, cues);
    logEvent(this.log, 'transcript normalized', {
      rawSegments: cues.length,
      normalizedSegments: transcript.segments.length,
    });

    return {
      transcript,
      acquisition: {
        source: 'youtube-captions',
        language: selected.languageCode,
        generated: generatedFlag(selected),
        rawSegments: cues.length,
        normalizedSegments: transcript.segments.length,
        durationCoveredSeconds: durationCoveredSeconds(transcript.segments),
        characters: transcriptCharCount(transcript.segments),
      },
    };
  }
}
