import { CREATOR_NOTE_EXTRACTION_VERSION, CREATOR_NOTE_KINDS } from '@/lib/creatorNotes/constants';
import type {
  CreatorAtomicNote,
  CreatorNoteKind,
  CreatorNoteRun,
} from '@/lib/creatorNotes/types';

/** Newest episodes shown on the internal brief. Older runs for those episodes are still loaded so version preference can win. */
export const CREATOR_NOTES_BRIEF_EPISODE_LIMIT = 40;
export const CREATOR_NOTES_BRIEF_RUN_SCAN_LIMIT = 400;

export type BriefEpisodeMeta = {
  sourceItemId: string;
  creatorName: string | null;
  title: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  transcriptSource: string | null;
};

export type BriefEpisode = {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  title: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  transcriptSource: string | null;
  chronology: 'published' | 'extracted';
  runId: string;
  extractionVersion: string;
  modelProvider: string | null;
  modelName: string | null;
  extractedAt: string | null;
  notes: CreatorAtomicNote[];
};

export type BriefCreatorGroup = {
  creatorKey: string;
  creatorId: string | null;
  creatorName: string | null;
  episodes: BriefEpisode[];
};

export type BriefDay = {
  dayKey: string;
  label: string;
  chronology: 'published' | 'extracted';
  creators: BriefCreatorGroup[];
};

export type BriefDiagnostics = {
  episodeCount: number;
  noteCount: number;
  newestExtractionAt: string | null;
  creators: string[];
  extractionVersions: string[];
};

export type BriefFilters = {
  creator?: string | null;
  kind?: string | null;
};

function timeMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampRank(value: number | null | undefined): number {
  return value == null || !Number.isFinite(value) ? Number.POSITIVE_INFINITY : value;
}

export function isEditorialBriefNote(note: Pick<CreatorAtomicNote, 'contentRole'>): boolean {
  return note.contentRole === 'editorial';
}

export function compareRunsNewestFirst(a: CreatorNoteRun, b: CreatorNoteRun): number {
  const byCompleted = timeMs(b.completedAt) - timeMs(a.completedAt);
  if (byCompleted !== 0) return byCompleted;
  const byCreated = timeMs(b.createdAt) - timeMs(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

/**
 * One successful run per episode.
 * A successful run of the current extraction version wins over a newer obsolete version.
 * If the current version was never successful, the newest successful run is used.
 */
export function selectWinningSuccessRun(
  runs: CreatorNoteRun[],
  currentExtractionVersion: string = CREATOR_NOTE_EXTRACTION_VERSION,
): CreatorNoteRun | null {
  const successful = runs.filter((run) => run.status === 'success');
  if (!successful.length) return null;
  const current = successful.filter((run) => run.extractionVersion === currentExtractionVersion);
  const pool = current.length ? current : successful;
  return pool.slice().sort(compareRunsNewestFirst)[0] || null;
}

function metaFor(sourceItemId: string, metas: BriefEpisodeMeta[] | undefined): BriefEpisodeMeta | null {
  return (metas || []).find((item) => item.sourceItemId === sourceItemId) || null;
}

function noteSort(a: CreatorAtomicNote, b: CreatorAtomicNote): number {
  const byStart = timestampRank(a.startSeconds) - timestampRank(b.startSeconds);
  if (byStart !== 0) return byStart;
  return a.id.localeCompare(b.id);
}

export function selectBriefEpisodes(input: {
  runs: CreatorNoteRun[];
  notes: CreatorAtomicNote[];
  metas?: BriefEpisodeMeta[];
  currentExtractionVersion?: string;
  limit?: number;
}): BriefEpisode[] {
  const version = input.currentExtractionVersion || CREATOR_NOTE_EXTRACTION_VERSION;
  const limit = input.limit == null ? CREATOR_NOTES_BRIEF_EPISODE_LIMIT : Math.max(0, input.limit);
  const runsBySource = new Map<string, CreatorNoteRun[]>();
  for (const run of input.runs) {
    const list = runsBySource.get(run.sourceItemId) || [];
    list.push(run);
    runsBySource.set(run.sourceItemId, list);
  }

  const notesByRun = new Map<string, CreatorAtomicNote[]>();
  for (const note of input.notes) {
    if (!isEditorialBriefNote(note)) continue;
    const list = notesByRun.get(note.extractionRunId) || [];
    list.push(note);
    notesByRun.set(note.extractionRunId, list);
  }

  const episodes: BriefEpisode[] = [];
  for (const [sourceItemId, runs] of runsBySource) {
    const winner = selectWinningSuccessRun(runs, version);
    if (!winner) continue;
    const notes = (notesByRun.get(winner.id) || []).slice().sort(noteSort);
    if (!notes.length) continue;
    const meta = metaFor(sourceItemId, input.metas);
    const publishedAt = meta?.publishedAt || null;
    const extractedAt = winner.completedAt || winner.createdAt || null;
    const identityUrl = /^https?:\/\//i.test(String(winner.sourceIdentityKey || ''))
      ? String(winner.sourceIdentityKey)
      : null;
    episodes.push({
      sourceItemId,
      creatorId: notes.find((note) => note.creatorId)?.creatorId || winner.creatorId || null,
      creatorName: meta?.creatorName || null,
      title: meta?.title || null,
      publishedAt,
      sourceUrl: meta?.sourceUrl || identityUrl,
      transcriptSource: meta?.transcriptSource || null,
      chronology: publishedAt ? 'published' : 'extracted',
      runId: winner.id,
      extractionVersion: winner.extractionVersion,
      modelProvider: winner.modelProvider || null,
      modelName: winner.modelName || null,
      extractedAt,
      notes,
    });
  }

  episodes.sort((a, b) => {
    const aTime = timeMs(a.publishedAt || a.extractedAt);
    const bTime = timeMs(b.publishedAt || b.extractedAt);
    if (bTime !== aTime) return bTime - aTime;
    return a.sourceItemId.localeCompare(b.sourceItemId);
  });

  return episodes.slice(0, limit);
}

export function creatorFilterKey(episode: Pick<BriefEpisode, 'creatorId' | 'creatorName'>): string {
  return (episode.creatorId || episode.creatorName || '').trim().toLowerCase();
}

export function creatorFilterLabel(episode: Pick<BriefEpisode, 'creatorId' | 'creatorName'>): string {
  return episode.creatorName || episode.creatorId || 'Creator not stored';
}

export function applyBriefFilters(episodes: BriefEpisode[], filters: BriefFilters = {}): BriefEpisode[] {
  const creator = String(filters.creator || '').trim().toLowerCase();
  const kind = CREATOR_NOTE_KINDS.includes(filters.kind as CreatorNoteKind)
    ? (filters.kind as CreatorNoteKind)
    : null;

  return episodes
    .filter((episode) => !creator || creatorFilterKey(episode) === creator)
    .map((episode) => {
      if (!kind) return episode;
      return { ...episode, notes: episode.notes.filter((note) => note.kind === kind) };
    })
    .filter((episode) => episode.notes.length > 0);
}

function dayKeyFrom(value: string | null): string {
  if (!value) return 'undated';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'undated';
  return parsed.toISOString().slice(0, 10);
}

function dayLabel(dayKey: string, chronology: 'published' | 'extracted'): string {
  if (dayKey === 'undated') return 'DATE NOT STORED';
  const [year, month, day] = dayKey.split('-');
  const date = `${year}-${month}-${day}`;
  return chronology === 'published' ? date : `${date} · extraction day`;
}

export function groupBriefEpisodes(episodes: BriefEpisode[]): BriefDay[] {
  const days = new Map<string, BriefDay>();
  for (const episode of episodes) {
    const stamp = episode.publishedAt || episode.extractedAt;
    const key = dayKeyFrom(stamp);
    const chronology = episode.chronology;
    const dayId = `${chronology}:${key}`;
    let day = days.get(dayId);
    if (!day) {
      day = { dayKey: key, label: dayLabel(key, chronology), chronology, creators: [] };
      days.set(dayId, day);
    }
    const creatorKey = creatorFilterKey(episode) || 'creator-not-stored';
    let creator = day.creators.find((group) => group.creatorKey === creatorKey);
    if (!creator) {
      creator = {
        creatorKey,
        creatorId: episode.creatorId,
        creatorName: episode.creatorName,
        episodes: [],
      };
      day.creators.push(creator);
    }
    creator.episodes.push(episode);
  }

  const ordered = [...days.values()];
  ordered.sort((a, b) => {
    if (a.dayKey === 'undated') return 1;
    if (b.dayKey === 'undated') return -1;
    return b.dayKey.localeCompare(a.dayKey);
  });
  for (const day of ordered) {
    day.creators.sort((a, b) => creatorFilterLabel(a).localeCompare(creatorFilterLabel(b)));
  }
  return ordered;
}

export function briefDiagnostics(episodes: BriefEpisode[]): BriefDiagnostics {
  const creators = new Set<string>();
  const versions = new Set<string>();
  let noteCount = 0;
  let newestExtractionAt: string | null = null;
  let newestMs = 0;
  for (const episode of episodes) {
    noteCount += episode.notes.length;
    creators.add(creatorFilterLabel(episode));
    if (episode.extractionVersion) versions.add(episode.extractionVersion);
    const ms = timeMs(episode.extractedAt);
    if (ms >= newestMs) {
      newestMs = ms;
      newestExtractionAt = episode.extractedAt;
    }
  }
  return {
    episodeCount: episodes.length,
    noteCount,
    newestExtractionAt,
    creators: [...creators].sort((a, b) => a.localeCompare(b)),
    extractionVersions: [...versions].sort((a, b) => a.localeCompare(b)),
  };
}

export function referencedSourceLabel(note: CreatorAtomicNote): string | null {
  const direct = String(note.referencedSource || '').trim();
  if (direct) return direct;
  const features = note.eventFeatures as (CreatorAtomicNote['eventFeatures'] & { referencedSource?: unknown }) | null;
  const stored = features && typeof features.referencedSource === 'string' ? features.referencedSource.trim() : '';
  return stored || null;
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatBriefClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--:--';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}`;
}

export function formatBriefTimestampRange(
  startSeconds: number | null | undefined,
  endSeconds: number | null | undefined,
): string {
  if (startSeconds == null && endSeconds == null) return `[${formatBriefClock(null)}]`;
  if (endSeconds == null || endSeconds === startSeconds) return `[${formatBriefClock(startSeconds)}]`;
  return `[${formatBriefClock(startSeconds)}–${formatBriefClock(endSeconds)}]`;
}
