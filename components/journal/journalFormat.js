import {
  journalEditorialDisplaySrc,
  resolveJournalEditorialImage,
} from '@/lib/notion/journalImage';
import { formatJournalMetaDate } from '@/lib/utils/date';

function calendarYmd(value) {
  if (value == null || value === '') return '';
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function journalPublishedOn(entry) {
  return primaryYmd(entry);
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

export function journalReadingMinutes(text) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (words < 80) return 0;
  return Math.max(1, Math.round(words / 230));
}

function blockPlainText(block) {
  const type = block?.type;
  const rich = type ? block?.[type]?.rich_text : null;
  if (!Array.isArray(rich)) return '';
  return rich.map((part) => part?.plain_text || '').join(' ');
}

export function journalReadingMinutesFromBlocks(blocks) {
  const text = (Array.isArray(blocks) ? blocks : []).map(blockPlainText).join(' ');
  return journalReadingMinutes(text);
}

export function journalReadingLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 1) return '';
  return `${Math.round(value)} min read`;
}

/**
 * Uses the written Summary when one exists. Loads the body once for a missing
 * deck or a missing reading time. Never invents either.
 */
export async function journalLeadPresentation(entry, loadBlocks) {
  const stored = Number(entry?.readingMinutes) || 0;
  const summary = journalDisplayExcerpt(entry);
  if (!entry?.id || typeof loadBlocks !== 'function') {
    return { excerpt: summary, readingMinutes: stored };
  }
  if (summary && stored) return { excerpt: summary, readingMinutes: stored };
  try {
    const blocks = await loadBlocks(entry);
    return {
      excerpt: summary || journalDisplayExcerpt(entry, journalLeadExcerpt(Array.isArray(blocks) ? blocks : [])),
      readingMinutes: stored || journalReadingMinutesFromBlocks(blocks),
    };
  } catch {
    return { excerpt: summary, readingMinutes: stored };
  }
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

export function sameJournalEntry(a, b) {
  if (!a || !b) return false;
  const aId = a.id ? String(a.id) : '';
  const bId = b.id ? String(b.id) : '';
  if (aId && bId && aId === bId) return true;
  const aSlug = a.slug ? String(a.slug) : '';
  const bSlug = b.slug ? String(b.slug) : '';
  return Boolean(aSlug) && aSlug === bSlug;
}

/** Newest essay an editor marked Featured. A newer publication does not take this slot. */
export function selectFeaturedJournalEntry(entries) {
  const flagged = [...(entries || [])].filter((entry) => entry?.featured === true);
  if (!flagged.length) return null;
  return [...flagged].sort(compareJournalEntries)[0] || null;
}

export function selectRecentJournalEntries(entries, { excludeId, excludeSlug, exclude = [], limit = 4 } = {}) {
  const excludedIds = new Set();
  const excludedSlugs = new Set();
  if (excludeId) excludedIds.add(String(excludeId));
  if (excludeSlug) excludedSlugs.add(String(excludeSlug));
  for (const entry of exclude || []) {
    if (entry?.id) excludedIds.add(String(entry.id));
    if (entry?.slug) excludedSlugs.add(String(entry.slug));
  }

  const sorted = [...(entries || [])].filter(Boolean).sort(compareJournalEntries);
  const seen = new Set();
  const recent = [];
  for (const entry of sorted) {
    const id = entry?.id ? String(entry.id) : '';
    const slug = entry?.slug ? String(entry.slug) : '';
    if (id && excludedIds.has(id)) continue;
    if (slug && excludedSlugs.has(slug)) continue;
    const key = id || slug;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    recent.push(entry);
    if (recent.length >= limit) break;
  }
  return recent;
}

/**
 * Homepage composition:
 * - featured: the manually checked essay, kept even after a newer essay publishes
 * - latest: the newest published essay
 * - recent: other essays, excluding both of the above
 * The same essay is never returned in more than one slot.
 */
export function selectHomepageEssays(entries, limit = 3) {
  const list = [...(entries || [])].filter(Boolean);
  const featured = selectFeaturedJournalEntry(list);
  const latest = [...list].sort(compareJournalEntries)[0] || null;
  const recentLimit = Number.isFinite(limit) ? Math.max(0, limit - 1) : 2;
  const recent = latest
    ? selectRecentJournalEntries(list, {
        exclude: [featured, latest].filter(Boolean),
        limit: recentLimit,
      })
    : [];
  return {
    featured,
    latest,
    recent,
    explicitlyFeatured: Boolean(featured),
  };
}

export function homepageEssayLabel(selection) {
  return selection?.explicitlyFeatured ? 'Featured Essay' : 'Latest Essay';
}

/** Crop photographs only when an editor asks. Diagrams, charts, and SVGs stay whole. */
export function journalImageFit(source) {
  if (!source || typeof source !== 'object') return 'contain';
  const declared = source.imageFit || source.fit || '';
  const url = String(
    source.propertyImage?.url || source.coverImage?.url || source.url || source.src || '',
  );
  if (/\.svg(?:$|[?#])/i.test(url)) return 'contain';
  return declared === 'crop' ? 'crop' : 'contain';
}

export function journalListingImage(entry, blocks = []) {
  if (entry?.image?.src) {
    return {
      src: String(entry.image.src),
      alt: String(entry.image.alt || ''),
      width: entry.image.width || undefined,
      height: entry.image.height || undefined,
      fit: entry.image.fit || journalImageFit(entry),
      caption: entry.image.caption || '',
    };
  }
  const editorial = resolveJournalEditorialImage({
    propertyImage: entry?.propertyImage,
    coverImage: entry?.coverImage,
    blocks,
    title: entry?.title,
  });
  const src = journalEditorialDisplaySrc(editorial, journalEntryPath(entry));
  if (!src) return null;
  return {
    src,
    alt: editorial.alt || '',
    width: undefined,
    height: undefined,
    fit: journalImageFit({ ...entry, url: editorial.url }),
    caption: editorial.caption || '',
  };
}

/**
 * Uses a property or cover image when one is already on the entry.
 * Body artwork is read only when allowBody is set and the caller supplies blocks.
 */
export async function resolveListingImage(entry, loadBlocks, { allowBody = false } = {}) {
  const direct = journalListingImage(entry);
  if (direct || !allowBody || !entry?.id || typeof loadBlocks !== 'function') return direct;
  try {
    const blocks = await loadBlocks(entry);
    return journalListingImage(entry, Array.isArray(blocks) ? blocks : []);
  } catch {
    return null;
  }
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

/**
 * Journal landing: the newest essay leads. A manually featured essay stays in
 * the supporting spread when it is not itself the latest. Nothing is repeated.
 */
export function composeJournalLanding(entries, { recentLimit = 3 } = {}) {
  const ordered = [...(entries || [])].filter(Boolean).sort(compareJournalEntries);
  const lead = ordered[0] || null;
  const featured = selectFeaturedJournalEntry(ordered);
  const cap = Number.isFinite(recentLimit) && recentLimit > 0 ? recentLimit : 0;
  const supporting = [];
  if (featured && !sameJournalEntry(featured, lead)) supporting.push(featured);
  const rest = selectRecentJournalEntries(ordered, {
    exclude: [lead, ...supporting].filter(Boolean),
    limit: Math.max(0, cap - supporting.length),
  });
  return {
    ordered,
    lead,
    featured,
    recent: [...supporting, ...rest],
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
    image: journalListingImage(entry),
    featured: entry?.featured === true,
    readingLabel: journalReadingLabel(entry?.readingMinutes),
    pullQuote: String(entry?.pullQuote || '').replace(/\s+/g, ' ').trim(),
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

export function journalRecordKey(record) {
  return String(record?.id || record?.slug || record?.href || '');
}

/** Default archive listing omits essays already shown as featured or recent. */
export function omitPinnedJournalRecords(records, pinnedIds = []) {
  const pinned = new Set((pinnedIds || []).map((id) => String(id || '')).filter(Boolean));
  if (!pinned.size) return records || [];
  return (records || []).filter((record) => !pinned.has(journalRecordKey(record)));
}

/**
 * Up to `limit` other published essays that share a subject tag.
 * The current essay is excluded. Ties follow publication order.
 */
export function selectRelatedJournalEssays(entries, current, { limit = 2 } = {}) {
  const currentId = current?.id ? String(current.id) : '';
  const currentSlug = current?.slug ? String(current.slug) : '';
  const tags = new Set(
    (Array.isArray(current?.tags) ? current.tags : [])
      .map((tag) => String(tag || '').trim().toLowerCase())
      .filter(Boolean),
  );
  if (!tags.size) return [];

  const cap = Number.isFinite(limit) && limit > 0 ? limit : 2;
  const seen = new Set();
  const ranked = [];

  for (const entry of [...(entries || [])].filter(Boolean)) {
    const id = entry?.id ? String(entry.id) : '';
    const slug = entry?.slug ? String(entry.slug) : '';
    if ((currentId && id === currentId) || (currentSlug && slug === currentSlug)) continue;
    const key = id || slug;
    if (key && seen.has(key)) continue;
    const overlap = (Array.isArray(entry.tags) ? entry.tags : []).reduce((count, tag) => {
      const name = String(tag || '').trim().toLowerCase();
      return name && tags.has(name) ? count + 1 : count;
    }, 0);
    if (!overlap) continue;
    if (key) seen.add(key);
    ranked.push({ entry, overlap });
  }

  ranked.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return compareJournalEntries(a.entry, b.entry);
  });

  return ranked.slice(0, cap).map((item) => item.entry);
}

export function listJournalArchive(records, { query = '', tag = '', pinnedIds = [] } = {}) {
  const scoped = filterJournalRecordsByTag(records, tag);
  const filtered = filterJournalRecords(scoped, query);
  const browsingDefault = !String(query || '').trim() && !String(tag || '').trim();
  return {
    listed: browsingDefault ? omitPinnedJournalRecords(filtered, pinnedIds) : filtered,
    browsingDefault,
    scoped,
    filtered,
  };
}

export function filterJournalRecordsByTag(records, tag) {
  const needle = String(tag || '').trim().toLowerCase();
  if (!needle) return records || [];
  return (records || []).filter((record) =>
    (record?.tags || []).some((item) => journalTagsMatch(item, needle)),
  );
}
