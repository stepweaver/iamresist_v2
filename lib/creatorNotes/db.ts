import 'server-only';

import { intelDbConfigured } from '@/lib/intel/db';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import {
  CREATOR_NOTES_BRIEF_EPISODE_LIMIT,
  CREATOR_NOTES_BRIEF_RUN_SCAN_LIMIT,
  selectBriefEpisodes,
  selectWinningSuccessRun,
  type BriefEpisode,
  type BriefEpisodeMeta,
} from '@/lib/creatorNotes/brief';
import { persistableCreatorNotes } from '@/lib/creatorNotes/contentRole';
import { isUuid } from '@/lib/creatorNotes/identity';
import { resolveStatementRole, type StatementRole } from '@/lib/creatorNotes/semanticFidelity';
import { reviewCreatorNotes, type CreatorNotesReviewQuery } from '@/lib/creatorNotes/review';
import type {
  CreatorAtomicNote,
  CreatorNoteRun,
  CreatorNotesReviewResult,
  CreatorNotesStore,
} from '@/lib/creatorNotes/types';

function client() {
  return supabaseAdmin().schema('intel');
}

function asRun(row: Record<string, unknown>): CreatorNoteRun {
  return {
    id: String(row.id),
    sourceItemId: String(row.source_item_id),
    sourceIdentityKey: row.source_identity_key == null ? null : String(row.source_identity_key),
    creatorId: row.creator_id == null ? null : String(row.creator_id),
    modelProvider: String(row.model_provider),
    modelName: String(row.model_name),
    extractionVersion: String(row.extraction_version),
    transcriptHash: String(row.transcript_hash),
    status: row.status as CreatorNoteRun['status'],
    inputChars: Number(row.input_chars) || 0,
    notesCreated: Number(row.notes_created) || 0,
    startedAt: String(row.started_at),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    createdAt: String(row.created_at),
  };
}

function statementRoleFromFeatures(value: unknown): StatementRole | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const role = (value as { statementRole?: unknown }).statementRole;
  if (role === 'creator' || role === 'quoted_speaker' || role === 'reported' || role === 'unknown') return role;
  return undefined;
}

type EventFeaturesStorage = NonNullable<CreatorAtomicNote['eventFeatures']> & {
  statementRole?: StatementRole;
  quotedSpeaker?: string;
  referencedSource?: string;
};

function optionalFeatureString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function eventFeaturesForStorage(
  note: CreatorAtomicNote,
): CreatorAtomicNote['eventFeatures'] | EventFeaturesStorage | null {
  const role = note.statementRole || resolveStatementRole(note);
  const features = note.eventFeatures ? { ...note.eventFeatures } : null;
  const quotedSpeaker = String(note.quotedSpeaker || '').trim() || undefined;
  const referencedSource = String(note.referencedSource || '').trim() || undefined;
  if (!features && !role && !quotedSpeaker && !referencedSource) return null;
  return {
    ...(features || {}),
    ...(role ? { statementRole: role } : {}),
    ...(quotedSpeaker ? { quotedSpeaker } : {}),
    ...(referencedSource ? { referencedSource } : {}),
  } as EventFeaturesStorage;
}

function stripBriefFeatureExtras(value: unknown): CreatorAtomicNote['eventFeatures'] {
  if (!value || typeof value !== 'object') return null;
  const {
    statementRole: _role,
    quotedSpeaker: _quoted,
    referencedSource: _ref,
    ...rest
  } = value as Record<string, unknown>;
  void _role;
  void _quoted;
  void _ref;
  if (!('actors' in rest) && !('action' in rest)) return null;
  return rest as unknown as CreatorAtomicNote['eventFeatures'];
}

function asNote(row: Record<string, unknown>): CreatorAtomicNote {
  const indexes = Array.isArray(row.source_segment_indexes)
    ? row.source_segment_indexes.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const features = row.event_features;
  const quotedSpeaker =
    features && typeof features === 'object'
      ? optionalFeatureString((features as EventFeaturesStorage).quotedSpeaker)
      : undefined;
  const referencedSource =
    features && typeof features === 'object'
      ? optionalFeatureString((features as EventFeaturesStorage).referencedSource)
      : undefined;
  const attribution = row.attribution == null ? null : String(row.attribution);
  return {
    id: String(row.id),
    sourceItemId: String(row.source_item_id),
    creatorId: row.creator_id == null ? null : String(row.creator_id),
    startSeconds: row.start_seconds == null ? null : Number(row.start_seconds),
    endSeconds: row.end_seconds == null ? null : Number(row.end_seconds),
    kind: row.kind as CreatorAtomicNote['kind'],
    text: String(row.text || ''),
    attribution,
    eventFeatures: stripBriefFeatureExtras(row.event_features),
    sourceExcerpt: row.source_excerpt == null ? null : String(row.source_excerpt),
    sourceQuote: row.exact_quote == null ? null : String(row.exact_quote),
    exactQuote: row.exact_quote == null ? null : String(row.exact_quote),
    sourceSegmentIndexes: indexes,
    contentRole: row.content_role == null ? undefined : (String(row.content_role) as CreatorAtomicNote['contentRole']),
    quotedSpeaker: quotedSpeaker || null,
    referencedSource: referencedSource || null,
    statementRole:
      statementRoleFromFeatures(row.event_features) ||
      resolveStatementRole({
        kind: row.kind as CreatorAtomicNote['kind'],
        attribution,
        quotedSpeaker: quotedSpeaker || null,
        referencedSource: referencedSource || null,
        text: String(row.text || ''),
      }),
    verificationStatus: row.verification_status as CreatorAtomicNote['verificationStatus'],
    extractionRunId: String(row.extraction_run_id),
    noteFingerprint: String(row.note_fingerprint),
    createdAt: String(row.created_at),
  };
}

function noteToRow(note: CreatorAtomicNote) {
  return {
    id: note.id,
    extraction_run_id: note.extractionRunId,
    source_item_id: note.sourceItemId,
    creator_id: note.creatorId,
    start_seconds: note.startSeconds,
    end_seconds: note.endSeconds,
    kind: note.kind,
    text: note.text,
    attribution: note.attribution,
    source_excerpt: note.sourceExcerpt,
    exact_quote: note.sourceQuote || note.exactQuote,
    source_segment_indexes: note.sourceSegmentIndexes || [],
    content_role: note.contentRole === 'editorial' ? 'editorial' : null,
    event_features: eventFeaturesForStorage(note),
    verification_status: note.verificationStatus,
    note_fingerprint: note.noteFingerprint,
    created_at: note.createdAt,
  };
}

export function createSupabaseCreatorNotesStore(): CreatorNotesStore {
  return {
    async findEquivalentSuccessRun(input) {
      if (!intelDbConfigured()) return null;
      const { data, error } = await client()
        .from('creator_note_runs')
        .select(
          'id, source_item_id, source_identity_key, creator_id, model_provider, model_name, extraction_version, transcript_hash, status, input_chars, notes_created, started_at, completed_at, error_message, created_at',
        )
        .eq('source_item_id', input.sourceItemId)
        .eq('transcript_hash', input.transcriptHash)
        .eq('extraction_version', input.extractionVersion)
        .eq('model_provider', input.modelProvider)
        .eq('model_name', input.modelName)
        .eq('status', 'success')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`creator_note_runs equivalent select: ${error.message}`);
      return data ? asRun(data as Record<string, unknown>) : null;
    },

    async insertRun(run) {
      const { error } = await client().from('creator_note_runs').insert({
        id: run.id,
        source_item_id: run.sourceItemId,
        source_identity_key: run.sourceIdentityKey,
        creator_id: run.creatorId,
        model_provider: run.modelProvider,
        model_name: run.modelName,
        extraction_version: run.extractionVersion,
        transcript_hash: run.transcriptHash,
        status: run.status,
        input_chars: run.inputChars,
        notes_created: run.notesCreated,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        error_message: run.errorMessage,
        created_at: run.createdAt,
      });
      if (error) throw new Error(`creator_note_runs insert: ${error.message}`);
    },

    async updateRun(id, patch) {
      const { error } = await client()
        .from('creator_note_runs')
        .update({
          status: patch.status,
          notes_created: patch.notesCreated,
          completed_at: patch.completedAt,
          error_message: patch.errorMessage,
        })
        .eq('id', id);
      if (error) throw new Error(`creator_note_runs update: ${error.message}`);
    },

    async insertNotes(notes) {
      const persistable = persistableCreatorNotes(notes);
      if (persistable.length === 0) return { written: 0 };
      const fingerprints = persistable.map((note) => note.noteFingerprint);
      const { data: existing, error: existingError } = await client()
        .from('creator_atomic_notes')
        .select('note_fingerprint')
        .in('note_fingerprint', fingerprints);
      if (existingError) throw new Error(`creator_atomic_notes fingerprint select: ${existingError.message}`);
      const existingRows = (existing ?? []) as Array<{ note_fingerprint?: string }>;
      const seen = new Set(existingRows.map((row) => String(row.note_fingerprint || '')));
      const fresh = persistable.filter((note) => !seen.has(note.noteFingerprint));
      if (fresh.length === 0) return { written: 0 };

      const chunkSize = 40;
      let written = 0;
      for (let i = 0; i < fresh.length; i += chunkSize) {
        const chunk = fresh.slice(i, i + chunkSize).map(noteToRow);
        const { error } = await client().from('creator_atomic_notes').insert(chunk);
        if (error) throw new Error(`creator_atomic_notes insert: ${error.message}`);
        written += chunk.length;
      }
      return { written };
    },
  };
}

export function createMemoryCreatorNotesStore(seed: {
  runs?: CreatorNoteRun[];
  notes?: CreatorAtomicNote[];
} = {}) {
  const runs = [...(seed.runs || [])];
  const notes = [...(seed.notes || [])];
  const writes = { runs: 0, notes: 0, updates: 0 };

  const store: CreatorNotesStore & {
    runs: CreatorNoteRun[];
    notes: CreatorAtomicNote[];
    writes: { runs: number; notes: number; updates: number };
    writeCount: () => number;
  } = {
    runs,
    notes,
    writes,
    writeCount: () => writes.runs + writes.notes + writes.updates,
    async findEquivalentSuccessRun(input) {
      return (
        runs.find(
          (run) =>
            run.status === 'success' &&
            run.sourceItemId === input.sourceItemId &&
            run.transcriptHash === input.transcriptHash &&
            run.extractionVersion === input.extractionVersion &&
            run.modelProvider === input.modelProvider &&
            run.modelName === input.modelName,
        ) || null
      );
    },
    async insertRun(run) {
      writes.runs += 1;
      runs.push({ ...run });
    },
    async updateRun(id, patch) {
      writes.updates += 1;
      const existing = runs.find((run) => run.id === id);
      if (!existing) throw new Error(`creator_note_runs missing: ${id}`);
      existing.status = patch.status;
      existing.notesCreated = patch.notesCreated;
      existing.completedAt = patch.completedAt;
      existing.errorMessage = patch.errorMessage;
    },
    async insertNotes(incoming) {
      const persistable = persistableCreatorNotes(incoming);
      const seen = new Set(notes.map((note) => note.noteFingerprint));
      const fresh = persistable.filter((note) => !seen.has(note.noteFingerprint));
      if (fresh.length === 0) return { written: 0 };
      writes.notes += 1;
      notes.push(...fresh.map((note) => ({ ...note })));
      return { written: fresh.length };
    },
  };
  return store;
}

const NOTE_SELECT_COLUMNS =
  'id, extraction_run_id, source_item_id, creator_id, start_seconds, end_seconds, kind, text, attribution, event_features, source_excerpt, exact_quote, source_segment_indexes, content_role, verification_status, note_fingerprint, created_at';

const RUN_SELECT_COLUMNS =
  'id, source_item_id, source_identity_key, creator_id, model_provider, model_name, extraction_version, transcript_hash, status, input_chars, notes_created, started_at, completed_at, error_message, created_at';

export async function loadPersistedCreatorNotesReview(
  query: CreatorNotesReviewQuery,
  deps: { catalog?: import('@/lib/creatorNotes/resolveSource').CreatorVoiceCatalogItem[] } = {},
): Promise<CreatorNotesReviewResult> {
  if (!intelDbConfigured()) {
    throw new Error('Supabase not configured');
  }

  const fetchCap = Math.min(2000, Math.max(query.limit * 80, query.limit));
  let notesQuery = client()
    .from('creator_atomic_notes')
    .select(NOTE_SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(fetchCap);

  if (query.creator) notesQuery = notesQuery.eq('creator_id', query.creator);
  if (query.kind) notesQuery = notesQuery.eq('kind', query.kind);
  if (query.sourceItemId) notesQuery = notesQuery.eq('source_item_id', query.sourceItemId);
  if (query.sinceHours != null && Number.isFinite(query.sinceHours)) {
    const now = query.now instanceof Date ? query.now : new Date(query.now || Date.now());
    const since = new Date(now.getTime() - Math.max(0, Number(query.sinceHours)) * 60 * 60 * 1000).toISOString();
    notesQuery = notesQuery.gte('created_at', since);
  }

  const { data: noteRows, error: notesError } = await notesQuery;
  if (notesError) throw new Error(`creator_atomic_notes review select: ${notesError.message}`);
  const notes = ((noteRows || []) as Record<string, unknown>[]).map(asNote);

  const runIds = [...new Set(notes.map((note) => note.extractionRunId).filter(Boolean))];
  let runs: CreatorNoteRun[] = [];
  if (runIds.length) {
    const { data: runRows, error: runsError } = await client()
      .from('creator_note_runs')
      .select(RUN_SELECT_COLUMNS)
      .in('id', runIds);
    if (runsError) throw new Error(`creator_note_runs review select: ${runsError.message}`);
    runs = ((runRows || []) as Record<string, unknown>[]).map(asRun);
  }

  return reviewCreatorNotes({ notes, runs, catalog: deps.catalog, query });
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

async function loadBriefEpisodeMeta(sourceItemIds: string[]): Promise<BriefEpisodeMeta[]> {
  const ids = [...new Set(sourceItemIds.filter((id) => isUuid(id)))];
  if (!ids.length) return [];
  const { data, error } = await client()
    .from('source_items')
    .select('id, title, published_at, canonical_url, sources(name)')
    .in('id', ids);
  if (error) throw new Error(`source_items brief select: ${error.message}`);
  return ((data || []) as Record<string, unknown>[]).map((row) => {
    const sources = row.sources as { name?: string | null } | Array<{ name?: string | null }> | null;
    const source = Array.isArray(sources) ? sources[0] : sources;
    return {
      sourceItemId: String(row.id),
      creatorName: optionalText(source?.name),
      title: optionalText(row.title),
      publishedAt: row.published_at == null ? null : String(row.published_at),
      sourceUrl: optionalText(row.canonical_url),
      transcriptSource: null,
    };
  });
}

/**
 * Read-only brief corpus. One newest successful run per episode, current extraction
 * version preferred, editorial notes only. Does not call a model.
 */
export async function loadCreatorNotesBrief(): Promise<BriefEpisode[]> {
  if (!intelDbConfigured()) return [];

  const { data: recentRows, error: recentError } = await client()
    .from('creator_note_runs')
    .select(RUN_SELECT_COLUMNS)
    .eq('status', 'success')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(CREATOR_NOTES_BRIEF_RUN_SCAN_LIMIT);
  if (recentError) throw new Error(`creator_note_runs brief scan: ${recentError.message}`);

  const recent = ((recentRows || []) as Record<string, unknown>[]).map(asRun);
  const sourceItemIds: string[] = [];
  for (const run of recent) {
    if (!sourceItemIds.includes(run.sourceItemId)) sourceItemIds.push(run.sourceItemId);
    if (sourceItemIds.length >= CREATOR_NOTES_BRIEF_EPISODE_LIMIT * 2) break;
  }
  if (!sourceItemIds.length) return [];

  const { data: runRows, error: runsError } = await client()
    .from('creator_note_runs')
    .select(RUN_SELECT_COLUMNS)
    .eq('status', 'success')
    .in('source_item_id', sourceItemIds);
  if (runsError) throw new Error(`creator_note_runs brief select: ${runsError.message}`);
  const runs = ((runRows || []) as Record<string, unknown>[]).map(asRun);

  const winningIds = sourceItemIds
    .map((sourceItemId) => selectWinningSuccessRun(runs.filter((run) => run.sourceItemId === sourceItemId)))
    .filter((run): run is CreatorNoteRun => Boolean(run))
    .map((run) => run.id);
  if (!winningIds.length) return [];

  const { data: noteRows, error: notesError } = await client()
    .from('creator_atomic_notes')
    .select(NOTE_SELECT_COLUMNS)
    .in('extraction_run_id', winningIds);
  if (notesError) throw new Error(`creator_atomic_notes brief select: ${notesError.message}`);
  const notes = ((noteRows || []) as Record<string, unknown>[]).map(asNote);
  const metas = await loadBriefEpisodeMeta(sourceItemIds);

  return selectBriefEpisodes({ runs, notes, metas, limit: CREATOR_NOTES_BRIEF_EPISODE_LIMIT });
}

export function reviewMemoryCreatorNotes(
  store: { notes: CreatorAtomicNote[]; runs: CreatorNoteRun[] },
  query: CreatorNotesReviewQuery,
  catalog?: Parameters<typeof reviewCreatorNotes>[0]['catalog'],
): CreatorNotesReviewResult {
  return reviewCreatorNotes({
    notes: store.notes,
    runs: store.runs,
    catalog,
    query,
  });
}
