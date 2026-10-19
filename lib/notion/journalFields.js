/**
 * Maps a Notion journal page into the site entry shape.
 *
 * Optional properties are read when present and never required:
 * - Summary: rich text. A one- or two-sentence editorial introduction.
 * - Featured: checkbox. Select or status values Yes, True, or Featured also count.
 * Add both on the Notion journal database by hand. This module does not change the schema.
 */

const FEATURED_TRUTHY = new Set(['yes', 'true', 'featured', 'y']);

function slugify(title) {
  if (!title) return '';
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

function getPropertyValue(property, type) {
  if (!property || !property[type]) return null;
  switch (type) {
    case 'title':
      return property.title?.[0]?.plain_text ?? '';
    case 'date':
      return property.date?.start ?? null;
    case 'url':
      return property.url ?? null;
    case 'multi_select':
      return property.multi_select?.map((item) => item.name) ?? [];
    case 'select':
      return property.select?.name ?? null;
    default:
      return null;
  }
}

function getPropertyByType(properties, type) {
  if (!properties || typeof properties !== 'object') return null;
  for (const key of Object.keys(properties)) {
    const prop = properties[key];
    if (prop?.type === type) return prop;
  }
  return null;
}

function findProperty(properties, names) {
  if (!properties || typeof properties !== 'object') return null;
  for (const name of names) {
    if (properties[name]) return properties[name];
  }
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const key of Object.keys(properties)) {
    if (wanted.has(key.toLowerCase()) && properties[key]) return properties[key];
  }
  return null;
}

function toCalendarDateOnly(value) {
  if (value == null || value === '') return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function collectTags(properties) {
  const multi =
    getPropertyValue(properties?.Tags, 'multi_select') ||
    getPropertyValue(properties?.Tag, 'multi_select');
  if (multi?.length) return multi;
  const single =
    getPropertyValue(properties?.Tags, 'select') || getPropertyValue(properties?.Tag, 'select');
  return single ? [single] : [];
}

function plainTextList(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => part?.plain_text || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readJournalSummary(property) {
  if (!property || typeof property !== 'object') return '';
  return plainTextList(property.rich_text) || plainTextList(property.title);
}

export function readJournalFeatured(property) {
  if (!property || typeof property !== 'object') return false;
  if (property.type === 'checkbox' || typeof property.checkbox === 'boolean') {
    return property.checkbox === true;
  }
  const name = property.select?.name || property.status?.name || '';
  return FEATURED_TRUTHY.has(String(name).trim().toLowerCase());
}

export function formatJournalPage(page) {
  const properties = page?.properties || {};
  const title = getPropertyValue(properties.Title || properties.Name, 'title') || '';
  const dateProp = getPropertyByType(properties, 'date') || properties.Date || properties.date;
  const dateValue = dateProp ? getPropertyValue(dateProp, 'date') : null;
  const dateOnly = toCalendarDateOnly(dateValue);
  const fallbackDate = toCalendarDateOnly(page?.created_time);
  return {
    id: page?.id,
    title,
    slug: slugify(title),
    date: dateOnly ?? fallbackDate ?? dateValue,
    tags: collectTags(properties),
    summary: readJournalSummary(findProperty(properties, ['Summary'])),
    featured: readJournalFeatured(findProperty(properties, ['Featured'])),
    discordChannelLink: getPropertyValue(properties['Discord Channel Link'], 'url'),
    createdTime: page?.created_time,
    lastEditedTime: page?.last_edited_time,
  };
}
