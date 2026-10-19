import { journalEntryPath } from '@/components/journal/journalFormat';

export function journalOgTitle(title) {
  const clean = String(title || 'Essay')
    .replace(/\s+/g, ' ')
    .trim();
  const text = clean || 'Essay';
  if (text.length <= 140) return text;
  const boundary = text.lastIndexOf(' ', 140);
  const cutAt = boundary >= 80 ? boundary : 140;
  return `${text.slice(0, cutAt).trim()}…`;
}

export function journalOgTitleSize(title) {
  const length = journalOgTitle(title).length;
  if (length > 100) return 46;
  if (length > 70) return 56;
  if (length > 42) return 68;
  return 80;
}

export function journalOgImage(entry) {
  const title = entry?.title || 'Essay';
  return {
    url: `${journalEntryPath(entry)}/og`,
    width: 1200,
    height: 630,
    alt: `${title} | I AM [RESIST]`,
  };
}
