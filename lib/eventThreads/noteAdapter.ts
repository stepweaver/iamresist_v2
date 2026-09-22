import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';

export function asNoteFromRow(row: Record<string, unknown>): CreatorAtomicNote {
  const indexes = Array.isArray(row.source_segment_indexes)
    ? row.source_segment_indexes.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  return {
    id: String(row.id),
    sourceItemId: String(row.source_item_id),
    creatorId: row.creator_id == null ? null : String(row.creator_id),
    startSeconds: row.start_seconds == null ? null : Number(row.start_seconds),
    endSeconds: row.end_seconds == null ? null : Number(row.end_seconds),
    kind: row.kind as CreatorAtomicNote['kind'],
    text: String(row.text || ''),
    attribution: row.attribution == null ? null : String(row.attribution),
    eventFeatures: (row.event_features as CreatorAtomicNote['eventFeatures']) || null,
    sourceExcerpt: row.source_excerpt == null ? null : String(row.source_excerpt),
    sourceQuote: row.exact_quote == null ? null : String(row.exact_quote),
    exactQuote: row.exact_quote == null ? null : String(row.exact_quote),
    sourceSegmentIndexes: indexes,
    verificationStatus: row.verification_status as CreatorAtomicNote['verificationStatus'],
    extractionRunId: String(row.extraction_run_id || ''),
    noteFingerprint: String(row.note_fingerprint || ''),
    createdAt: String(row.created_at || ''),
  };
}
