import { createHash } from 'node:crypto';

function blockPlainText(block) {
  const type = block?.type;
  const rich = type ? block?.[type]?.rich_text : null;
  if (!Array.isArray(rich)) return '';
  return rich
    .map((part) => part?.plain_text || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Newest text-block edit after the publication day.
 * Page opens and property edits move the page timestamp without changing this.
 */
export function latestRevisedBlockTime(blocks, publishedOn) {
  const published = String(publishedOn || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(published)) return null;

  let latest = '';
  for (const block of blocks || []) {
    if (!blockPlainText(block)) continue;
    const edited = String(block?.last_edited_time || '');
    const day = edited.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day <= published) continue;
    if (edited > latest) latest = edited;
  }
  return latest || null;
}

/** Fingerprint of the writing. Notion's edit timestamp is not part of it. */
export function journalBodyHash(blocks) {
  const parts = [];
  for (const block of blocks || []) {
    const text = blockPlainText(block);
    if (!text) continue;
    parts.push(`${block.type}\n${text}`);
  }
  return createHash('sha256').update(parts.join('\n\n')).digest('hex');
}

/**
 * Remember each body we see. Opening the page does not count.
 * A text block revised after publication does, including the first copy we store
 * when that revision already happened. A later text change records the new moment.
 */
export function nextBodyRevision(previous, hash, now, observedEditTime = null) {
  const noticed = observedEditTime || null;
  if (!previous) {
    return { contentHash: hash, bodyEditedTime: noticed, write: true };
  }
  if (previous.contentHash === hash) {
    if (!previous.bodyEditedTime && noticed) {
      return { contentHash: hash, bodyEditedTime: noticed, write: true };
    }
    return {
      contentHash: hash,
      bodyEditedTime: previous.bodyEditedTime || null,
      write: false,
    };
  }
  return { contentHash: hash, bodyEditedTime: noticed || now, write: true };
}
