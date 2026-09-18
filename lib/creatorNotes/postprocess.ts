import type { CreatorNoteKind, VerificationStatus } from '@/lib/creatorNotes/constants';
import { creatorNoteFingerprint, overlapDedupeKey } from '@/lib/creatorNotes/identity';
import type { CreatorAtomicNote, CreatorNoteKindCounts, RawCreatorNote } from '@/lib/creatorNotes/types';
import { eventFeaturesAreEmpty } from '@/lib/creatorNotes/validate';

export function defaultVerificationStatus(kind: CreatorNoteKind): VerificationStatus {
  if (kind === 'creator_analysis' || kind === 'why_it_matters' || kind === 'evidence_reference') {
    return 'not_applicable';
  }
  return 'unverified';
}

export function emptyKindCounts(): CreatorNoteKindCounts {
  return {
    event: 0,
    claim: 0,
    new_development: 0,
    context: 0,
    evidence_reference: 0,
    creator_analysis: 0,
    why_it_matters: 0,
  };
}

function timestampRank(value: number | null): number {
  return value == null || !Number.isFinite(value) ? Number.POSITIVE_INFINITY : value;
}

export function dedupeRawCreatorNotes(notes: RawCreatorNote[]): {
  notes: RawCreatorNote[];
  duplicatesRemoved: number;
} {
  const byFingerprint = new Map<string, RawCreatorNote>();
  let exactRemoved = 0;
  for (const note of notes) {
    const fingerprint = creatorNoteFingerprint({
      sourceItemId: '__dedupe__',
      kind: note.kind,
      text: note.text,
      startSeconds: note.startSeconds,
    });
    if (byFingerprint.has(fingerprint)) {
      exactRemoved += 1;
      continue;
    }
    byFingerprint.set(fingerprint, note);
  }

  const byOverlap = new Map<string, RawCreatorNote>();
  let overlapRemoved = 0;
  for (const note of byFingerprint.values()) {
    const key = overlapDedupeKey(note);
    const existing = byOverlap.get(key);
    if (!existing) {
      byOverlap.set(key, note);
      continue;
    }
    overlapRemoved += 1;
    if (timestampRank(note.startSeconds) < timestampRank(existing.startSeconds)) {
      byOverlap.set(key, note);
    }
  }

  const deduped = [...byOverlap.values()].sort(
    (a, b) => timestampRank(a.startSeconds) - timestampRank(b.startSeconds),
  );
  return {
    notes: deduped,
    duplicatesRemoved: exactRemoved + overlapRemoved,
  };
}

export function toAtomicNotes(input: {
  notes: RawCreatorNote[];
  sourceItemId: string;
  creatorId: string | null;
  extractionRunId: string;
  createdAt: string;
  idFactory?: () => string;
}): CreatorAtomicNote[] {
  const nextId = input.idFactory || (() => crypto.randomUUID());
  return input.notes.map((note) => ({
    id: nextId(),
    sourceItemId: input.sourceItemId,
    creatorId: input.creatorId,
    startSeconds: note.startSeconds,
    endSeconds: note.endSeconds,
    kind: note.kind,
    text: note.text,
    attribution: note.attribution,
    eventFeatures: note.eventFeatures && !eventFeaturesAreEmpty(note.eventFeatures) ? note.eventFeatures : null,
    verificationStatus: defaultVerificationStatus(note.kind),
    extractionRunId: input.extractionRunId,
    noteFingerprint: creatorNoteFingerprint({
      sourceItemId: input.sourceItemId,
      kind: note.kind,
      text: note.text,
      startSeconds: note.startSeconds,
    }),
    createdAt: input.createdAt,
  }));
}

export function countNoteKinds(notes: Array<{ kind: CreatorNoteKind }>): CreatorNoteKindCounts {
  const counts = emptyKindCounts();
  for (const note of notes) {
    counts[note.kind] += 1;
  }
  return counts;
}
