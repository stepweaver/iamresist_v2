import 'server-only';
import { notion, READING_JOURNAL_DB_ID } from '@/lib/notion/client';
import { paginate } from '@/lib/notion/paginate';

function normalizeId(id) {
  if (!id) return null;
  const clean = String(id).replace(/-/g, '');
  if (clean.length !== 32) return String(id);
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(
    16,
    20,
  )}-${clean.slice(20)}`;
}

function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function textFromTitle(prop) {
  return prop?.title?.[0]?.plain_text ?? '';
}

function textFromRichText(prop) {
  return (prop?.rich_text ?? []).map((t) => t.plain_text).join('') ?? '';
}

function multiSelect(prop) {
  return (prop?.multi_select ?? []).map((x) => x.name).filter(Boolean);
}

function relationFirstId(prop) {
  const first = prop?.relation?.[0]?.id;
  return first ? normalizeId(first) : null;
}

function statusName(prop) {
  if (!prop) return null;
  if (prop.select) return prop.select?.name ?? null;
  if (prop.status) return prop.status?.name ?? null;
  return null;
}

function mapEntry(page) {
  const p = page.properties ?? {};
  const title = textFromTitle(p.Title) || textFromTitle(p.Name);
  const slug = textFromRichText(p.Slug) || slugify(title);

  return {
    id: page.id,
    status: statusName(p.Status),
    title,
    slug,
    content: textFromRichText(p.Content) || '',
    bookId: relationFirstId(p.Book),
    tags: multiSelect(p.Tags),
    chapterPage: textFromRichText(p['Chapter/Page']) || null,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

function isPublished(entry) {
  if (!entry?.status) return true;
  return entry.status === 'Published';
}

export async function getBookEntries(bookId, { limit } = {}) {
  if (!notion || !READING_JOURNAL_DB_ID) return [];
  if (!bookId) return [];

  const normalizedBookId = normalizeId(bookId);

  try {
    const query = (cursor) =>
      notion.databases.query({
        database_id: READING_JOURNAL_DB_ID,
        start_cursor: cursor,
        page_size: 100,
        filter: {
          property: 'Book',
          relation: { contains: normalizedBookId },
        },
        sorts: [
          {
            timestamp: 'last_edited_time',
            direction: 'descending',
          },
        ],
      });

    const results = await paginate(query, { limit });
    return (results ?? []).map(mapEntry).filter(isPublished);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[readingJournal.repo] getBookEntries', err);
    }
    return [];
  }
}

