import 'server-only';

import { notion } from '@/lib/notion/client';
import { paginate } from '@/lib/notion/paginate';
import { notionEnv } from '@/lib/env/notion';
import { normalizeNotionDatabaseId } from '@/lib/notion/notionIds';

function getWeeklyBriefsDbId() {
  const id = notionEnv.NOTION_WEEKLY_BRIEFS_DB_ID;
  if (!id) return null;
  return normalizeNotionDatabaseId(id);
}

function textFromTitle(prop) {
  return prop?.title?.[0]?.plain_text ?? '';
}

function textFromRichText(prop) {
  return (prop?.rich_text ?? []).map((t) => t.plain_text).join('').trim();
}

function dateValue(prop) {
  return prop?.date?.start ?? null;
}

function urlValue(prop) {
  return prop?.url ?? null;
}

function checkboxValue(prop, fallback = false) {
  return typeof prop?.checkbox === 'boolean' ? prop.checkbox : fallback;
}

function selectOrStatusName(prop) {
  if (!prop) return null;
  if (prop.status) return prop.status?.name ?? null;
  if (prop.select) return prop.select?.name ?? null;
  return null;
}

function multiSelectValues(prop) {
  return (prop?.multi_select ?? []).map((item) => item.name).filter(Boolean);
}

function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function normalizeNotionPageId(id) {
  if (!id || typeof id !== 'string') return null;
  const clean = id.replace(/-/g, '');
  if (clean.length !== 32) return id;
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

function getProperty(properties, ...names) {
  if (!properties || typeof properties !== 'object') return null;
  for (const name of names) {
    const prop = properties[name];
    if (prop) return prop;
  }
  return null;
}

function mapWeeklyBrief(page) {
  const p = page.properties ?? {};
  const title = textFromTitle(getProperty(p, 'Title', 'Name'));
  const slug = textFromRichText(getProperty(p, 'Slug', 'Weekly Brief Slug')) || slugify(title);

  return {
    id: page.id,
    title,
    slug,
    status: selectOrStatusName(getProperty(p, 'Status')),
    weekOf: dateValue(getProperty(p, 'Week Of', 'Week', 'Week Start', 'Week Start Date')),
    summary: textFromRichText(getProperty(p, 'Summary', 'Dek', 'Standfirst')),
    editorialThesis: textFromRichText(getProperty(p, 'Editorial Thesis', 'Thesis')),
    thoughtDump: textFromRichText(getProperty(p, 'Thought Dump', 'Thoughts')),
    selectedCandidates: textFromRichText(
      getProperty(p, 'Selected Candidates', 'Selected Candidate IDs', 'Candidate IDs')
    ),
    draft: textFromRichText(getProperty(p, 'Draft', 'Weekly Draft', 'AI Draft')),
    publishUrl: urlValue(getProperty(p, 'Publish URL', 'Public URL')),
    published: checkboxValue(getProperty(p, 'Published'), false),
    tags: multiSelectValues(getProperty(p, 'Tags')),
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
}

const schemaCache = new Map();

async function getDatabaseSchema(dbId) {
  if (!notion || !dbId) return null;
  if (schemaCache.has(dbId)) return schemaCache.get(dbId);

  const promise = (async () => {
    try {
      const db = await notion.databases.retrieve({ database_id: dbId });
      return db?.properties ?? null;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[weeklyBriefs.repo] getDatabaseSchema error:', error);
      }
      return null;
    }
  })();

  schemaCache.set(dbId, promise);
  return promise;
}

function findPropertyConfig(schema, names) {
  if (!schema || typeof schema !== 'object') return null;
  for (const name of names) {
    const prop = schema[name];
    if (prop) return { name, config: prop };
  }
  return null;
}

function buildRichText(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  return [{ type: 'text', text: { content: text } }];
}

function writeStringProperty(properties, schema, names, value, { title = false } = {}) {
  if (value == null) return;
  const text = String(value).trim();
  const match = findPropertyConfig(schema, names);
  if (!match) return;

  if (title || match.config.type === 'title') {
    properties[match.name] = { title: buildRichText(text) };
    return;
  }

  if (match.config.type === 'rich_text') {
    properties[match.name] = { rich_text: buildRichText(text) };
    return;
  }

  if (match.config.type === 'url') {
    properties[match.name] = { url: text || null };
  }
}

function writeStatusProperty(properties, schema, names, value) {
  if (value == null) return;
  const text = String(value).trim();
  if (!text) return;
  const match = findPropertyConfig(schema, names);
  if (!match) return;

  if (match.config.type === 'status') {
    properties[match.name] = { status: { name: text } };
    return;
  }

  if (match.config.type === 'select') {
    properties[match.name] = { select: { name: text } };
  }
}

function writeDateProperty(properties, schema, names, value) {
  if (value == null || String(value).trim() === '') return;
  const match = findPropertyConfig(schema, names);
  if (!match || match.config.type !== 'date') return;
  properties[match.name] = { date: { start: String(value).trim() } };
}

function writeCheckboxProperty(properties, schema, names, value) {
  if (typeof value !== 'boolean') return;
  const match = findPropertyConfig(schema, names);
  if (!match || match.config.type !== 'checkbox') return;
  properties[match.name] = { checkbox: value };
}

function writeMultiSelectProperty(properties, schema, names, value) {
  if (!Array.isArray(value)) return;
  const match = findPropertyConfig(schema, names);
  if (!match || match.config.type !== 'multi_select') return;
  properties[match.name] = {
    multi_select: value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .map((name) => ({ name })),
  };
}

async function buildWeeklyBriefWriteProperties(input = {}) {
  const dbId = getWeeklyBriefsDbId();
  if (!dbId) return null;

  const schema = await getDatabaseSchema(dbId);
  if (!schema) return null;

  const properties = {};

  writeStringProperty(properties, schema, ['Title', 'Name'], input.title, { title: true });
  writeStringProperty(properties, schema, ['Slug', 'Weekly Brief Slug'], input.slug);
  writeStatusProperty(properties, schema, ['Status'], input.status);
  writeDateProperty(properties, schema, ['Week Of', 'Week', 'Week Start', 'Week Start Date'], input.weekOf);
  writeStringProperty(properties, schema, ['Summary', 'Dek', 'Standfirst'], input.summary);
  writeStringProperty(properties, schema, ['Editorial Thesis', 'Thesis'], input.editorialThesis);
  writeStringProperty(properties, schema, ['Thought Dump', 'Thoughts'], input.thoughtDump);
  writeStringProperty(
    properties,
    schema,
    ['Selected Candidates', 'Selected Candidate IDs', 'Candidate IDs'],
    input.selectedCandidates
  );
  writeStringProperty(properties, schema, ['Draft', 'Weekly Draft', 'AI Draft'], input.draft);
  writeStringProperty(properties, schema, ['Publish URL', 'Public URL'], input.publishUrl);
  writeCheckboxProperty(properties, schema, ['Published'], input.published);
  writeMultiSelectProperty(properties, schema, ['Tags'], input.tags);

  return properties;
}

function statusFilter(statuses, schema) {
  if (!statuses?.length) return undefined;
  const match = findPropertyConfig(schema, ['Status']);
  if (!match) return undefined;

  const key = match.config.type === 'status' ? 'status' : 'select';
  return {
    or: statuses.map((status) => ({
      property: match.name,
      [key]: { equals: status },
    })),
  };
}

export async function getWeeklyBriefsPage({ pageSize = 25, cursor, statuses } = {}) {
  if (!notion) return { items: [], nextCursor: null, hasMore: false };
  const dbId = getWeeklyBriefsDbId();
  if (!dbId) return { items: [], nextCursor: null, hasMore: false };

  try {
    const schema = await getDatabaseSchema(dbId);
    const res = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor,
      page_size: Math.min(pageSize, 100),
      filter: statusFilter(statuses, schema),
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });

    return {
      items: (res.results ?? []).map(mapWeeklyBrief),
      nextCursor: res.next_cursor ?? null,
      hasMore: Boolean(res.has_more),
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[weeklyBriefs.repo] getWeeklyBriefsPage error:', error);
    }
    return { items: [], nextCursor: null, hasMore: false };
  }
}

export async function getAllWeeklyBriefs({ statuses, limit } = {}) {
  if (!notion) return [];
  const dbId = getWeeklyBriefsDbId();
  if (!dbId) return [];

  try {
    const schema = await getDatabaseSchema(dbId);
    const results = await paginate(
      (cursor) =>
        notion.databases.query({
          database_id: dbId,
          start_cursor: cursor,
          page_size: 100,
          filter: statusFilter(statuses, schema),
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        }),
      { limit }
    );

    return (results ?? []).map(mapWeeklyBrief);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[weeklyBriefs.repo] getAllWeeklyBriefs error:', error);
    }
    return [];
  }
}

export async function getWeeklyBriefBySlug(slug) {
  if (!notion) return null;
  const dbId = getWeeklyBriefsDbId();
  if (!dbId || slug == null || String(slug).trim() === '') return null;

  const normalizedSlug = String(slug).trim().toLowerCase();

  try {
    const res = await notion.databases.query({
      database_id: dbId,
      page_size: 100,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });

    const page =
      (res.results ?? []).find((entry) => mapWeeklyBrief(entry).slug.toLowerCase() === normalizedSlug) ?? null;

    return page ? mapWeeklyBrief(page) : null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[weeklyBriefs.repo] getWeeklyBriefBySlug error:', error);
    }
    return null;
  }
}

export async function getWeeklyBriefById(id) {
  if (!notion) return null;
  const normalizedId = normalizeNotionPageId(id);
  if (!normalizedId) return null;

  try {
    const page = await notion.pages.retrieve({ page_id: normalizedId });
    return mapWeeklyBrief(page);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[weeklyBriefs.repo] getWeeklyBriefById error:', error);
    }
    return null;
  }
}

export async function createWeeklyBrief(input = {}) {
  if (!notion) return null;
  const dbId = getWeeklyBriefsDbId();
  if (!dbId) return null;

  try {
    const properties = await buildWeeklyBriefWriteProperties(input);
    const hasTitle = Object.values(properties ?? {}).some((prop) => Array.isArray(prop?.title));
    if (!properties || !hasTitle) return null;

    const page = await notion.pages.create({
      parent: { database_id: dbId },
      properties,
    });

    return mapWeeklyBrief(page);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[weeklyBriefs.repo] createWeeklyBrief error:', error);
    }
    return null;
  }
}

export async function updateWeeklyBrief(id, patch = {}) {
  if (!notion) return null;
  const normalizedId = normalizeNotionPageId(id);
  if (!normalizedId) return null;

  try {
    const properties = await buildWeeklyBriefWriteProperties(patch);
    if (!properties || Object.keys(properties).length === 0) return await getWeeklyBriefById(normalizedId);

    const page = await notion.pages.update({
      page_id: normalizedId,
      properties,
    });

    return mapWeeklyBrief(page);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[weeklyBriefs.repo] updateWeeklyBrief error:', error);
    }
    return null;
  }
}
