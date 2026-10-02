import type { CreatorAtomicNote, CreatorTranscriptSegment } from '@/lib/creatorNotes/types';
import {
  JEV_DISCOURSE_FAILURE_CACHE_MISSING,
  JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED,
  JEV_SHADOW_LABEL_CAP,
  JEV_SPEECH_MODES,
  JEV_UPSTREAM_NOTE_STATUSES,
} from '@/lib/jev/constants';
import { emptyDiscourse, recoverDiscourseContext, type DiscourseTranscripts } from '@/lib/jev/discourse';
import { JevShadowError } from '@/lib/jev/errors';
import { isEventIdentityRelation } from '@/lib/jev/questions';
import { candidateSetsForNote, prepareCorpus, v1ThreadIdByNote, type PreparedShadowNote } from '@/lib/jev/retrieve';
import type {
  JevEventIdentityRelation,
  JevSpeechMode,
  JevUpstreamNoteStatus,
  ShadowDiscourseContext,
  ShadowLabelFile,
  ShadowLabelProvenance,
  ShadowLabelRow,
  ShadowNoteReview,
  ShadowRetrievalSnapshot,
} from '@/lib/jev/types';

const STATEMENT_ROLES = new Set(['creator', 'quoted_speaker', 'reported', 'unknown']);

export type CreatorNameById = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

type DraftPair = {
  noteId: string;
  candidateId: string;
  score: number;
  retrievedRank: number | null;
  inJevSet: boolean;
  v1SameThread: boolean;
};

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function featureRecord(note: CreatorAtomicNote): Record<string, unknown> | null {
  const features = note.eventFeatures;
  if (!features || typeof features !== 'object') return null;
  return features as unknown as Record<string, unknown>;
}

function storedQuotedSpeaker(note: CreatorAtomicNote): string | null {
  const direct = optionalString(note.quotedSpeaker);
  if (direct) return direct;
  const features = featureRecord(note);
  return features ? optionalString(features.quotedSpeaker) : null;
}

function storedStatementRole(note: CreatorAtomicNote): ShadowLabelProvenance['statementRole'] {
  const features = featureRecord(note);
  const raw = optionalString(note.statementRole) || (features ? optionalString(features.statementRole) : null);
  if (raw && STATEMENT_ROLES.has(raw)) return raw as ShadowLabelProvenance['statementRole'];
  return null;
}

function lookupCreatorName(creatorId: string | null, names: CreatorNameById | undefined): string | null {
  if (!creatorId || !names) return null;
  if (typeof (names as Map<string, string>).get === 'function') {
    return optionalString((names as Map<string, string>).get(creatorId));
  }
  return optionalString((names as Record<string, string>)[creatorId]);
}

function slugifyCreatorName(value: string): string | null {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

/** Map voice-catalog slugs onto creator ids. Does not invent a name from attribution. */
export function creatorNamesFromVoices(
  voices: ReadonlyArray<{ title?: string | null; slug?: string | null }>,
  creatorIds: readonly string[],
): Map<string, string> {
  const bySlug = new Map<string, string>();
  for (const voice of voices) {
    const title = optionalString(voice.title);
    if (!title) continue;
    const slug = optionalString(voice.slug)?.toLowerCase();
    if (slug) bySlug.set(slug, title);
    const fromTitle = slugifyCreatorName(title);
    if (fromTitle && !bySlug.has(fromTitle)) bySlug.set(fromTitle, title);
  }
  const names = new Map<string, string>();
  for (const id of creatorIds) {
    const title = bySlug.get(id.toLowerCase());
    if (title) names.set(id, title);
  }
  return names;
}

export function provenanceFromNote(note: CreatorAtomicNote, creatorNames?: CreatorNameById): ShadowLabelProvenance {
  return {
    id: note.id,
    sourceItemId: note.sourceItemId,
    creatorId: note.creatorId,
    creatorName: lookupCreatorName(note.creatorId, creatorNames),
    kind: note.kind,
    contentRole: optionalString(note.contentRole),
    statementRole: storedStatementRole(note),
    attribution: optionalString(note.attribution),
    quotedSpeaker: storedQuotedSpeaker(note),
    text: note.text,
    sourceQuote: optionalString(note.sourceQuote) || optionalString(note.exactQuote),
    sourceExcerpt: note.sourceExcerpt == null ? null : String(note.sourceExcerpt),
    startSeconds: finiteOrNull(note.startSeconds),
    endSeconds: finiteOrNull(note.endSeconds),
    sourceSegmentIndexes: Array.isArray(note.sourceSegmentIndexes) ? [...note.sourceSegmentIndexes] : [],
  };
}

export function labelRowCountsForJev(
  file: ShadowLabelFile,
  row: Pick<ShadowLabelRow, 'noteId' | 'candidateId'>,
): boolean {
  return file.notes[row.noteId]?.status === 'usable' && file.notes[row.candidateId]?.status === 'usable';
}

function addCandidateId(ids: string[], value: string | null | undefined): void {
  if (!value || value === 'new_event' || ids.includes(value)) return;
  ids.push(value);
}

/**
 * Acceptable Event Thread anchors for a query.
 * Includes every human `same_event` candidate, every `correctCandidateIds` entry,
 * and a legacy `correctCandidateId` when it names a note.
 * An empty result means the correct candidate choice is `new_event`.
 */
export function acceptableCandidateIds(file: ShadowLabelFile, noteId: string): string[] {
  const ids: string[] = [];
  for (const row of file.rows) {
    if (row.noteId !== noteId) continue;
    for (const id of row.correctCandidateIds) addCandidateId(ids, id);
    if (row.relation === 'same_event') addCandidateId(ids, row.candidateId);
    addCandidateId(ids, row.correctCandidateId);
  }
  return ids;
}

function transcriptsFor(
  transcripts: DiscourseTranscripts | undefined,
  sourceItemId: string,
): readonly CreatorTranscriptSegment[] | null {
  if (!transcripts) return null;
  return transcripts.get(sourceItemId) || null;
}

export function buildLabelSheet(input: {
  groups: Array<{ sourceItemId: string; notes: readonly CreatorAtomicNote[] }>;
  prepared?: PreparedShadowNote[];
  creatorNames?: CreatorNameById;
  transcripts?: DiscourseTranscripts;
  transcriptFailures?: ReadonlyMap<string, string>;
}): ShadowLabelFile {
  const prepared = input.prepared || prepareCorpus(input.groups);
  const threadByNote = v1ThreadIdByNote(prepared);
  const byId = new Map(prepared.map((item) => [item.note.id, item]));
  const retrieval: ShadowRetrievalSnapshot[] = [];
  const drafts: DraftPair[] = [];

  for (const item of prepared) {
    const sets = candidateSetsForNote(prepared, item.note.id);
    retrieval.push({
      noteId: item.note.id,
      retrievedCandidateIds: sets.retrieved.map((candidate) => candidate.id),
      jevCandidateIds: sets.jev.map((candidate) => candidate.id),
    });
    const queryThread = threadByNote.get(item.note.id) || null;
    for (const candidate of sets.retrieved) {
      const candidateThread = threadByNote.get(candidate.id) || null;
      drafts.push({
        noteId: item.note.id,
        candidateId: candidate.id,
        score: candidate.score,
        retrievedRank: candidate.rank,
        inJevSet: candidate.rank <= sets.jev.length && sets.jev.some((entry) => entry.id === candidate.id),
        v1SameThread: Boolean(queryThread && candidateThread && queryThread === candidateThread),
      });
    }
  }

  const bestByDirected = new Map<string, DraftPair>();
  for (const draft of drafts) {
    const key = `${draft.noteId}|${draft.candidateId}`;
    const existing = bestByDirected.get(key);
    if (!existing || draft.score > existing.score) bestByDirected.set(key, draft);
  }

  const byScore = (left: DraftPair, right: DraftPair) =>
    Number(right.v1SameThread) - Number(left.v1SameThread) ||
    right.score - left.score ||
    left.noteId.localeCompare(right.noteId) ||
    left.candidateId.localeCompare(right.candidateId);
  const directed = [...bestByDirected.values()];
  const jevPairs = directed.filter((pair) => pair.inJevSet).sort(byScore);
  const extras = directed
    .filter((pair) => !pair.inJevSet)
    .sort(byScore)
    .slice(0, JEV_SHADOW_LABEL_CAP);
  const rows: ShadowLabelRow[] = [];
  const notes: Record<string, ShadowNoteReview> = {};
  const remember = (id: string) => {
    if (notes[id]) return;
    const stored = byId.get(id)?.note;
    if (!stored) return;
    const provenance = provenanceFromNote(stored, input.creatorNames);
    const group =
      input.groups.find((entry) => entry.notes.some((item) => item.id === stored.id)) ||
      input.groups.find((entry) => entry.sourceItemId === stored.sourceItemId);
    const sourceItemId = group?.sourceItemId || stored.sourceItemId;
    const discourse = recoverDiscourseContext(stored, {
      segments: transcriptsFor(input.transcripts, sourceItemId),
      segmentSource: 'transcript_cache',
      siblings: group?.notes || [],
      unavailableReason: input.transcriptFailures?.get(sourceItemId) || JEV_DISCOURSE_FAILURE_CACHE_MISSING,
    });
    notes[id] = noteReview({
      ...provenance,
      ...discourse,
      status: null,
      reviewReason: null,
      speechMode: null,
      representedSpeaker: null,
      attributionReviewReason: null,
    });
  };
  for (const pair of [...jevPairs, ...extras]) {
    const note = byId.get(pair.noteId)?.note;
    const candidate = byId.get(pair.candidateId)?.note;
    if (!note || !candidate) continue;
    remember(pair.noteId);
    remember(pair.candidateId);
    rows.push({
      noteId: pair.noteId,
      candidateId: pair.candidateId,
      relation: null,
      correctCandidateIds: [],
      correctCandidateId: null,
      v1SameThread: pair.v1SameThread,
      overlapScore: pair.score,
      retrievedRank: pair.retrievedRank,
      inJevSet: pair.inJevSet,
    });
  }

  return {
    sourceItemIds: input.groups.map((group) => group.sourceItemId),
    notes,
    retrieval,
    rows,
  };
}

export function discourseFailureSummary(notes: Readonly<Record<string, { discourseContext: string | null; discourseContextFailureReason: string | null }>>): string {
  const counts = new Map<string, number>();
  for (const note of Object.values(notes)) {
    if (note.discourseContext) continue;
    const reason = note.discourseContextFailureReason || JEV_DISCOURSE_FAILURE_CACHE_MISSING;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  const parts = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (!parts.length) return 'failure reasons none';
  return `failure reasons ${parts.map(([reason, count]) => `${reason}=${count}`).join(' ')}`;
}

export function exportShadowLabelSheet(
  groups: Array<{ sourceItemId: string; notes: readonly CreatorAtomicNote[] }>,
  log: (message: string) => void = (message) => {
    console.error(message);
  },
  creatorNames?: CreatorNameById,
  transcripts?: DiscourseTranscripts,
  transcriptFailures?: ReadonlyMap<string, string>,
): ShadowLabelFile {
  const loaded = groups.reduce((sum, group) => sum + group.notes.length, 0);
  log(`notes loaded=${loaded}`);
  const prepared = prepareCorpus(groups);
  log(`notes resolved=${prepared.length}`);
  const sheet = buildLabelSheet({ groups, prepared, creatorNames, transcripts, transcriptFailures });
  log('candidate retrieval complete');
  const reviews = Object.values(sheet.notes);
  const withNames = reviews.filter((note) => note.creatorName).length;
  const withDiscourse = reviews.filter((note) => note.discourseContext).length;
  log(`notes with creator names=${withNames}`);
  log(`notes with discourse context=${withDiscourse}`);
  log(`notes without discourse context=${reviews.length - withDiscourse}`);
  log(discourseFailureSummary(sheet.notes));
  log(`rows emitted=${sheet.rows.length}`);
  return sheet;
}

function noteReview(review: ShadowNoteReview): ShadowNoteReview {
  return {
    id: review.id,
    sourceItemId: review.sourceItemId,
    creatorId: review.creatorId,
    creatorName: review.creatorName,
    text: review.text,
    kind: review.kind,
    contentRole: review.contentRole,
    statementRole: review.statementRole,
    attribution: review.attribution,
    quotedSpeaker: review.quotedSpeaker,
    sourceQuote: review.sourceQuote,
    sourceExcerpt: review.sourceExcerpt,
    startSeconds: review.startSeconds,
    endSeconds: review.endSeconds,
    sourceSegmentIndexes: review.sourceSegmentIndexes,
    discourseContext: review.discourseContext,
    discourseStartSeconds: review.discourseStartSeconds,
    discourseEndSeconds: review.discourseEndSeconds,
    discourseSegmentIndexes: review.discourseSegmentIndexes,
    discourseContextSource: review.discourseContextSource,
    discourseContextFailureReason: review.discourseContextFailureReason,
    status: review.status,
    reviewReason: review.reviewReason,
    speechMode: review.speechMode,
    representedSpeaker: review.representedSpeaker,
    attributionReviewReason: review.attributionReviewReason,
  };
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new JevShadowError(message, 'labels_invalid');
  }
  return value as Record<string, unknown>;
}

function isUpstreamNoteStatus(value: string): value is JevUpstreamNoteStatus {
  return (JEV_UPSTREAM_NOTE_STATUSES as readonly string[]).includes(value);
}

function isSpeechMode(value: string): value is JevSpeechMode {
  return (JEV_SPEECH_MODES as readonly string[]).includes(value);
}

function parseStatus(value: unknown, label: string): JevUpstreamNoteStatus | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !isUpstreamNoteStatus(value)) {
    throw new JevShadowError(`${label} is not an upstream note status`, 'labels_invalid');
  }
  return value;
}

function parseSeconds(value: unknown, label: string): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new JevShadowError(`${label} timestamp is invalid`, 'labels_invalid');
  }
  return value;
}

function parseCandidateIds(value: unknown, label: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new JevShadowError(`${label} correctCandidateIds must be note ids`, 'labels_invalid');
  }
  return value.map((id) => String(id).trim());
}

function parseReviewReason(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new JevShadowError(`${label} reviewReason must be text`, 'labels_invalid');
  }
  return value.trim() || null;
}

function parseOptionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new JevShadowError(`${label} must be text`, 'labels_invalid');
  }
  return value.trim() || null;
}

function parseSpeechMode(value: unknown, label: string): JevSpeechMode | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !isSpeechMode(value)) {
    throw new JevShadowError(`${label} is not a speech mode`, 'labels_invalid');
  }
  return value;
}

function parseDiscourse(row: Record<string, unknown>, label: string): ShadowDiscourseContext {
  const discourseContextSource = parseOptionalText(row.discourseContextSource, `${label} discourseContextSource`);
  const discourseContextFailureReason = parseOptionalText(
    row.discourseContextFailureReason,
    `${label} discourseContextFailureReason`,
  );
  if (row.discourseContext == null && row.discourseSegmentIndexes == null) {
    return {
      ...emptyDiscourse(discourseContextFailureReason || JEV_DISCOURSE_FAILURE_CACHE_MISSING),
      discourseContextSource: discourseContextSource || 'unavailable',
      discourseContextFailureReason: discourseContextFailureReason || JEV_DISCOURSE_FAILURE_CACHE_MISSING,
    };
  }
  const discourseContext = row.discourseContext == null ? null : String(row.discourseContext);
  let discourseSegmentIndexes: number[] | null = null;
  if (row.discourseSegmentIndexes != null) {
    if (!Array.isArray(row.discourseSegmentIndexes) || row.discourseSegmentIndexes.some((index) => typeof index !== 'number' || !Number.isFinite(index))) {
      throw new JevShadowError(`${label} discourseSegmentIndexes are invalid`, 'labels_invalid');
    }
    discourseSegmentIndexes = row.discourseSegmentIndexes.map((index) => Number(index));
  }
  return {
    discourseContext,
    discourseStartSeconds: parseSeconds(row.discourseStartSeconds, `${label} discourse start`),
    discourseEndSeconds: parseSeconds(row.discourseEndSeconds, `${label} discourse end`),
    discourseSegmentIndexes,
    discourseContextSource: discourseContext ? discourseContextSource || 'transcript_cache' : discourseContextSource || 'unavailable',
    discourseContextFailureReason: discourseContext ? null : discourseContextFailureReason || JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED,
  };
}

function parseNoteReview(value: unknown, id: string): ShadowNoteReview {
  const provenance = parseProvenance(value, `Note ${id}`);
  if (provenance.id !== id) {
    throw new JevShadowError(`Note ${id} provenance id does not match the map key`, 'labels_invalid');
  }
  const row = value as Record<string, unknown>;
  return noteReview({
    ...provenance,
    ...parseDiscourse(row, `Note ${id}`),
    status: parseStatus(row.status, `Note ${id} status`),
    reviewReason: parseReviewReason(row.reviewReason, `Note ${id}`),
    speechMode: parseSpeechMode(row.speechMode, `Note ${id} speechMode`),
    representedSpeaker: parseOptionalText(row.representedSpeaker, `Note ${id} representedSpeaker`),
    attributionReviewReason: parseOptionalText(row.attributionReviewReason, `Note ${id} attributionReviewReason`),
  });
}

function parseNotes(value: unknown): Record<string, ShadowNoteReview> {
  const body = asObject(value, 'Label file is missing notes');
  const notes: Record<string, ShadowNoteReview> = {};
  for (const [id, entry] of Object.entries(body)) {
    if (!id) throw new JevShadowError('Note id is empty', 'labels_invalid');
    notes[id] = parseNoteReview(entry, id);
  }
  return notes;
}

function parseProvenance(value: unknown, label: string): ShadowLabelProvenance {
  const row = asObject(value, `${label} provenance was not an object`);
  if (typeof row.id !== 'string' || !row.id) {
    throw new JevShadowError(`${label} provenance is missing id`, 'labels_invalid');
  }
  if (typeof row.sourceItemId !== 'string') {
    throw new JevShadowError(`${label} provenance is missing sourceItemId`, 'labels_invalid');
  }
  if (typeof row.kind !== 'string' || typeof row.text !== 'string') {
    throw new JevShadowError(`${label} provenance is missing kind or text`, 'labels_invalid');
  }
  if (!Array.isArray(row.sourceSegmentIndexes) || row.sourceSegmentIndexes.some((index) => typeof index !== 'number' || !Number.isFinite(index))) {
    throw new JevShadowError(`${label} provenance is missing sourceSegmentIndexes`, 'labels_invalid');
  }
  const statementRole = optionalString(row.statementRole);
  if (statementRole && !STATEMENT_ROLES.has(statementRole)) {
    throw new JevShadowError(`${label} provenance statementRole is invalid`, 'labels_invalid');
  }
  return {
    id: row.id,
    sourceItemId: row.sourceItemId,
    creatorId: optionalString(row.creatorId),
    creatorName: optionalString(row.creatorName),
    kind: row.kind,
    contentRole: optionalString(row.contentRole),
    statementRole: (statementRole as ShadowLabelProvenance['statementRole']) || null,
    attribution: optionalString(row.attribution),
    quotedSpeaker: optionalString(row.quotedSpeaker),
    text: row.text,
    sourceQuote: row.sourceQuote == null ? null : String(row.sourceQuote),
    sourceExcerpt: row.sourceExcerpt == null ? null : String(row.sourceExcerpt),
    startSeconds: parseSeconds(row.startSeconds, label),
    endSeconds: parseSeconds(row.endSeconds, label),
    sourceSegmentIndexes: row.sourceSegmentIndexes.map((index) => Number(index)),
  };
}

export function parseShadowLabelFile(value: unknown): ShadowLabelFile {
  const body = asObject(value, 'Label file was not an object');
  if (!Array.isArray(body.sourceItemIds) || body.sourceItemIds.some((id) => typeof id !== 'string' || !id)) {
    throw new JevShadowError('Label file is missing sourceItemIds', 'labels_invalid');
  }
  if (!Array.isArray(body.retrieval) || !Array.isArray(body.rows)) {
    throw new JevShadowError('Label file is missing retrieval or rows', 'labels_invalid');
  }
  const notes = parseNotes(body.notes);

  const retrieval = body.retrieval.map((entry) => {
    const row = asObject(entry, 'Retrieval snapshot was not an object');
    if (typeof row.noteId !== 'string' || !Array.isArray(row.retrievedCandidateIds) || !Array.isArray(row.jevCandidateIds)) {
      throw new JevShadowError('Retrieval snapshot is incomplete', 'labels_invalid');
    }
    return {
      noteId: row.noteId,
      retrievedCandidateIds: row.retrievedCandidateIds.map((id) => String(id)),
      jevCandidateIds: row.jevCandidateIds.map((id) => String(id)),
    };
  });

  const rows = body.rows.map((entry) => {
    const row = asObject(entry, 'Label row was not an object');
    if (typeof row.noteId !== 'string' || typeof row.candidateId !== 'string') {
      throw new JevShadowError('Label row is missing note ids', 'labels_invalid');
    }
    if (row.relation != null && (typeof row.relation !== 'string' || !isEventIdentityRelation(row.relation))) {
      throw new JevShadowError('Label row relation is not an event-identity value', 'labels_invalid');
    }
    if (!notes[row.noteId] || !notes[row.candidateId]) {
      throw new JevShadowError('Label row references a note missing from notes', 'labels_invalid');
    }
    return {
      noteId: row.noteId,
      candidateId: row.candidateId,
      relation: row.relation == null ? null : (row.relation as JevEventIdentityRelation),
      correctCandidateIds: parseCandidateIds(row.correctCandidateIds, 'Label row'),
      correctCandidateId: row.correctCandidateId == null ? null : String(row.correctCandidateId),
      v1SameThread: Boolean(row.v1SameThread),
      overlapScore: typeof row.overlapScore === 'number' ? row.overlapScore : 0,
      retrievedRank: typeof row.retrievedRank === 'number' ? row.retrievedRank : null,
      inJevSet: Boolean(row.inJevSet),
    };
  });

  return {
    sourceItemIds: body.sourceItemIds.map((id) => String(id)),
    notes,
    retrieval,
    rows,
  };
}

export function assertLabelsReady(file: ShadowLabelFile): void {
  if (!file.rows.length) {
    throw new JevShadowError('Label file has no rows', 'labels_empty');
  }
  for (const note of Object.values(file.notes)) {
    if (note.status == null) {
      throw new JevShadowError('Label file has unlabeled notes', 'labels_partial');
    }
  }
  for (const row of file.rows) {
    if (!file.notes[row.noteId] || !file.notes[row.candidateId]) {
      throw new JevShadowError('Label row references a note missing from notes', 'labels_invalid');
    }
    if (labelRowCountsForJev(file, row) && row.relation == null) {
      throw new JevShadowError('Label file has unlabeled rows', 'labels_partial');
    }
  }
}
