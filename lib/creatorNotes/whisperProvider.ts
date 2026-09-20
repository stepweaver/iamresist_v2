import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIO_TRANSCRIBE_TIMEOUT_MS,
  CREATOR_NOTES_WHISPER_MODEL_DEFAULT,
  CREATOR_NOTES_WHISPER_PROVIDER,
  CREATOR_NOTES_WHISPER_VERSION,
  LOCAL_AUDIO_TRANSCRIPT_SOURCE,
  asAudioTranscriptionResult,
  parseRawWhisperSegments,
  type AudioTranscriptionProvider,
  type AudioTranscriptionResult,
  type WhisperSegmentLike,
} from '@/lib/creatorNotes/audioTranscription';
import { CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION } from '@/lib/creatorNotes/constants';
import {
  canonicalizeTranscriptSegments,
  hashRawTranscription,
} from '@/lib/creatorNotes/identity';
import {
  readAudioTranscriptCache,
  writeAudioTranscriptCache,
  DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR,
} from '@/lib/creatorNotes/audioTranscriptCache';
import {
  downloadPodcastAudio,
  transcodePodcastAudio,
  withTemporaryAudioWorkspace,
  audioFileExtension,
  runCommand,
  type AudioFetchImpl,
} from '@/lib/creatorNotes/audioDownload';
import { transcriptionEmptyError, transcriptionFailedError } from '@/lib/creatorNotes/errors';

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/audio-transcription/transcribe.py',
);

export type WhisperRawResult = {
  language: string | null;
  segments: WhisperSegmentLike[];
  provider?: string;
  model?: string;
  version?: string;
};

export type FasterWhisperProviderDeps = {
  cacheDir?: string;
  workRoot?: string;
  pythonPath?: string;
  scriptPath?: string;
  model?: string;
  version?: string;
  providerName?: string;
  language?: string;
  fetchImpl?: AudioFetchImpl;
  ffmpegBin?: string;
  transcribeTimeoutMs?: number;
  runWhisper?: (wavPath: string, input: { language?: string; model: string }) => Promise<WhisperRawResult>;
  transcode?: typeof transcodePodcastAudio;
  download?: typeof downloadPodcastAudio;
};

function defaultPythonBin(): string {
  return process.env.CREATOR_NOTES_PYTHON || process.env.PYTHON || 'python3';
}

function defaultModel(): string {
  return process.env.CREATOR_NOTES_WHISPER_MODEL || CREATOR_NOTES_WHISPER_MODEL_DEFAULT;
}

function defaultLanguage(): string {
  return process.env.CREATOR_NOTES_TRANSCRIBE_LANGUAGE || 'en';
}

function parseWhisperStdout(stdout: string): WhisperRawResult {
  const trimmed = String(stdout || '').trim();
  const start = trimmed.indexOf('{');
  const jsonText = start >= 0 ? trimmed.slice(start) : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw transcriptionFailedError('whisper output was not JSON');
  }
  const row = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  if (!row) throw transcriptionFailedError('whisper output was empty');
  const segments = Array.isArray(row.segments) ? (row.segments as WhisperSegmentLike[]) : [];
  return {
    language: typeof row.language === 'string' ? row.language : null,
    segments,
    provider: typeof row.provider === 'string' ? row.provider : undefined,
    model: typeof row.model === 'string' ? row.model : undefined,
    version: typeof row.version === 'string' ? row.version : undefined,
  };
}

async function defaultRunWhisper(
  wavPath: string,
  input: { language?: string; model: string },
  deps: FasterWhisperProviderDeps,
): Promise<WhisperRawResult> {
  const pythonPath = deps.pythonPath || defaultPythonBin();
  const scriptPath = deps.scriptPath || SCRIPT_PATH;
  const timeoutMs = deps.transcribeTimeoutMs || AUDIO_TRANSCRIBE_TIMEOUT_MS;
  const args = [
    '-u',
    scriptPath,
    '--audio',
    wavPath,
    '--model',
    input.model,
    '--device',
    'cpu',
    '--compute-type',
    'int8',
  ];
  if (input.language) {
    args.push('--language', input.language);
  }
  try {
    const { stdout } = await runCommand({
      command: pythonPath,
      args,
      timeoutMs,
      label: 'faster-whisper',
    });
    return parseWhisperStdout(stdout);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/enoent/i.test(detail)) {
      throw transcriptionFailedError(
        `python not found (${pythonPath}). Install faster-whisper: python3 -m pip install -r scripts/audio-transcription/requirements.txt`,
      );
    }
    throw transcriptionFailedError(detail);
  }
}

function transcriptFromLocalAudio(input: {
  sourceItemId: string;
  audioUrl: string;
  language: string | null;
  rawSegments: ReturnType<typeof parseRawWhisperSegments>;
  segments: ReturnType<typeof canonicalizeTranscriptSegments>;
  provider: string;
  model: string;
  version: string;
  cacheHit: boolean;
  audioDownloadMs: number | null;
  transcriptionMs: number | null;
}): AudioTranscriptionResult {
  const transcript: AudioTranscriptionResult = {
    sourceItemId: input.sourceItemId,
    creatorId: null,
    creatorName: null,
    sourceTitle: null,
    sourceUrl: null,
    publishedAt: null,
    sourceIdentityKey: input.audioUrl,
    rawSegments: input.rawSegments,
    segments: input.segments,
    rawTranscriptionHash: hashRawTranscription(input.rawSegments),
    normalizationVersion: CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
    audioUrl: input.audioUrl,
    transcriptSource: LOCAL_AUDIO_TRANSCRIPT_SOURCE,
    transcriptUrl: null,
    transcriptMimeType: null,
    transcriptLanguage: input.language,
    transcriptionProvider: input.provider,
    transcriptionModel: input.model,
    transcriptionVersion: input.version,
    cacheHit: input.cacheHit,
    audioDownloadMs: input.audioDownloadMs,
    transcriptionMs: input.transcriptionMs,
  };
  return asAudioTranscriptionResult(transcript);
}

export function createFasterWhisperTranscriptionProvider(
  deps: FasterWhisperProviderDeps = {},
): AudioTranscriptionProvider {
  const cacheDir = deps.cacheDir || DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR;
  const providerName = deps.providerName || CREATOR_NOTES_WHISPER_PROVIDER;
  const model = deps.model || defaultModel();
  const version = deps.version || CREATOR_NOTES_WHISPER_VERSION;
  const download = deps.download || downloadPodcastAudio;
  const transcode = deps.transcode || transcodePodcastAudio;
  const runWhisper =
    deps.runWhisper || ((wavPath, input) => defaultRunWhisper(wavPath, input, deps));

  return {
    async transcribe(input) {
      const audioUrl = String(input.audioUrl || '').trim();
      if (!audioUrl) throw transcriptionFailedError('missing audioUrl');
      const sourceItemId = String(input.sourceItemId || audioUrl).trim();
      const language = input.language || defaultLanguage();
      const cacheKey = {
        sourceItemId,
        audioUrl,
        provider: providerName,
        model,
        version,
      };
      const cached = await readAudioTranscriptCache(cacheKey, cacheDir);
      if (cached) {
        return transcriptFromLocalAudio({
          sourceItemId,
          audioUrl,
          language: cached.language || language,
          rawSegments: cached.rawSegments,
          segments: cached.segments,
          provider: cached.provider || providerName,
          model: cached.model || model,
          version: cached.version || version,
          cacheHit: true,
          audioDownloadMs: 0,
          transcriptionMs: 0,
        });
      }

      return withTemporaryAudioWorkspace(
        async ({ workDir }) => {
        const rawPath = path.join(workDir, `source.${audioFileExtension(audioUrl, null)}`);
        const wavPath = path.join(workDir, 'speech-16k-mono.wav');
        const downloaded = await download({
          audioUrl,
          destPath: rawPath,
          fetchImpl: deps.fetchImpl,
        });
        const downloadMs = downloaded.elapsedMs;
        const transcoded = await transcode({
          inputPath: downloaded.destPath,
          outputPath: wavPath,
          ffmpegBin: deps.ffmpegBin,
        });
        const whisperStarted = Date.now();
        const raw = await runWhisper(transcoded.destPath, { language, model });
        const transcriptionMs = Date.now() - whisperStarted + transcoded.elapsedMs;
        const rawSegments = parseRawWhisperSegments(raw.segments);
        const segments = canonicalizeTranscriptSegments(rawSegments);
        if (!segments.length) throw transcriptionEmptyError();
        await writeAudioTranscriptCache(
          {
            sourceItemId,
            audioUrl,
            provider: providerName,
            model,
            version,
            language: raw.language || language,
            rawSegments,
            segments,
            createdAt: new Date().toISOString(),
          },
          cacheDir,
        );
        return transcriptFromLocalAudio({
          sourceItemId,
          audioUrl,
          language: raw.language || language,
          rawSegments,
          segments,
          provider: providerName,
          model,
          version,
          cacheHit: false,
          audioDownloadMs: downloadMs,
          transcriptionMs,
        });
      },
      { tmpRoot: deps.workRoot },
    );
    },
  };
}
