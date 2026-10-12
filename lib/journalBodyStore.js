import 'server-only';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { nextBodyRevision } from '@/lib/journalBody';

function revisionFromRow(row) {
  if (!row) return null;
  return {
    contentHash: row.content_hash,
    bodyEditedTime: row.body_edited_at || null,
  };
}

/**
 * Page id → body edit time, only after the writing changes from the copy we
 * already stored. If the store is missing, show no Updated label.
 */
export async function resolveBodyEditedTimes(items, now = new Date().toISOString()) {
  const list = (items || []).filter((item) => item?.id && item.hash);
  const editedAt = new Map();
  if (!list.length) return editedAt;

  let supabase;
  try {
    supabase = supabaseAdmin();
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[journal] body revision store unavailable', err?.message || err);
    }
    return editedAt;
  }

  const { data, error } = await supabase
    .from('journal_body_revisions')
    .select('page_id, content_hash, body_edited_at')
    .in(
      'page_id',
      list.map((item) => item.id),
    );

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[journal] body revision lookup failed', error.message || error);
    }
    return editedAt;
  }

  const stored = new Map((data || []).map((row) => [row.page_id, revisionFromRow(row)]));
  const baselines = [];
  const changes = [];

  for (const item of list) {
    const next = nextBodyRevision(stored.get(item.id), item.hash, now);
    if (next.bodyEditedTime) editedAt.set(item.id, next.bodyEditedTime);
    if (!next.write) continue;
    const row = {
      page_id: item.id,
      content_hash: next.contentHash,
      body_edited_at: next.bodyEditedTime,
      updated_at: now,
    };
    if (next.bodyEditedTime) changes.push(row);
    else baselines.push(row);
  }

  if (baselines.length) {
    const { error: insertError } = await supabase
      .from('journal_body_revisions')
      .upsert(baselines, { onConflict: 'page_id', ignoreDuplicates: true });
    if (insertError && process.env.NODE_ENV === 'development') {
      console.warn('[journal] body revision baseline failed', insertError.message || insertError);
    }
  }

  if (changes.length) {
    const { error: updateError } = await supabase
      .from('journal_body_revisions')
      .upsert(changes, { onConflict: 'page_id' });
    if (updateError && process.env.NODE_ENV === 'development') {
      console.warn('[journal] body revision update failed', updateError.message || updateError);
    }
  }

  return editedAt;
}
