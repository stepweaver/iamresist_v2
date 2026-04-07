// lib/bookclub/service.js
import { unstable_cache } from "next/cache";
import { getAllBooks, getBookBySlug as getBookBySlugRepo } from "../notion/books.repo";
import { getBookEntries } from "../notion/readingJournal.repo";

const REVALIDATE = 300; // 5 min

export const ALLOWED_BOOK_STATUSES = [
  "Reading",
  "Pending",
  "Completed",
  "Shelf",
];

export async function listBooks() {
  return unstable_cache(
    () => getAllBooks({ statuses: ALLOWED_BOOK_STATUSES }),
    ["bookclub-list-books"],
    { revalidate: REVALIDATE }
  )();
}

export async function getBookBySlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  const normalized = slug.trim();
  if (!normalized) return null;

  return unstable_cache(
    () => getBookBySlugRepo(normalized),
    ["bookclub-book", normalized],
    { revalidate: REVALIDATE }
  )();
}

export async function getNotesForBook(bookSlug) {
  if (!bookSlug || typeof bookSlug !== "string") return [];
  const normalized = bookSlug.trim();
  if (!normalized) return [];

  return unstable_cache(
    async () => {
      const book = await getBookBySlugRepo(normalized);
      if (!book) return [];
      const entries = await getBookEntries(book.id, { limit: 100 });
      return Array.isArray(entries) ? entries : [];
    },
    ["bookclub-notes", normalized],
    { revalidate: REVALIDATE }
  )();
}

export async function getNoteBySlug(bookSlug, noteSlug) {
  if (!noteSlug || typeof noteSlug !== "string") return null;
  const n = noteSlug.trim();
  if (!n) return null;
  const notes = await getNotesForBook(bookSlug);
  return notes.find((note) => note.slug === n) || null;
}