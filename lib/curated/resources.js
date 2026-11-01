/**
 * Published rows from the Curated Articles & Resources Notion database.
 * The destination is the editor-supplied URL. File attachments are not copied
 * onto this site and are never used as the link.
 */

import { readJournalFeatured } from '@/lib/notion/journalFields';
import {
  JOURNAL_IMAGE_PROPERTY_NAMES,
  isJournalImageKey,
  readJournalCoverImage,
  readJournalPropertyImage,
  resolveJournalEditorialImage,
} from '@/lib/notion/journalImage';

const NON_IMAGE_FILE = /\.(?:pdf|zip|docx?|pptx?|xlsx?|mp3|mp4|mov|webm)(?:$|[?#])/i;
const URL_NAMES = ['URL', 'Link', 'Destination URL', 'Destination'];
const SOURCE_NAMES = ['Source', 'Attribution', 'Creator', 'Author', 'Publication'];
const TYPE_NAMES = ['Resource Type', 'Type', 'Category'];
const NOTE_NAMES = ['Editorial Note', 'Note', 'Description', 'Summary'];
const DATE_NAMES = ['Published At', 'Publication Date', 'Published', 'Date'];

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function plainText(parts) {
  if (!Array.isArray(parts)) return '';
  return clean(parts.map((part) => part?.plain_text || '').join(''));
}

function findPropertyEntry(properties, names) {
  if (!properties || typeof properties !== 'object') return null;
  for (const name of names) {
    if (properties[name]) return { name, property: properties[name] };
  }
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const key of Object.keys(properties)) {
    if (wanted.has(key.toLowerCase()) && properties[key]) {
      return { name: key, property: properties[key] };
    }
  }
  return null;
}

function optionName(options, fallback) {
  const match = (options || []).find((option) => clean(option?.name).toLowerCase() === 'published');
  return match?.name || fallback;
}

function readStatusName(property) {
  if (!property || typeof property !== 'object') return '';
  return clean(property.select?.name || property.status?.name || '');
}

function readLooseText(property) {
  if (!property || typeof property !== 'object' || property.type === 'title') return '';
  if (property.type === 'select' || property.select?.name) return clean(property.select?.name);
  if (property.type === 'status' || property.status?.name) return clean(property.status?.name);
  if (Array.isArray(property.multi_select)) {
    return clean(property.multi_select.map((option) => option?.name || '').filter(Boolean).join(', '));
  }
  return plainText(property.rich_text) || plainText(property.title);
}

export function externalDestinationUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
  if (parsed.username || parsed.password) return '';
  return raw;
}

function readDestination(property) {
  if (!property || typeof property !== 'object') return '';
  if (property.type === 'url' || typeof property.url === 'string') return externalDestinationUrl(property.url);
  return externalDestinationUrl(plainText(property.rich_text));
}

function readDate(property, page) {
  if (property?.type === 'created_time') return page?.created_time || null;
  if (property?.type === 'last_edited_time') return page?.last_edited_time || null;
  return property?.date?.start || null;
}

function fileLooksNonImage(image) {
  const label = `${image?.fileName || ''} ${image?.url || ''}`;
  return NON_IMAGE_FILE.test(label);
}

function imageProperties(properties) {
  if (!properties || typeof properties !== 'object') return properties;
  const entry = findPropertyEntry(properties, JOURNAL_IMAGE_PROPERTY_NAMES);
  if (!entry?.property || !Array.isArray(entry.property.files)) return properties;
  const files = entry.property.files.filter((file) => {
    const label = `${file?.name || ''} ${file?.file?.url || ''} ${file?.external?.url || ''}`;
    return !NON_IMAGE_FILE.test(label);
  });
  if (files.length === entry.property.files.length) return properties;
  return {
    ...properties,
    [entry.name]: { ...entry.property, files },
  };
}

export function publishedFilterForProperties(properties) {
  const status = findPropertyEntry(properties, ['Status']);
  if (status?.property?.type === 'status') {
    return {
      property: status.name,
      status: { equals: optionName(status.property.status?.options, 'Published') },
    };
  }
  if (status?.property?.type === 'select') {
    return {
      property: status.name,
      select: { equals: optionName(status.property.select?.options, 'Published') },
    };
  }
  const published = findPropertyEntry(properties, ['Published']);
  if (published?.property?.type === 'checkbox') {
    return { property: published.name, checkbox: { equals: true } };
  }
  return { property: 'Status', select: { equals: 'Published' } };
}

export function sortsForProperties(properties) {
  const date = findPropertyEntry(properties, DATE_NAMES);
  if (date?.property?.type === 'date') {
    return [{ property: date.name, direction: 'descending' }];
  }
  if (date?.property?.type === 'created_time' || date?.property?.type === 'last_edited_time') {
    return [{ timestamp: date.property.type, direction: 'descending' }];
  }
  if (!properties) return [{ property: 'Published At', direction: 'descending' }];
  return [{ timestamp: 'created_time', direction: 'descending' }];
}

function curatedDisplayImage(page, title) {
  const properties = imageProperties(page?.properties);
  const propertyImage = readJournalPropertyImage(properties);
  const coverImage = readJournalCoverImage(page);
  const editorial = resolveJournalEditorialImage({
    propertyImage: fileLooksNonImage(propertyImage) ? null : propertyImage,
    coverImage: fileLooksNonImage(coverImage) ? null : coverImage,
    blocks: [],
    title,
  });
  if (!editorial?.url) return null;
  let src = '';
  if (editorial.hosting === 'notion-file') {
    const id = String(page?.id || '');
    if (!isJournalImageKey(id)) return null;
    src = `/resources/image/${id}`;
  } else {
    src = editorial.url;
  }
  if (!src) return null;
  return {
    src,
    alt: editorial.alt || '',
    hosting: editorial.hosting,
  };
}

function readTitle(properties) {
  const titled = findPropertyEntry(properties, ['Title', 'Name']);
  const fromName = plainText(titled?.property?.title);
  if (fromName) return fromName;
  const titleProp = Object.values(properties || {}).find((property) => property?.type === 'title');
  return plainText(titleProp?.title);
}

export function curatedEditorialFromPage(page) {
  const title = readTitle(page?.properties);
  const properties = imageProperties(page?.properties);
  const propertyImage = readJournalPropertyImage(properties);
  const coverImage = readJournalCoverImage(page);
  return resolveJournalEditorialImage({
    propertyImage: fileLooksNonImage(propertyImage) ? null : propertyImage,
    coverImage: fileLooksNonImage(coverImage) ? null : coverImage,
    blocks: [],
    title,
  });
}

export function formatCuratedResourcePage(page) {
  const properties = page?.properties || {};
  const statusProp = findPropertyEntry(properties, ['Status'])?.property;
  const status = readStatusName(statusProp);
  const publishedProp = findPropertyEntry(properties, ['Published'])?.property;
  const checkbox = publishedProp?.type === 'checkbox' || typeof publishedProp?.checkbox === 'boolean'
    ? publishedProp.checkbox === true
    : false;
  const published = status ? status.toLowerCase() === 'published' : checkbox;
  const title = readTitle(properties);
  const image = curatedDisplayImage(page, title);
  const note = readLooseText(findPropertyEntry(properties, NOTE_NAMES)?.property);
  const destination = readDestination(findPropertyEntry(properties, URL_NAMES)?.property);

  return {
    id: page?.id || '',
    title,
    url: destination,
    source: readLooseText(findPropertyEntry(properties, SOURCE_NAMES)?.property),
    resourceType: readLooseText(findPropertyEntry(properties, TYPE_NAMES)?.property),
    editorialNote: note,
    description: note,
    featured: readJournalFeatured(findPropertyEntry(properties, ['Featured'])?.property),
    published,
    status,
    publishedAt: readDate(findPropertyEntry(properties, DATE_NAMES)?.property, page) || page?.created_time || null,
    heroImage: image && image.hosting !== 'notion-file' ? image.src : null,
    image,
    supportUrl: externalDestinationUrl(findPropertyEntry(properties, ['Support URL'])?.property?.url),
    slug: readLooseText(findPropertyEntry(properties, ['Slug'])?.property),
    createdTime: page?.created_time || null,
    lastEditedTime: page?.last_edited_time || null,
  };
}

export function isPublishedCuratedRecord(record) {
  if (!record || typeof record !== 'object') return false;
  const status = clean(record.status).toLowerCase();
  if (status) return status === 'published';
  return record.published === true;
}

export function curatedSourceLabel(resource) {
  const source = clean(resource?.source);
  if (source) return source;
  try {
    return new URL(resource.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function destinationKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return clean(url).toLowerCase();
  }
}

function compareCurated(a, b) {
  const featuredDelta = Number(b?.featured === true) - Number(a?.featured === true);
  if (featuredDelta) return featuredDelta;
  const left = String(a?.publishedAt || '');
  const right = String(b?.publishedAt || '');
  if (left !== right) return left < right ? 1 : -1;
  return clean(a?.title).localeCompare(clean(b?.title));
}

export function selectCuratedResources(resources, { limit } = {}) {
  const sorted = [...(resources || [])]
    .filter((resource) => isPublishedCuratedRecord(resource) && clean(resource?.title) && externalDestinationUrl(resource?.url))
    .sort(compareCurated);
  const seen = new Set();
  const picked = [];
  const cap = Number.isFinite(limit) && limit > 0 ? limit : sorted.length;
  for (const resource of sorted) {
    const id = clean(resource.id);
    const dest = destinationKey(resource.url);
    if ((id && seen.has(`id:${id}`)) || (dest && seen.has(`url:${dest}`))) continue;
    if (id) seen.add(`id:${id}`);
    if (dest) seen.add(`url:${dest}`);
    picked.push(resource);
    if (picked.length >= cap) break;
  }
  return picked;
}
