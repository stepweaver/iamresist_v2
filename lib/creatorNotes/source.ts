import 'server-only';

import { intelDbConfigured, fetchSourceItemById } from '@/lib/intel/db';
import type { CreatorTranscriptInput } from '@/lib/creatorNotes/types';

export async function loadCreatorSourceMetadata(
  sourceItemId: string,
): Promise<Partial<CreatorTranscriptInput> | null> {
  const id = String(sourceItemId || '').trim();
  if (!id || !intelDbConfigured()) return null;

  const row = await fetchSourceItemById(id);
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
