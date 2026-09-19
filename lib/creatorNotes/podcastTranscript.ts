import {
  acquisitionFromLocalTranscription,
  applyEpisodeIdentityToTranscript,
  asAudioTranscriptionResult,
  type AudioTranscriptionProvider,
} from '@/lib/creatorNotes/audioTranscription';
import {
  podcastTranscriptEmptyError,
  podcastTranscriptFetchFailedError,
  podcastTranscriptFormatUnsupportedError,
  podcastTranscriptParseFailedError,
  podcastTranscriptUnavailableError,
  transcriptionEmptyError,
  PodcastTranscriptError,
} from '@/lib/creatorNotes/errors';
import { transcriptCharCount } from '@/lib/creatorNotes/identity';
import { durationCoveredSeconds } from '@/lib/creatorNotes/normalizeCaptions';
import {
  defaultOfficialTranscriptAdapters,
  type OfficialTranscriptAdapter,
} from '@/lib/creatorNotes/podcastAdapters';
import {
  cuesFromTranscriptPayload,
  normalizeTranscriptCues,
  parseHtmlTranscriptParagraphs,
  sniffTranscriptKind,
} from '@/lib/creatorNotes/podcastFormats';
import { looksLikeHtmlDocument, rankTranscriptCandidates } from '@/lib/creatorNotes/podcastRss';
import type {
  CreatorTranscriptInput,
  PodcastEpisodeSource,
  PodcastTranscriptCandidate,
  PodcastTranscriptSourceName,
  PodcastTranscriptStatus,
  TranscriptAcquisitionDiagnostics,
} from '@/lib/creatorNotes/types';

const FETCH_TIMEOUT_MS = 20000;

export type PodcastHttpGet = (url: string, timeoutMs: number) => Promise<{
  ok: boolean;
  status: number;
  text: string;
  contentType: string | null;
}>;

export type ResolvedPodcastTranscript = {
  status: PodcastTranscriptStatus;
  transcript: CreatorTranscriptInput | null;
  acquisition: TranscriptAcquisitionDiagnostics | null;
  candidate: PodcastTranscriptCandidate | null;
  error: string | null;
};

async function defaultGet(url: string, timeoutMs: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ac.signal,
      headers: {
        Accept: 'text/vtt, application/x-subrip, application/json, text/plain, text/html;q=0.8, */*;q=0.5',
        'User-Agent': 'iamresist.org creator-notes podcast transcript fetcher',
      },
    });
    return {
      ok: res.ok,
      status: res.status,
      text: await res.text(),
      contentType: res.headers.get('content-type'),
    };
  } finally {
    clearTimeout(timer);
  }
}

function mimeFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  return contentType.split(';')[0]?.trim().toLowerCase() || null;
}

function sourceName(candidate: PodcastTranscriptCandidate): PodcastTranscriptSourceName {
  return candidate.source === 'official_page' ? 'official_creator_page' : 'podcast_namespace';
}

function htmlExplicitlyTranscriptPage(candidate: PodcastTranscriptCandidate): boolean {
  if (candidate.source === 'podcast_namespace') return true;
  if (candidate.source === 'official_page') return true;
  const rel = String(candidate.rel || '').toLowerCase();
  if (rel.includes('transcript') || rel.includes('caption')) return true;
  try {
    return /transcript/i.test(new URL(candidate.url).pathname);
  } catch {
    return false;
  }
}

function acquisitionFrom(
  transcript: CreatorTranscriptInput,
  rawSegments: number,
  candidate: PodcastTranscriptCandidate | null,
  source: TranscriptAcquisitionDiagnostics['source'],
): TranscriptAcquisitionDiagnostics {
  return {
    source,
    language: transcript.transcriptLanguage || candidate?.language || null,
    generated: 'no',
    rawSegments,
    normalizedSegments: transcript.segments.length,
    durationCoveredSeconds: durationCoveredSeconds(transcript.segments),
    characters: transcriptCharCount(transcript.segments),
    transcriptUrl: transcript.transcriptUrl || candidate?.url || null,
    transcriptMimeType: transcript.transcriptMimeType || candidate?.mimeType || null,
    transcriptLanguage: transcript.transcriptLanguage || candidate?.language || null,
  };
}

function transcriptFromCues(
  episode: PodcastEpisodeSource,
  candidate: PodcastTranscriptCandidate,
  cues: { startSeconds: number | null; endSeconds: number | null; text: string }[],
): CreatorTranscriptInput {
  const segments = normalizeTranscriptCues(cues);
  if (!segments.length) throw podcastTranscriptEmptyError();
  return {
    sourceItemId: episode.sourceItemId,
    creatorId: episode.creatorId,
    creatorName: episode.creatorName,
    sourceTitle: episode.title,
    sourceUrl: episode.episodeUrl,
    publishedAt: episode.publishedAt,
    sourceIdentityKey: episode.episodeUrl || episode.audioUrl || episode.guid,
    audioUrl: episode.audioUrl,
    transcriptSource: sourceName(candidate),
    transcriptUrl: candidate.url,
    transcriptMimeType: candidate.mimeType,
    transcriptLanguage: candidate.language,
    segments,
  };
}

function classifyThrown(error: unknown): PodcastTranscriptError {
  if (error instanceof PodcastTranscriptError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/unsupported transcript format|html transcript requires/i.test(message)) {
    return podcastTranscriptFormatUnsupportedError(message);
  }
  if (/invalid json|unrecognized json/i.test(message)) {
    return podcastTranscriptParseFailedError(message);
  }
  return podcastTranscriptParseFailedError(message);
}

async function fetchCandidate(
  candidate: PodcastTranscriptCandidate,
  get: PodcastHttpGet,
): Promise<{ payload: string; mimeType: string | null }> {
  let res: { ok: boolean; status: number; text: string; contentType: string | null };
  try {
    res = await get(candidate.url, FETCH_TIMEOUT_MS);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'network error';
    throw podcastTranscriptFetchFailedError(detail);
  }
  if (!res.ok) throw podcastTranscriptFetchFailedError(`http_${res.status}`);
  const payload = res.text || '';
  if (!payload.trim()) throw podcastTranscriptEmptyError();
  return {
    payload,
    mimeType: candidate.mimeType || mimeFromContentType(res.contentType),
  };
}

async function transcribePodcastAudioFallback(
  episode: PodcastEpisodeSource,
  provider: AudioTranscriptionProvider,
  language?: string,
): Promise<ResolvedPodcastTranscript> {
  const audioUrl = String(episode.audioUrl || '').trim();
  if (!audioUrl) {
    const unavailable = podcastTranscriptUnavailableError();
    return {
      status: 'TRANSCRIPT_UNAVAILABLE',
      transcript: null,
      acquisition: null,
      candidate: null,
      error: unavailable.message,
    };
  }

  try {
    const transcribed = asAudioTranscriptionResult(
      await provider.transcribe({
        audioUrl,
        language,
        sourceItemId: episode.sourceItemId,
      }),
    );
    const transcript = applyEpisodeIdentityToTranscript(transcribed, episode);
    if (!transcript.segments.length) throw transcriptionEmptyError();
    return {
      status: 'TRANSCRIPT_AVAILABLE',
      transcript,
      acquisition: acquisitionFromLocalTranscription(transcript, {
        rawSegments: transcribed.segments.length,
        cacheHit: transcribed.cacheHit ?? null,
        audioDownloadMs: transcribed.audioDownloadMs ?? null,
        transcriptionMs: transcribed.transcriptionMs ?? null,
      }),
      candidate: null,
      error: null,
    };
  } catch (error) {
    if (error instanceof PodcastTranscriptError) {
      return {
        status: error.status,
        transcript: null,
        acquisition: null,
        candidate: null,
        error: error.message,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'TRANSCRIPTION_FAILED',
      transcript: null,
      acquisition: null,
      candidate: null,
      error: `TRANSCRIPTION_FAILED: ${message}`,
    };
  }
}

export async function resolvePodcastTranscript(
  episode: PodcastEpisodeSource,
  deps: {
    get?: PodcastHttpGet;
    adapters?: OfficialTranscriptAdapter[];
    transcribeAudio?: boolean;
    audioTranscription?: AudioTranscriptionProvider;
    transcriptionLanguage?: string;
  } = {},
): Promise<ResolvedPodcastTranscript> {
  const get = deps.get || defaultGet;
  const adapters = deps.adapters || defaultOfficialTranscriptAdapters();
  const candidates = rankTranscriptCandidates(episode.transcriptCandidates || []);
  let lastError: PodcastTranscriptError | null = null;

  for (const candidate of candidates) {
    try {
      const fetched = await fetchCandidate(candidate, get);
      const kind = sniffTranscriptKind(fetched.payload, fetched.mimeType, candidate.url);
      if (kind === 'unknown') throw podcastTranscriptFormatUnsupportedError(fetched.mimeType || 'unknown');
      if (kind === 'html') {
        if (!htmlExplicitlyTranscriptPage(candidate)) {
          throw podcastTranscriptFormatUnsupportedError('text/html is only used for explicit transcript pages');
        }
        if (looksLikeHtmlDocument(fetched.payload) && !htmlExplicitlyTranscriptPage(candidate)) {
          throw podcastTranscriptFormatUnsupportedError('html');
        }
        const labeled = fetched.payload.match(
          /<(p|h[1-6])[^>]*>\s*(?:<(strong|b)[^>]*>\s*)?Transcript:?\s*(?:<\/(?:strong|b)>\s*)?<\/(?:p|h[1-6])>/i,
        );
        const paragraphs: string[] = [];
        const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
        let p: RegExpExecArray | null = pRe.exec(labeled ? fetched.payload.slice(labeled.index + labeled[0].length) : fetched.payload);
        while (p) {
          paragraphs.push(p[1] || '');
          p = pRe.exec(labeled ? fetched.payload.slice(labeled.index + labeled[0].length) : fetched.payload);
        }
        const cues = parseHtmlTranscriptParagraphs(paragraphs);
        const transcript = transcriptFromCues(episode, candidate, cues);
        return {
          status: 'TRANSCRIPT_AVAILABLE',
          transcript,
          acquisition: acquisitionFrom(transcript, cues.length, candidate, sourceName(candidate)),
          candidate,
          error: null,
        };
      }

      const parsed = cuesFromTranscriptPayload({
        payload: fetched.payload,
        mimeType: fetched.mimeType,
        url: candidate.url,
        allowHtml: false,
      });
      if (!parsed.cues.length) throw podcastTranscriptEmptyError();
      const transcript = transcriptFromCues(episode, candidate, parsed.cues);
      return {
        status: 'TRANSCRIPT_AVAILABLE',
        transcript,
        acquisition: acquisitionFrom(transcript, parsed.cues.length, candidate, sourceName(candidate)),
        candidate,
        error: null,
      };
    } catch (error) {
      lastError = classifyThrown(error);
      if (lastError.status === 'TRANSCRIPT_UNAVAILABLE') continue;
    }
  }

  const adapter = adapters.find((entry) => entry.supports(episode));
  if (adapter) {
    try {
      const transcript = await adapter.resolveTranscript(episode);
      if (transcript?.segments?.length) {
        return {
          status: 'TRANSCRIPT_AVAILABLE',
          transcript,
          acquisition: acquisitionFrom(
            transcript,
            transcript.segments.length,
            {
              url: transcript.transcriptUrl || episode.episodeUrl || '',
              mimeType: transcript.transcriptMimeType || 'text/html',
              language: transcript.transcriptLanguage || null,
              rel: null,
              source: 'official_page',
            },
            'official_creator_page',
          ),
          candidate: transcript.transcriptUrl
            ? {
                url: transcript.transcriptUrl,
                mimeType: transcript.transcriptMimeType || 'text/html',
                language: transcript.transcriptLanguage || null,
                rel: null,
                source: 'official_page',
              }
            : null,
          error: null,
        };
      }
    } catch (error) {
      lastError = classifyThrown(error);
      if (lastError.status === 'TRANSCRIPT_FETCH_FAILED' && !deps.transcribeAudio) {
        return {
          status: 'TRANSCRIPT_FETCH_FAILED',
          transcript: null,
          acquisition: null,
          candidate: null,
          error: lastError.message,
        };
      }
    }
  }

  if (deps.transcribeAudio) {
    if (!deps.audioTranscription) {
      return {
        status: 'TRANSCRIPTION_FAILED',
        transcript: null,
        acquisition: null,
        candidate: null,
        error: 'TRANSCRIPTION_FAILED: audio transcription requested without a provider',
      };
    }
    return transcribePodcastAudioFallback(episode, deps.audioTranscription, deps.transcriptionLanguage);
  }

  if (lastError && lastError.status !== 'TRANSCRIPT_UNAVAILABLE') {
    return {
      status: lastError.status,
      transcript: null,
      acquisition: null,
      candidate: candidates[0] || null,
      error: lastError.message,
    };
  }

  const unavailable = podcastTranscriptUnavailableError();
  return {
    status: 'TRANSCRIPT_UNAVAILABLE',
    transcript: null,
    acquisition: null,
    candidate: null,
    error: unavailable.message,
  };
}
