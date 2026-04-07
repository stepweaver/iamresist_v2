// lib/bookclub/service.js
import { unstable_cache } from "next/cache";
import { getAllBooks, getBookBySlug as getBookBySlugRepo } from "../notion/books.repo";

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