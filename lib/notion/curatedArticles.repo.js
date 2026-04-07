import { notion } from "./client";
import { notionEnv } from "@/lib/env/notion";

const CURATED_ARTICLES_DB_ID = notionEnv.NOTION_CURATED_ARTICLES_DB_ID;

function getPropertyValue(property, type) {
  if (!property || !property[type]) return null;

  switch (type) {
    case "title":
      return property.title?.[0]?.plain_text ?? "";
    case "url":
      return property.url ?? null;
    case "date":
      return property.date?.start ?? null;
    case "select":
      return property.select?.name ?? null;
    case "rich_text":
      return property.rich_text?.map((t) => t.plain_text).join("").trim() ?? "";
    default:
      return null;
  }
}

function formatCuratedArticle(page) {
  const p = page.properties;

  return {
    id: page.id,
    title: getPropertyValue(p.Title || p.Name, "title"),
    url: getPropertyValue(p.URL, "url"),
    source:
      getPropertyValue(p.Source, "select") ||
      getPropertyValue(p.Source, "rich_text") ||
      "",
    status: getPropertyValue(p.Status, "select") || "Draft",
    publishedAt: getPropertyValue(p["Published At"], "date") || page.created_time,
    heroImage: getPropertyValue(p["Hero Image"], "url"),
    supportUrl: getPropertyValue(p["Support URL"], "url"),
    slug: getPropertyValue(p.Slug, "rich_text"),
    description: getPropertyValue(p["Editorial Note"], "rich_text") || "",
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

export async function getCuratedArticles(options = {}) {
  if (!notion || !CURATED_ARTICLES_DB_ID) return [];

  try {
    const { limit } = options;

    const baseQuery = {
      database_id: CURATED_ARTICLES_DB_ID,
      filter: {
        property: "Status",
        select: { equals: "Published" },
      },
      sorts: [{ property: "Published At", direction: "descending" }],
    };

    if (limit && limit <= 100) {
      const res = await notion.databases.query({
        ...baseQuery,
        page_size: Math.min(limit, 100),
      });
      return (res.results ?? []).map(formatCuratedArticle);
    }

    const pages = await notion.databases.query({
      ...baseQuery,
      page_size: 100,
    });

    let results = (pages.results ?? []).map(formatCuratedArticle);
    let cursor = pages.next_cursor;

    while (cursor) {
      const res = await notion.databases.query({
        ...baseQuery,
        start_cursor: cursor,
        page_size: 100,
      });
      results = results.concat((res.results ?? []).map(formatCuratedArticle));
      cursor = res.next_cursor;
    }

    const items = limit ? results.slice(0, limit) : results;
    return items;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getCuratedArticles]", err);
    }
    return [];
  }
}
