import { CREATOR_NOTE_KINDS } from '@/lib/creatorNotes/constants';
import {
  canonicalVoiceIdentityKey,
  type CreatorVoiceCatalogItem,
} from '@/lib/creatorNotes/resolveSource';
import type {
  CreatorAtomicNote,
  CreatorNoteKind,
  CreatorNoteRun,
  CreatorNotesReviewGroup,
  CreatorNotesReviewResult,
} from '@/lib/creatorNotes/types';

export type CreatorNotesReviewQuery = {
  limit: number;
  creator?: string | null;
  kind?: CreatorNoteKind | null;
  sinceHours?: number | null;
  sourceItemId?: string | null;
  now?: Date | string;
};

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function createdMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampRank(value: number | null | undefined): number {
  return value == null || !Number.isFinite(value) ? Number.POSITIVE_INFINITY : value;
}

export function filterNotesForReview(
  notes: CreatorAtomicNote[],
  query: CreatorNotesReviewQuery,
): CreatorAtomicNote[] {
  const now = query.now instanceof Date ? query.now : new Date(query.now || Date.now());
  const creator = optionalText(query.creator)?.toLowerCase() || null;
  const kind = query.kind && CREATOR_NOTE_KINDS.includes(query.kind) ? query.kind : null;
  const sourceItemId = optionalText(query.sourceItemId);
  const sinceHours =
    query.sinceHours == null || !Number.isFinite(query.sinceHours) ? null : Math.max(0, Number(query.sinceHours));
  const sinceMs = sinceHours == null ? null : now.getTime() - sinceHours * 60 * 60 * 1000;

  return notes.filter((note) => {
    if (creator && String(note.creatorId || '').trim().toLowerCase() !== creator) return false;
    if (kind && note.kind !== kind) return false;
    if (sourceItemId && note.sourceItemId !== sourceItemId) return false;
    if (sinceMs != null && createdMs(note.createdAt) < sinceMs) return false;
    return true;
  });
}

export function groupCreatorNotesForReview(input: {
  notes: CreatorAtomicNote[];
  runs?: CreatorNoteRun[];
  catalog?: CreatorVoiceCatalogItem[];
  limit: number;
}): CreatorNotesReviewResult {
  const runsById = new Map((input.runs || []).map((run) => [run.id, run]));
  const catalogByIdentity = new Map<string, CreatorVoiceCatalogItem>();
  const catalogBySourceId = new Map<string, CreatorVoiceCatalogItem>();
  for (const item of input.catalog || []) {
    catalogBySourceId.set(item.sourceItemId, item);
    catalogByIdentity.set(canonicalVoiceIdentityKey(item), item);
  }

  const grouped = new Map<string, CreatorAtomicNote[]>();
  const latestCreated = new Map<string, number>();
  for (const note of input.notes) {
    const list = grouped.get(note.sourceItemId) || [];
    list.push(note);
    grouped.set(note.sourceItemId, list);
    latestCreated.set(
      note.sourceItemId,
      Math.max(latestCreated.get(note.sourceItemId) || 0, createdMs(note.createdAt)),
    );
  }

  const sourceIds = [...grouped.keys()].sort((a, b) => {
    const byTime = (latestCreated.get(b) || 0) - (latestCreated.get(a) || 0);
    if (byTime !== 0) return byTime;
    return a.localeCompare(b);
  });

  const groups: CreatorNotesReviewGroup[] = [];
  for (const sourceItemId of sourceIds.slice(0, Math.max(0, input.limit))) {
    const notes = (grouped.get(sourceItemId) || []).slice().sort((a, b) => {
      const byStart = timestampRank(a.startSeconds) - timestampRank(b.startSeconds);
      if (byStart !== 0) return byStart;
      return a.id.localeCompare(b.id);
    });
    const latestNote = notes.reduce(
      (best, note) => (createdMs(note.createdAt) >= createdMs(best.createdAt) ? note : best),
      notes[0],
    );
    const run = latestNote ? runsById.get(latestNote.extractionRunId) : null;
    const catalogItem =
      catalogBySourceId.get(sourceItemId) ||
      catalogByIdentity.get(canonicalVoiceIdentityKey({ sourceItemId, url: null })) ||
      null;
    groups.push({
      sourceItemId,
      creatorId: latestNote?.creatorId || catalogItem?.creatorId || null,
      creatorName: catalogItem?.creatorName || null,
      title: catalogItem?.title || null,
      publishedAt: catalogItem?.publishedAt || null,
      sourceUrl: catalogItem?.url || null,
      runId: run?.id || latestNote?.extractionRunId || null,
      notes,
    });
  }

  return {
    groups,
    noteCount: groups.reduce((sum, group) => sum + group.notes.length, 0),
    readOnly: true,
  };
}

export function reviewCreatorNotes(input: {
  notes: CreatorAtomicNote[];
  runs?: CreatorNoteRun[];
  catalog?: CreatorVoiceCatalogItem[];
  query: CreatorNotesReviewQuery;
}): CreatorNotesReviewResult {
  const filtered = filterNotesForReview(input.notes, input.query);
  return groupCreatorNotesForReview({
    notes: filtered,
    runs: input.runs,
    catalog: input.catalog,
    limit: input.query.limit,
  });
}
