// lib/bookclub/service.js
import { unstable_cache } from "next/cache";
import { getAllBooks } from "../notion/books.repo";

const REVALIDATE = 300; // 5 min

export const ALLOWED_BOOK_STATUSES = [
  "Reading",
  "Planned",
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