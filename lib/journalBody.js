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
 * The first time we see a body, remember it and do not call it an update.
 * A later text change records that moment. Opening the page does not.
 */
export function nextBodyRevision(previous, hash, now) {
  if (!previous) {
    return { contentHash: hash, bodyEditedTime: null, write: true };
  }
  if (previous.contentHash === hash) {
    return {
      contentHash: hash,
      bodyEditedTime: previous.bodyEditedTime || null,
      write: false,
    };
  }
  return { contentHash: hash, bodyEditedTime: now, write: true };
}
