function normalizeWhitespace(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function stripEditorialSignature(value) {
  return value.replace(/\s*-\s*\[RESIST\]\s*$/i, '').trim();
}

export function normalizeSeoText(value) {
  return normalizeWhitespace(stripEditorialSignature(String(value || '')));
}

export function truncateSeoText(value, maxLength = 180) {
  const text = normalizeSeoText(value);
  if (!text) return '';
  if (!Number.isFinite(maxLength) || maxLength < 1 || text.length <= maxLength) {
    return text;
  }

  const boundary = text.lastIndexOf(' ', maxLength - 3);
  const cutAt = boundary >= Math.floor(maxLength * 0.6) ? boundary : maxLength - 3;
  return `${text.slice(0, cutAt).trimEnd()}...`;
}

export function joinSeoDescriptionParts(parts, maxLength = 180) {
  const text = normalizeSeoText(
    (Array.isArray(parts) ? parts : [parts]).filter(Boolean).join(' ')
  );
  return truncateSeoText(text, maxLength);
}

export function pickSeoDescription(candidates, fallback = '', maxLength = 180) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  for (const candidate of list) {
    const text = truncateSeoText(candidate, maxLength);
    if (text) return text;
  }
  return truncateSeoText(fallback, maxLength);
}

function extractBlockText(block) {
  if (!block?.type) return '';

  const content = block[block.type];
  if (content?.rich_text && Array.isArray(content.rich_text)) {
    return normalizeSeoText(content.rich_text.map((part) => part?.plain_text || '').join(' '));
  }

  return '';
}

export function extractSeoTextFromBlocks(blocks, { maxBlocks = 4 } = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  const limit = Number.isFinite(maxBlocks) && maxBlocks > 0 ? maxBlocks : blocks.length;
  const parts = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (!text) continue;
    parts.push(text);
    if (parts.length >= limit) break;
  }

  return parts.join(' ');
}

export function buildSeoExcerptFromBlocks(blocks, { maxBlocks = 4, maxLength = 180 } = {}) {
  return truncateSeoText(extractSeoTextFromBlocks(blocks, { maxBlocks }), maxLength);
}
