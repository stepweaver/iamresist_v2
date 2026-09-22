import type { CreatorAtomicNote, CreatorNoteEventFeatures } from '@/lib/creatorNotes/types';
import type { EventThreadNoteContext, EventThreadSourceMeta, IntelOsintCandidate } from '@/lib/eventThreads/types';
import { buildNoteContexts } from '@/lib/eventThreads/context';

let noteSeq = 0;

export function testUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function makeNote(partial: Partial<CreatorAtomicNote> & { text: string; kind: CreatorAtomicNote['kind'] }): CreatorAtomicNote {
  noteSeq += 1;
  return {
    id: partial.id || testUuid(noteSeq),
    sourceItemId: partial.sourceItemId || '6aaaebbe8a1508074d789adc',
    creatorId: partial.creatorId ?? 'professor-jiang',
    startSeconds: partial.startSeconds ?? noteSeq * 12,
    endSeconds: partial.endSeconds ?? noteSeq * 12 + 10,
    kind: partial.kind,
    text: partial.text,
    attribution: partial.attribution ?? 'Professor Jiang',
    eventFeatures: partial.eventFeatures ?? null,
    sourceExcerpt: partial.sourceExcerpt ?? partial.text,
    sourceQuote: partial.sourceQuote ?? partial.text,
    exactQuote: partial.exactQuote ?? partial.text,
    sourceSegmentIndexes: partial.sourceSegmentIndexes ?? [noteSeq],
    verificationStatus: partial.verificationStatus ?? (partial.kind === 'creator_analysis' || partial.kind === 'why_it_matters' ? 'not_applicable' : 'unverified'),
    extractionRunId: partial.extractionRunId || testUuid(900),
    noteFingerprint: partial.noteFingerprint || `fp-${noteSeq}`,
    createdAt: partial.createdAt || '2026-09-16T12:00:00.000Z',
  };
}

export function features(partial: Partial<CreatorNoteEventFeatures>): CreatorNoteEventFeatures {
  return {
    actors: partial.actors || [],
    action: partial.action ?? null,
    object: partial.object ?? null,
    institutions: partial.institutions || [],
    locations: partial.locations || [],
    referencedDocuments: partial.referencedDocuments || [],
  };
}

export const JIANG_SOURCE: EventThreadSourceMeta = {
  sourceItemId: '6aaaebbe8a1508074d789adc',
  creatorId: 'professor-jiang',
  creatorName: 'Professor Jiang',
  title: 'Iran Expands Exclusion Zone?',
  url: 'https://shows.acast.com/professor-jiang/episodes/6aaaebbe8a1508074d789adc',
  publishedAt: '2026-09-16T12:00:00.000Z',
};

export function contextsFor(notes: CreatorAtomicNote[], source: EventThreadSourceMeta = JIANG_SOURCE): EventThreadNoteContext[] {
  return buildNoteContexts({ notes, source });
}

export function makeIntelCandidate(partial: Partial<IntelOsintCandidate> & { title: string }): IntelOsintCandidate {
  return {
    id: partial.id || testUuid(500 + Math.floor(Math.random() * 1000)),
    title: partial.title,
    summary: partial.summary ?? null,
    canonicalUrl: partial.canonicalUrl || 'https://example.test/article',
    publishedAt: partial.publishedAt ?? '2026-09-16T15:00:00.000Z',
    deskLane: partial.deskLane ?? 'osint',
    sourceName: partial.sourceName ?? 'Reuters',
  };
}
