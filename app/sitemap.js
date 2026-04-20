import { BASE_URL } from '@/lib/metadata';
import { PRODUCT_SLUGS } from '@/lib/shopProducts';
import { slugify } from '@/lib/utils/slugify';
import { getAllBooks } from '@/lib/notion/books.repo';
import { getJournalEntries } from '@/lib/notion/journal.repo';
import { getBookEntries } from '@/lib/notion/readingJournal.repo';
import { getVideos } from '@/lib/notion/videos.repo';
import { getAllProtestSongs } from '@/lib/notion/protestMusic.repo';

const STATIC_PATHS = [
  '/',
  '/about',
  '/timeline',
  '/telescreen',
  '/journal',
  '/voices',
  '/book-club',
  '/resources',
  '/subscribe',
  '/shop',
  '/posts',
  '/intel',
  '/intel/live',
  '/intel/newswire',
  '/intel/voices',
  '/intel/sources',
  '/intel/watchdogs',
  '/intel/osint',
  '/intel/defense',
  '/intel/indicators',
  '/intel/statements',
];

const BOOK_STATUSES = ['Reading', 'Pending', 'Completed', 'Shelf'];

function toAbsoluteUrl(path) {
  return new URL(path, BASE_URL).toString();
}

function toDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function buildEntry(path, lastModified) {
  const entry = {
    url: toAbsoluteUrl(path),
  };

  const normalizedDate = toDate(lastModified);
  if (normalizedDate) {
    entry.lastModified = normalizedDate;
  }

  return entry;
}

function buildEntries(paths) {
  return paths.map((path) => buildEntry(path));
}

async function safeList(loader) {
  try {
    const value = await loader();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function getBookEntryRows(books) {
  const noteLists = await Promise.all(
    books.map((book) =>
      safeList(() => getBookEntries(book.id, { limit: 100 })).then((notes) =>
        notes.map((note) => ({ book, note })),
      ),
    ),
  );

  return noteLists.flat();
}

export default async function sitemap() {
  const [journalEntries, books, videos, songs] = await Promise.all([
    safeList(() => getJournalEntries()),
    safeList(() => getAllBooks({ statuses: BOOK_STATUSES })),
    safeList(() => getVideos()),
    safeList(() => getAllProtestSongs()),
  ]);

  const readingEntries = await getBookEntryRows(books);

  const dynamicEntries = [
    ...journalEntries.flatMap((entry) => {
      const slug = entry.slug || entry.id;
      if (!slug) return [];

      const encodedSlug = encodeURIComponent(slug);
      const lastModified = entry.lastEditedTime || entry.createdTime || entry.date;

      return [
        buildEntry(`/journal/${encodedSlug}`, lastModified),
        buildEntry(`/posts/${encodedSlug}`, lastModified),
      ];
    }),
    ...books.flatMap((book) => {
      if (!book.slug) return [];
      return [buildEntry(`/book-club/${encodeURIComponent(book.slug)}`, book.lastEditedTime || book.createdTime)];
    }),
    ...readingEntries.flatMap(({ book, note }) => {
      if (!book.slug || !note.slug) return [];

      return [
        buildEntry(
          `/book-club/${encodeURIComponent(book.slug)}/entries/${encodeURIComponent(note.slug)}`,
          note.lastEditedTime || note.createdTime,
        ),
      ];
    }),
    ...videos.flatMap((video) => {
      const slug = slugify(video.title);
      if (!slug) return [];
      return [buildEntry(`/curated/${encodeURIComponent(slug)}`, video.lastEditedTime || video.createdTime)];
    }),
    ...songs.flatMap((song) => {
      const slug = song.songSlug || slugify(song.title);
      if (!slug) return [];
      return [buildEntry(`/music/${encodeURIComponent(slug)}`, song.createdTime)];
    }),
    ...PRODUCT_SLUGS.map((slug) => buildEntry(`/shop/${encodeURIComponent(slug)}`)),
  ];

  const dedupedEntries = new Map();

  for (const entry of [...buildEntries(STATIC_PATHS), ...dynamicEntries]) {
    dedupedEntries.set(entry.url, entry);
  }

  return Array.from(dedupedEntries.values());
}
