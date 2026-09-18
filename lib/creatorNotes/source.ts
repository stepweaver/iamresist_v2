import 'server-only';

import { isUuid } from '@/lib/creatorNotes/identity';
import type { CreatorTranscriptInput } from '@/lib/creatorNotes/types';
import { intelDbConfigured, fetchSourceItemById } from '@/lib/intel/db';

type SourceItemMetadataRow = {
  id: string;
  title?: string | null;
  canonical_url?: string | null;
  published_at?: string | null;
  desk_lane?: string | null;
  sources?: {
    name?: string | null;
    slug?: string | null;
    desk_lane?: string | null;
  } | null;
};

export type LoadCreatorSourceMetadataDeps = {
  dbConfigured?: () => boolean;
  fetchById?: (id: string) => Promise<SourceItemMetadataRow | null>;
};

export function shouldLookupCreatorSourceMetadata(dryRun: boolean): boolean {
  return !dryRun;
}

export async function loadCreatorSourceMetadata(
  sourceItemId: string,
  deps: LoadCreatorSourceMetadataDeps = {},
): Promise<Partial<CreatorTranscriptInput> | null> {
  const id = String(sourceItemId || '').trim();
  if (!id) return null;
  // Calibration IDs are stable strings, not intel UUIDs. Skip UUID-column lookup.
  if (!isUuid(id)) return null;

  const configured = deps.dbConfigured ? deps.dbConfigured() : intelDbConfigured();
  if (!configured) return null;

  const fetchById = deps.fetchById || fetchSourceItemById;
  const row = await fetchById(id);
  if (!row) return null;

  const isVoice = row.desk_lane === 'voices' || row.sources?.desk_lane === 'voices';
  const sourceName = row.sources?.name || null;
  const sourceSlug = row.sources?.slug || null;

  return {
    sourceItemId: row.id,
    creatorId: isVoice ? sourceSlug : null,
    creatorName: isVoice ? sourceName : null,
    sourceTitle: row.title || null,
    sourceUrl: row.canonical_url || null,
    publishedAt: row.published_at || null,
    sourceIdentityKey: row.canonical_url || null,
  };
}
