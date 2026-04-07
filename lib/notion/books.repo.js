// lib/notion/books.repo.js
import { notion } from "./client";
import { notionEnv } from "@/lib/env/notion";
import { paginate } from "./paginate";

const BOOKS_DB_ID = notionEnv.NOTION_BOOKS_DB_ID;

function mapBook(page) {
  const p = page.properties;

  const title = p.Title?.title?.[0]?.plain_text ?? "";

  return {
    id: page.id,
    title,
    author: p.Author?.rich_text?.map((t) => t.plain_text).join("") ?? "",
    slug: p.Slug?.rich_text?.map((t) => t.plain_text).join("") ?? "",
    synopsis: p.Synopsis?.rich_text?.map((t) => t.plain_text).join("") ?? "",
    coverImage: p["Cover Image"]?.url ?? null,
    status: p.Status?.select?.name ?? null,
    discordChannelLink: p["Discord Channel Link"]?.url ?? null,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

function statusOrFilter(statuses) {
  if (!statuses?.length) return undefined;

  return {
    or: statuses.map((s) => ({
      property: "Status",
      select: { equals: s },
    })),
  };
}

export async function getBooksPage({
  pageSize = 25,
  cursor,
  statuses,
} = {}) {
  if (!notion || !BOOKS_DB_ID) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  try {
    const res = await notion.databases.query({
      database_id: BOOKS_DB_ID,
      start_cursor: cursor,
      page_size: Math.min(pageSize, 100),
      filter: statusOrFilter(statuses),
      sorts: [{ property: "Title", direction: "ascending" }],
    });

    return {
      items: res.results.map(mapBook),
      nextCursor: res.next_cursor ?? null,
      hasMore: Boolean(res.has_more),
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[books.repo] getBooksPage error:", error);
    }
    return { items: [], nextCursor: null, hasMore: false };
  }
}

export async function getAllBooks({ statuses, limit } = {}) {
  if (!notion || !BOOKS_DB_ID) {
    return [];
  }

  const results = await paginate(
    (cursor) =>
      notion.databases.query({
        database_id: BOOKS_DB_ID,
        start_cursor: cursor,
        page_size: 100,
        filter: statusOrFilter(statuses),
        sorts: [{ property: "Title", direction: "ascending" }],
      }),
    { limit }
  );

  return results.map(mapBook);
}

export async function getBookBySlug(slug) {
  if (!notion || !BOOKS_DB_ID) {
    return null;
  }

  try {
    const res = await notion.databases.query({
      database_id: BOOKS_DB_ID,
      page_size: 1,
      filter: {
        property: "Slug",
        rich_text: { equals: slug },
      },
    });

    const page = res.results?.[0];
    return page ? mapBook(page) : null;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[books.repo] getBookBySlug error:", error);
    }
    return null;
  }
}

export async function getCurrentBook() {
  if (!notion || !BOOKS_DB_ID) {
    return null;
  }

  try {
    const res = await notion.databases.query({
      database_id: BOOKS_DB_ID,
      page_size: 1,
      filter: {
        property: "Status",
        select: { equals: "Reading" },
      },
    });

    const page = res.results?.[0];
    return page ? mapBook(page) : null;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[books.repo] getCurrentBook error:", error);
    }
    return null;
  }
}