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

export function journalPageTouchedAfterPublish(entry) {
  const primaryKey = primaryYmd(entry);
  const editedKey = entry?.lastEditedTime ? String(entry.lastEditedTime).slice(0, 10) : '';
  return Boolean(primaryKey && editedKey && editedKey > primaryKey);
}

export function compareJournalEntries(a, b) {
  const aKey = primaryYmd(a);
  const bKey = primaryYmd(b);
  if (aKey !== bKey) return aKey < bKey ? 1 : -1;
  const aCreated = String(a?.createdTime || '');
  const bCreated = String(b?.createdTime || '');
  if (aCreated !== bCreated) return aCreated < bCreated ? 1 : -1;
  return String(a?.title || '').localeCompare(String(b?.title || ''));
}

export function journalDates(entry) {
  const primaryKey = primaryYmd(entry);
  const editedKey = entry?.bodyEditedTime ? String(entry.bodyEditedTime).slice(0, 10) : '';
  const showUpdated = Boolean(primaryKey && editedKey && editedKey > primaryKey);

  let primaryLabel = '';
  if (entry?.date) primaryLabel = formatJournalMetaDate(entry.date);
  else if (entry?.createdTime) primaryLabel = formatJournalMetaDate(entry.createdTime);

  const updatedLabel =
    showUpdated && entry.bodyEditedTime ? formatJournalMetaDate(entry.bodyEditedTime) : '';

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

export function journalEntryPath(entry) {
  const slug = String(entry?.slug || entry?.id || '').trim();
  return slug ? `/journal/${slug}` : '/journal';
}

export function journalDisplayExcerpt(entry, blockExcerpt = '') {
  const summary = String(entry?.summary || '').replace(/\s+/g, ' ').trim();
  if (summary) return summary;
  return String(blockExcerpt || entry?.excerpt || '').replace(/\s+/g, ' ').trim();
}

export function journalTagsMatch(a, b) {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  return Boolean(left) && left === right;
}

export function readJournalTagParam(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

export function toggleJournalTag(current, next) {
  const tag = readJournalTagParam(next);
  if (!tag || journalTagsMatch(current, tag)) return '';
  return tag;
}

export function selectFeaturedJournalEntry(entries) {
  const list = [...(entries || [])].filter(Boolean);
  if (!list.length) return null;
  const flagged = list.filter((entry) => entry.featured === true);
  const pool = flagged.length ? flagged : list;
  return [...pool].sort(compareJournalEntries)[0] || null;
}

export function selectRecentJournalEntries(entries, { excludeId, excludeSlug, limit = 4 } = {}) {
  const sorted = [...(entries || [])].filter(Boolean).sort(compareJournalEntries);
  const seen = new Set();
  const recent = [];
  for (const entry of sorted) {
    const id = entry?.id ? String(entry.id) : '';
    const slug = entry?.slug ? String(entry.slug) : '';
    if (excludeId && id && id === String(excludeId)) continue;
    if (excludeSlug && slug && slug === String(excludeSlug)) continue;
    const key = id || slug;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    recent.push(entry);
    if (recent.length >= limit) break;
  }
  return recent;
}

export function selectHomepageEssays(entries, limit = 3) {
  const unique = selectRecentJournalEntries(entries, { limit });
  return {
    latest: unique[0] || null,
    recent: unique.slice(1),
  };
}

export const SUGGESTED_JOURNAL_SUBJECTS = [
  'Power & Accountability',
  'Propaganda & Truth',
  'Democracy & Law',
];

export function journalSubjectTags(entries, { limit = 12 } = {}) {
  const counts = new Map();
  for (const entry of entries || []) {
    const tags = Array.isArray(entry?.tags) ? entry.tags : [];
    const seenOnEntry = new Set();
    for (const tag of tags) {
      const name = String(tag || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenOnEntry.has(key)) continue;
      seenOnEntry.add(key);
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { name, count: 1 });
    }
  }

  const actual = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
  const byKey = new Map(actual.map((item) => [item.name.toLowerCase(), item.name]));
  const suggested = SUGGESTED_JOURNAL_SUBJECTS.map((label) => byKey.get(label.toLowerCase())).filter(
    Boolean,
  );
  const names = suggested.length ? suggested : actual.map((item) => item.name);
  const cap = Number.isFinite(limit) && limit > 0 ? limit : names.length;
  return names.slice(0, cap);
}

export function composeJournalLanding(entries, { recentLimit = 4 } = {}) {
  const ordered = [...(entries || [])].filter(Boolean).sort(compareJournalEntries);
  const featured = selectFeaturedJournalEntry(ordered);
  const recent = selectRecentJournalEntries(ordered, {
    excludeId: featured?.id,
    excludeSlug: featured?.slug,
    limit: recentLimit,
  });
  return {
    ordered,
    featured,
    recent,
    subjects: journalSubjectTags(ordered),
  };
}

export function toJournalRecord(entry, { excerpt = '' } = {}) {
  const dates = journalDates(entry || {});
  return {
    id: entry?.id || entry?.slug || '',
    href: journalEntryPath(entry),
    title: entry?.title || 'Untitled Entry',
    dateLabel: dates.displayLabel,
    dateTime: dates.dateTime,
    updatedLabel: dates.showUpdated ? dates.updatedLabel : '',
    updatedDateTime: dates.updatedDateTime,
    tags: Array.isArray(entry?.tags) ? entry.tags.filter(Boolean) : [],
    author: entry?.author ? String(entry.author) : '',
    excerpt: String(excerpt || '').trim() || journalDisplayExcerpt(entry),
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

export function filterJournalRecordsByTag(records, tag) {
  const needle = String(tag || '').trim().toLowerCase();
  if (!needle) return records || [];
  return (records || []).filter((record) =>
    (record?.tags || []).some((item) => journalTagsMatch(item, needle)),
  );
}
