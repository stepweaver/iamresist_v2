import fs from 'node:fs';
import path from 'node:path';
import { safePublicImagePath } from '@/lib/notion/journalImage';

const sizeCache = new Map();

function readUInt32BE(bytes, offset) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

export function parseImageHeader(bytes) {
  if (!bytes || bytes.length < 30) return null;
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.every((byte, index) => bytes[index] === byte) && bytes.length >= 24) {
    const width = readUInt32BE(bytes, 16);
    const height = readUInt32BE(bytes, 20);
    if (width > 0 && height > 0) return { width, height };
  }

  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;

  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    if (width > 0 && height > 0) return { width, height };
  }

  if (
    chunk === 'VP8 ' &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    if (width > 0 && height > 0) return { width, height };
  }

  return null;
}

export function readPublicEditorialSize(urlPath) {
  const safe = safePublicImagePath(urlPath);
  if (!safe || !safe.startsWith('/editorial/')) return null;
  if (sizeCache.has(safe)) return sizeCache.get(safe);
  try {
    const full = path.join(process.cwd(), 'public', safe.slice(1));
    const handle = fs.openSync(full, 'r');
    try {
      const bytes = Buffer.alloc(64);
      fs.readSync(handle, bytes, 0, bytes.length, 0);
      const size = parseImageHeader(bytes);
      sizeCache.set(safe, size);
      return size;
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    sizeCache.set(safe, null);
    return null;
  }
}
