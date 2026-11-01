/**
 * Optional editorial artwork for a journal essay.
 *
 * Precedence:
 * 1. Hero Image, Featured Image, Cover Image, or Image property
 * 2. Notion page cover
 * 3. First image block in the essay body
 * 4. No editorial image
 *
 * Image properties are read when present. Essays without artwork stay unchanged.
 * Expiring Notion file URLs are never treated as stable public addresses.
 */

export const JOURNAL_IMAGE_PROPERTY_NAMES = [
  'Hero Image',
  'Featured Image',
  'Cover Image',
  'Image',
];

const OWNED_IMAGE_HOSTS = new Set(['iamresist.org', 'www.iamresist.org']);
const IMAGE_FILE_RE = /\.(?:webp|png|jpe?g|gif|avif)$/i;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function plainText(parts) {
  if (!Array.isArray(parts)) return '';
  return cleanText(parts.map((part) => part?.plain_text || '').join(''));
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

function cleanUrl(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fileUrl(value) {
  if (!value || typeof value !== 'object') return '';
  if (value.type === 'external') return cleanUrl(value.external?.url);
  if (value.type === 'file') return cleanUrl(value.file?.url);
  if (value.type === 'file_upload') return cleanUrl(value.file?.url || value.file_upload?.url);
  return cleanUrl(value.external?.url || value.file?.url || value.url);
}

function usableFileName(name) {
  const base = cleanText(String(name || '').replace(/\.[a-z0-9]{2,5}$/i, ''));
  if (!base || /^https?:/i.test(base)) return '';
  if (!/\s/.test(base)) return '';
  return base;
}

function editorialAlt({ caption, fileName, title }) {
  if (caption) return caption;
  const name = usableFileName(fileName);
  if (name) return name;
  const essay = cleanText(title);
  if (essay) return `Editorial image for ${essay}`;
  return 'Editorial image';
}

function isIpLiteral(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(':')) return true;
  return false;
}

function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isAllowlistedNotionFileHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (host === 'file.notion.so' || host === 'secure.notion-static.com') return true;
  return /^prod-files-secure\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/.test(host);
}

export function safePublicImagePath(pathname) {
  if (typeof pathname !== 'string') return null;
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return null;
  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('//')) return null;
  const editorial = /^\/editorial\/[a-zA-Z0-9._-]+$/;
  const rootImage = /^\/[a-zA-Z0-9._-]+$/;
  if (!editorial.test(decoded) && !rootImage.test(decoded)) return null;
  if (!IMAGE_FILE_RE.test(decoded)) return null;
  return decoded;
}

/**
 * Returns the exact Notion file URL the image endpoint may fetch.
 * Rejects every other address so the endpoint cannot be aimed at an arbitrary host.
 */
export function notionFileFetchUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (isBlockedHost(parsed.hostname) || isIpLiteral(parsed.hostname)) return null;
  if (!isAllowlistedNotionFileHost(parsed.hostname)) return null;
  parsed.hash = '';
  return parsed.toString();
}

export function classifyJournalImageUrl(value) {
  const raw = cleanUrl(value);
  if (!raw || raw.startsWith('//')) return null;
  if (raw.startsWith('/')) {
    if (raw.includes('?') || raw.includes('#') || raw.includes('\\')) return null;
    const path = safePublicImagePath(raw);
    return path ? { hosting: 'site', url: path } : null;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol !== 'https:') return null;
  if (isBlockedHost(parsed.hostname) || isIpLiteral(parsed.hostname)) return null;

  if (OWNED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
    if (parsed.search || parsed.hash) return null;
    const path = safePublicImagePath(parsed.pathname);
    if (path) return { hosting: 'site', url: path };
  }

  const notionUrl = notionFileFetchUrl(parsed.toString());
  if (notionUrl) return { hosting: 'notion-file', url: notionUrl };

  if (
    parsed.searchParams.has('X-Amz-Signature') ||
    parsed.searchParams.has('X-Amz-Algorithm') ||
    parsed.searchParams.has('X-Amz-Credential')
  ) {
    return null;
  }

  parsed.hash = '';
  return { hosting: 'external', url: parsed.toString() };
}

function readFilesValue(property) {
  if (!property || typeof property !== 'object') return null;
  const files = Array.isArray(property.files) ? property.files : null;
  if (files) {
    for (const file of files) {
      const url = fileUrl(file);
      if (!url) continue;
      return {
        url,
        fileName: typeof file?.name === 'string' ? file.name : '',
        caption: plainText(file?.caption),
      };
    }
  }
  if (property.type === 'url' || typeof property.url === 'string') {
    const url = cleanUrl(property.url);
    if (!url) return null;
    return { url, fileName: '', caption: '' };
  }
  return null;
}

export function readJournalPropertyImage(properties) {
  const property = findProperty(properties, JOURNAL_IMAGE_PROPERTY_NAMES);
  const image = readFilesValue(property);
  if (!image) return null;
  return { source: 'property', blockId: null, ...image };
}

export function readJournalCoverImage(page) {
  const url = fileUrl(page?.cover);
  if (!url) return null;
  return { source: 'cover', blockId: null, url, fileName: '', caption: '' };
}

export function readJournalBodyImage(blocks) {
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    if (block?.type !== 'image' || !block.image) continue;
    const url = fileUrl(block.image);
    if (!url) continue;
    return {
      source: 'body',
      blockId: typeof block.id === 'string' ? block.id : null,
      url,
      fileName: '',
      caption: plainText(block.image.caption),
    };
  }
  return null;
}

export function resolveJournalEditorialImage({
  propertyImage = null,
  coverImage = null,
  blocks = [],
  title = '',
} = {}) {
  const candidates = [
    propertyImage?.url ? { ...propertyImage, source: 'property', blockId: null } : null,
    coverImage?.url ? { ...coverImage, source: 'cover', blockId: null } : null,
    readJournalBodyImage(blocks),
  ];

  for (const candidate of candidates) {
    if (!candidate?.url) continue;
    const classified = classifyJournalImageUrl(candidate.url);
    if (!classified) continue;
    const caption = cleanText(candidate.caption);
    return {
      source: candidate.source,
      blockId: candidate.source === 'body' ? candidate.blockId || null : null,
      url: classified.url,
      hosting: classified.hosting,
      caption,
      alt: editorialAlt({ caption, fileName: candidate.fileName, title }),
    };
  }
  return null;
}

function notionBackedImagePath(canonicalPath) {
  const path = typeof canonicalPath === 'string' ? canonicalPath : '';
  if (path.startsWith('/journal/') || path.startsWith('/curated/articles/')) return `${path}/image`;
  return '';
}

export function journalShareImage(editorial, canonicalPath) {
  if (!editorial?.url) return null;
  const alt = cleanText(editorial.alt) || 'Editorial image';
  if (editorial.hosting === 'notion-file') {
    const url = notionBackedImagePath(canonicalPath);
    if (!url) return null;
    return { url, alt };
  }
  return { url: editorial.url, alt };
}

export function journalEditorialDisplaySrc(editorial, canonicalPath) {
  if (!editorial?.url) return '';
  if (editorial.hosting === 'notion-file') return notionBackedImagePath(canonicalPath);
  return editorial.url;
}

export function journalEditorialOmitBlockIds(editorial) {
  if (editorial?.source === 'body' && editorial.blockId) return [editorial.blockId];
  return [];
}

export function isJournalImageKey(value) {
  const key = String(value || '');
  if (key.length < 1 || key.length > 120) return false;
  if (key !== key.trim()) return false;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return true;
  const hex = key.replace(/-/g, '');
  return hex.length === 32 && /^[0-9a-f]+$/.test(hex) && /^[0-9a-f-]+$/.test(key);
}
