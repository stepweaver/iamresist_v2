import 'server-only';

import { intelDbConfigured } from '@/lib/intel/db';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { asNoteFromRow } from '@/lib/eventThreads/noteAdapter';
import { EVENT_THREADS_INTEL_CANDIDATE_LIMIT, EVENT_THREADS_TIME_PROXIMITY_DAYS } from '@/lib/eventThreads/constants';
import { isIntelOsintLane } from '@/lib/eventThreads/intelLinks';
import type {
  EventThreadsNoteReader,
  EventThreadsWriter,
  IntelOsintCandidate,
  ProposedEventThread,
  SearchIntelOsintFn,
} from '@/lib/eventThreads/types';

function client() {
  return supabaseAdmin().schema('intel');
}

const NOTE_SELECT_COLUMNS =
  'id, extraction_run_id, source_item_id, creator_id, start_seconds, end_seconds, kind, text, attribution, event_features, source_excerpt, exact_quote, source_segment_indexes, verification_status, note_fingerprint, created_at';

export function createSupabaseAtomicNotesReader(): EventThreadsNoteReader {
  return {
    async loadNotesBySourceItemId(sourceItemId: string) {
      if (!intelDbConfigured()) {
        throw new Error('Supabase not configured');
      }
      const { data, error } = await client()
        .from('creator_atomic_notes')
        .select(NOTE_SELECT_COLUMNS)
        .eq('source_item_id', sourceItemId)
        .order('start_seconds', { ascending: true, nullsFirst: false });
      if (error) throw new Error(`creator_atomic_notes select: ${error.message}`);
      return ((data || []) as Record<string, unknown>[]).map(asNoteFromRow);
    },
  };
}

export function createSupabaseIntelOsintSearch(): SearchIntelOsintFn {
  return async (input) => {
    if (!intelDbConfigured()) return [];
    const limit = Math.min(EVENT_THREADS_INTEL_CANDIDATE_LIMIT, Math.max(1, input.limit || 50));
    let query = client()
      .from('source_items')
      .select('id, title, summary, canonical_url, published_at, desk_lane, sources(name, slug, desk_lane)')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit * 2);

    if (input.publishedFrom) query = query.gte('published_at', input.publishedFrom);
    if (input.publishedTo) query = query.lte('published_at', input.publishedTo);

    const { data, error } = await query;
    if (error) throw new Error(`source_items event-thread search: ${error.message}`);

    const rows = (data || []) as Array<Record<string, unknown>>;
    const candidates: IntelOsintCandidate[] = [];
    for (const row of rows) {
      const sources = row.sources as { name?: string; desk_lane?: string } | null;
      const deskLane = String(row.desk_lane || sources?.desk_lane || '');
      if (deskLane === 'voices') continue;
      if (deskLane && !isIntelOsintLane(deskLane)) continue;
      candidates.push({
        id: String(row.id),
        title: String(row.title || ''),
        summary: row.summary == null ? null : String(row.summary),
        canonicalUrl: String(row.canonical_url || ''),
        publishedAt: row.published_at == null ? null : String(row.published_at),
        deskLane: deskLane || 'osint',
        sourceName: sources?.name ? String(sources.name) : null,
      });
      if (candidates.length >= limit) break;
    }
    return candidates;
  };
}

export function defaultIntelSearchWindowDays(): number {
  return EVENT_THREADS_TIME_PROXIMITY_DAYS;
}

export async function persistEventThreads(_threads: ProposedEventThread[], _writer: EventThreadsWriter): Promise<never> {
  throw new Error('Event Threads V1 persistence is disabled');
}
