import { notionFileFetchUrl, safePublicImagePath } from '@/lib/notion/journalImage';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
]);

export function journalImageNotFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Journal-Image-Result': 'missing',
    },
  });
}

/** A failed file read. Not a confirmation that the essay has no image. */
export function journalImageUnavailable() {
  return new Response('Image temporarily unavailable', {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Retry-After': '60',
      'X-Content-Type-Options': 'nosniff',
      'X-Journal-Image-Result': 'unavailable',
    },
  });
}

export function journalImageResult(response) {
  return String(response?.headers?.get?.('x-journal-image-result') || '');
}

export function planJournalImageDelivery(editorial) {
  if (!editorial?.url) return { action: 'none' };
  if (editorial.hosting === 'site') {
    const path = safePublicImagePath(editorial.url);
    if (!path) return { action: 'none' };
    return { action: 'redirect', path };
  }
  if (editorial.hosting === 'notion-file') {
    const url = notionFileFetchUrl(editorial.url);
    if (!url) return { action: 'none' };
    return { action: 'proxy', url };
  }
  return { action: 'none' };
}

function imageContentType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return IMAGE_TYPES.has(type) ? type : '';
}

function ascii(bytes, start, end) {
  let text = '';
  for (let index = start; index < end; index += 1) text += String.fromCharCode(bytes[index]);
  return text;
}

function safeEditorialSvg(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  const start = text.replace(/^\uFEFF/, '').trimStart();
  if (!/^<\?xml\b|^<svg\b/i.test(start)) return false;
  if (!/<svg[\s>]/i.test(start.slice(0, 512))) return false;
  if (
    /<\s*(?:script|foreignobject|iframe|embed|object|handler)\b|javascript\s*:|<\s*!entity\b|\bon[a-z]+\s*=|@import\b|expression\s*\(/i.test(
      text,
    )
  ) {
    return false;
  }
  if (/url\(\s*(?!#)/i.test(text)) return false;
  if (/(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(text)) return false;
  return true;
}

function imageMagicMatches(type, bytes) {
  if (!bytes || bytes.length < 12) return false;
  if (type === 'image/svg+xml') return safeEditorialSvg(bytes);
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (type === 'image/gif') return ascii(bytes, 0, 3) === 'GIF';
  if (type === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP';
  if (type === 'image/avif') return ascii(bytes, 4, 8) === 'ftyp';
  return false;
}

async function readLimitedBody(response) {
  if (!response?.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 12 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    return new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        /* The oversized body is discarded either way. */
      }
      return null;
    }
    chunks.push(value);
  }
  if (total < 12) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function fileFailure(status) {
  if (status === 400 || status === 401 || status === 403 || status === 404) return 'expired';
  return 'unavailable';
}

/**
 * Fetches one allowlisted Notion file.
 * reason expired: the signed URL was rejected and should be refreshed.
 * reason unavailable: the file host failed temporarily.
 * reason invalid: the bytes were not an allowed image.
 * reason rejected: the URL failed the allowlist before any request.
 */
export async function fetchNotionEditorialFile(url, fetchImpl = fetch) {
  const target = notionFileFetchUrl(url);
  if (!target) return { ok: false, reason: 'rejected' };
  let response;
  try {
    response = await fetchImpl(target, {
      redirect: 'error',
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!response?.ok) return { ok: false, reason: fileFailure(response.status) };
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return { ok: false, reason: 'invalid' };
  const type = imageContentType(response.headers?.get?.('content-type'));
  if (!type) return { ok: false, reason: 'invalid' };
  const bytes = await readLimitedBody(response);
  if (!bytes || !imageMagicMatches(type, bytes)) return { ok: false, reason: 'invalid' };
  return { ok: true, type, bytes };
}

export async function proxyNotionEditorialFile(url, fetchImpl = fetch) {
  const result = await fetchNotionEditorialFile(url, fetchImpl);
  if (!result.ok) return null;
  return { type: result.type, bytes: result.bytes };
}

function withImageResult(response, result) {
  const headers = new Headers(response.headers);
  headers.set('X-Journal-Image-Result', result);
  return new Response(response.body, { status: response.status, headers });
}

export async function createJournalImageResponse({
  editorial,
  requestUrl,
  fetchImpl = fetch,
}) {
  const plan = planJournalImageDelivery(editorial);
  if (plan.action === 'redirect') {
    const location = new URL(plan.path, requestUrl).toString();
    return new Response(null, {
      status: 307,
      headers: {
        Location: location,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'X-Journal-Image-Result': 'redirect',
      },
    });
  }
  if (plan.action !== 'proxy') return journalImageNotFound();

  const image = await fetchNotionEditorialFile(plan.url, fetchImpl);
  if (!image.ok) {
    const failure = journalImageNotFound();
    const result = image.reason === 'expired' || image.reason === 'unavailable' ? image.reason : 'missing';
    return withImageResult(failure, result);
  }
  return new Response(image.bytes, {
    status: 200,
    headers: {
      'Content-Type': image.type,
      'Content-Length': String(image.bytes.byteLength),
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'X-Journal-Image-Result': 'ok',
      ...(image.type === 'image/svg+xml'
        ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
        : {}),
    },
  });
}
