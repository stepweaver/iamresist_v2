import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  AUDIO_DOWNLOAD_TIMEOUT_MS,
  AUDIO_MAX_BYTES,
  AUDIO_SAMPLE_RATE,
  AUDIO_TRANSCODE_TIMEOUT_MS,
  AUDIO_USER_AGENT,
} from '@/lib/creatorNotes/audioTranscription';
import {
  audioDownloadFailedError,
  audioTooLargeError,
  audioTranscodeFailedError,
  PodcastTranscriptError,
} from '@/lib/creatorNotes/errors';

export const DEFAULT_AUDIO_WORK_ROOT = path.join(process.cwd(), 'tmp', 'creator-notes-audio-work');

export type AudioFetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export type DownloadPodcastAudioResult = {
  destPath: string;
  bytes: number;
  contentType: string | null;
  elapsedMs: number;
};

export type TranscodePodcastAudioResult = {
  destPath: string;
  elapsedMs: number;
};

function clip(value: string, max = 180): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function audioFileExtension(audioUrl: string, contentType: string | null): string {
  try {
    const pathname = new URL(audioUrl).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase() || '';
    if (ext && /^[a-z0-9]{2,5}$/.test(ext) && !['html', 'htm', 'php', 'asp'].includes(ext)) return ext;
  } catch {
    // ignore malformed URL path
  }
  const mime = String(contentType || '').toLowerCase();
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
  return 'audio';
}

async function writeResponseBody(
  res: Response,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  if (!res.body) throw audioDownloadFailedError('empty_body');
  const file = createWriteStream(destPath);
  let written = 0;
  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      written += value.byteLength;
      if (written > maxBytes) {
        await reader.cancel().catch(() => undefined);
        file.destroy();
        throw audioTooLargeError(`exceeded ${maxBytes} bytes`);
      }
      if (!file.write(Buffer.from(value))) {
        await new Promise<void>((resolve, reject) => {
          const onDrain = () => {
            file.off('error', onError);
            resolve();
          };
          const onError = (error: Error) => {
            file.off('drain', onDrain);
            reject(error);
          };
          file.once('drain', onDrain);
          file.once('error', onError);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      file.end((error: Error | null | undefined) => (error ? reject(error) : resolve()));
    });
    return written;
  } catch (error) {
    file.destroy();
    throw error;
  }
}

export async function downloadPodcastAudio(input: {
  audioUrl: string;
  destPath: string;
  maxBytes?: number;
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: AudioFetchImpl;
}): Promise<DownloadPodcastAudioResult> {
  const started = Date.now();
  const maxBytes = input.maxBytes ?? AUDIO_MAX_BYTES;
  const timeoutMs = input.timeoutMs ?? AUDIO_DOWNLOAD_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl || fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(input.audioUrl, {
        redirect: 'follow',
        cache: 'no-store',
        signal: ac.signal,
        headers: {
          Accept: 'audio/*, application/octet-stream, */*;q=0.8',
          'User-Agent': input.userAgent || AUDIO_USER_AGENT,
        },
      });
    } catch (error) {
      const aborted = ac.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      const detail = aborted ? 'timeout' : error instanceof Error ? error.message : 'network error';
      throw audioDownloadFailedError(detail);
    }
    if (!res.ok) throw audioDownloadFailedError(`http_${res.status}`);
    const contentType = res.headers.get('content-type');
    const mime = String(contentType || '').toLowerCase();
    if (mime.includes('text/html') || mime.includes('application/json')) {
      throw audioDownloadFailedError(`unexpected_content_type:${clip(mime, 80)}`);
    }
    const contentLength = Number(res.headers.get('content-length') || '');
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw audioTooLargeError(`content-length ${contentLength} exceeded ${maxBytes} bytes`);
    }
    const bytes = await writeResponseBody(res, input.destPath, maxBytes);
    if (bytes <= 0) throw audioDownloadFailedError('empty_body');
    return {
      destPath: input.destPath,
      bytes,
      contentType,
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runCommand(input: {
  command: string;
  args: string[];
  timeoutMs: number;
  label: string;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${input.label} timed out after ${input.timeoutMs}ms`));
    }, input.timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${input.label} exited ${code}${stderr ? `: ${clip(stderr)}` : ''}`));
    });
  });
}

export async function transcodePodcastAudio(input: {
  inputPath: string;
  outputPath: string;
  ffmpegBin?: string;
  timeoutMs?: number;
  sampleRate?: number;
  run?: (command: string, args: string[], timeoutMs: number) => Promise<void>;
}): Promise<TranscodePodcastAudioResult> {
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? AUDIO_TRANSCODE_TIMEOUT_MS;
  const ffmpegBin = input.ffmpegBin || process.env.CREATOR_NOTES_FFMPEG || 'ffmpeg';
  const sampleRate = input.sampleRate || AUDIO_SAMPLE_RATE;
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input.inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-c:a',
    'pcm_s16le',
    input.outputPath,
  ];
  try {
    if (input.run) {
      await input.run(ffmpegBin, args, timeoutMs);
    } else {
      await runCommand({ command: ffmpegBin, args, timeoutMs, label: 'ffmpeg' });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/enoent/i.test(detail)) throw audioTranscodeFailedError('ffmpeg not found');
    throw audioTranscodeFailedError(detail);
  }
  return { destPath: input.outputPath, elapsedMs: Date.now() - started };
}

export function parseFfmpegDurationSeconds(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(stderr || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((value) => Number.isFinite(value))) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

export function formatFfmpegSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.000';
  return (Math.round(seconds * 1000) / 1000).toFixed(3);
}

/**
 * Sample-accurate speech chunk for Groq upload.
 * `-ss`/`-t` come after `-i` so the cut is decoded, not keyframe-aligned.
 * 16 kHz mono 64 kbps MP3 matches Groq's internal downsample and stays under the direct-upload cap.
 */
export function ffmpegAudioChunkArgs(input: {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
}): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input.inputPath,
    '-ss',
    formatFfmpegSeconds(input.startSeconds),
    '-t',
    formatFfmpegSeconds(input.durationSeconds),
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(AUDIO_SAMPLE_RATE),
    '-c:a',
    'libmp3lame',
    '-b:a',
    '64k',
    input.outputPath,
  ];
}

function runCommandCaptured(input: {
  command: string;
  args: string[];
  timeoutMs: number;
  label: string;
}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${input.label} timed out after ${input.timeoutMs}ms`));
    }, input.timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function probeAudioDurationSeconds(input: {
  inputPath: string;
  ffmpegBin?: string;
  timeoutMs?: number;
}): Promise<number> {
  const timeoutMs = input.timeoutMs ?? AUDIO_TRANSCODE_TIMEOUT_MS;
  const ffmpegBin = input.ffmpegBin || process.env.CREATOR_NOTES_FFMPEG || 'ffmpeg';
  try {
    const result = await runCommandCaptured({
      command: ffmpegBin,
      args: ['-hide_banner', '-i', input.inputPath],
      timeoutMs,
      label: 'ffmpeg',
    });
    const duration = parseFfmpegDurationSeconds(`${result.stderr}\n${result.stdout}`);
    if (duration == null) throw audioTranscodeFailedError('audio duration unavailable');
    return duration;
  } catch (error) {
    if (error instanceof PodcastTranscriptError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    if (/enoent/i.test(detail)) throw audioTranscodeFailedError('ffmpeg not found');
    throw audioTranscodeFailedError(detail);
  }
}

export async function encodeAudioChunk(input: {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
  ffmpegBin?: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = input.timeoutMs ?? AUDIO_TRANSCODE_TIMEOUT_MS;
  const ffmpegBin = input.ffmpegBin || process.env.CREATOR_NOTES_FFMPEG || 'ffmpeg';
  const args = ffmpegAudioChunkArgs(input);
  try {
    await runCommand({ command: ffmpegBin, args, timeoutMs, label: 'ffmpeg' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/enoent/i.test(detail)) throw audioTranscodeFailedError('ffmpeg not found');
    throw audioTranscodeFailedError(detail);
  }
}

export async function withTemporaryAudioWorkspace<T>(
  fn: (dir: { workDir: string }) => Promise<T>,
  opts: { tmpRoot?: string } = {},
): Promise<T> {
  const root = opts.tmpRoot || DEFAULT_AUDIO_WORK_ROOT;
  await mkdir(root, { recursive: true });
  const workDir = await mkdtemp(path.join(root, 'ep-'));
  try {
    return await fn({ workDir });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
