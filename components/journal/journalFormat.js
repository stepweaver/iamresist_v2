import { formatJournalMetaDate } from '@/lib/utils/date';

function calendarYmd(value) {
  if (value == null || value === '') return '';
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function primaryYmd(entry) {
  const fromProp = calendarYmd(entry?.date);
  if (fromProp) return fromProp;
  if (entry?.createdTime) return String(entry.createdTime).slice(0, 10);
  return '';
}

export function journalDates(entry) {
  const primaryKey = primaryYmd(entry);
  const editedKey = entry?.lastEditedTime
    ? String(entry.lastEditedTime).slice(0, 10)
    : '';
  const showUpdated = Boolean(
    primaryKey && editedKey && editedKey > primaryKey && entry.lastEditedTime,
  );

  let primaryLabel = '';
  if (entry?.date) primaryLabel = formatJournalMetaDate(entry.date);
  else if (entry?.createdTime) primaryLabel = formatJournalMetaDate(entry.createdTime);

  const updatedLabel =
    showUpdated && entry.lastEditedTime
      ? formatJournalMetaDate(entry.lastEditedTime)
      : '';

  const fallbackSingle =
    !primaryLabel && entry?.lastEditedTime
      ? formatJournalMetaDate(entry.lastEditedTime)
      : '';

  return {
    primaryLabel,
    showUpdated,
    updatedLabel,
    fallbackSingle,
    dateTime: primaryKey,
    updatedDateTime: showUpdated ? editedKey : '',
    displayLabel: primaryLabel || fallbackSingle,
  };
}

export function journalLeadExcerpt(blocks, maxLength = 340) {
  if (!Array.isArray(blocks) || maxLength < 1) return '';

  const paragraphs = [];
  for (const block of blocks) {
    if (block?.type !== 'paragraph') continue;
    const text = (block.paragraph?.rich_text || [])
      .map((part) => part?.plain_text || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    paragraphs.push(text);
    if (paragraphs.length >= 4) break;
  }

  const text = paragraphs.find((paragraph) => paragraph.length >= 80) || paragraphs[0] || '';
  if (!text) return '';
  if (text.length <= maxLength) return text;

  const boundary = text.lastIndexOf(' ', maxLength);
  const cutAt = boundary >= Math.floor(maxLength * 0.6) ? boundary : maxLength;
  return `${text.slice(0, cutAt).trim()}…`;
}

export function toJournalRecord(entry, { excerpt = '' } = {}) {
  const dates = journalDates(entry || {});
  const slug = entry?.slug || entry?.id || '';
  return {
    id: entry?.id || slug,
    href: `/journal/${slug}`,
    title: entry?.title || 'Untitled Entry',
    dateLabel: dates.displayLabel,
    dateTime: dates.dateTime,
    updatedLabel: dates.showUpdated ? dates.updatedLabel : '',
    updatedDateTime: dates.updatedDateTime,
    tags: Array.isArray(entry?.tags) ? entry.tags.filter(Boolean) : [],
    author: entry?.author ? String(entry.author) : '',
    excerpt: excerpt || entry?.excerpt || '',
    searchDate: entry?.date ? String(entry.date) : dates.dateTime,
  };
}

export function filterJournalRecords(records, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return records || [];
  return (records || []).filter((record) => {
    const haystack = [
      record?.title,
      record?.dateLabel,
      record?.updatedLabel,
      record?.searchDate,
      record?.author,
      record?.excerpt,
      ...(record?.tags || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}
