import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CreatorNoteKindDiagnostics, RawCreatorNote } from '@/lib/creatorNotes/types';

export const DEFAULT_EXTRACTION_CACHE_DIR = path.join(
  process.cwd(),
  'tmp',
  'creator-notes-extraction',
);

export type CreatorNotesExtractionCacheKeyInput = {
  sourceItemId: string;
  transcriptHash: string;
  normalizationVersion: string;
  windowHash: string;
  extractionVersion: string;
  provider: string;
  model: string;
};

export type CachedWindowExtraction = {
  windowId: string;
  notes: RawCreatorNote[];
  rejected: number;
  kindDiagnostics: CreatorNoteKindDiagnostics;
  extractedAt: string;
};

export type CreatorNotesExtractionCache = {
  get(key: CreatorNotesExtractionCacheKeyInput): Promise<CachedWindowExtraction | null>;
  set(key: CreatorNotesExtractionCacheKeyInput, value: CachedWindowExtraction): Promise<void>;
};

export function extractionCacheKey(input: CreatorNotesExtractionCacheKeyInput): string {
  const payload = JSON.stringify({
    sourceItemId: String(input.sourceItemId || '').trim(),
    transcriptHash: String(input.transcriptHash || '').trim(),
    normalizationVersion: String(input.normalizationVersion || '').trim(),
    windowHash: String(input.windowHash || '').trim(),
    extractionVersion: String(input.extractionVersion || '').trim(),
    provider: String(input.provider || '').trim(),
    model: String(input.model || '').trim(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function extractionCachePath(
  keyInput: CreatorNotesExtractionCacheKeyInput,
  cacheDir = DEFAULT_EXTRACTION_CACHE_DIR,
): string {
  return path.join(cacheDir, `${extractionCacheKey(keyInput)}.json`);
}

function isCachedRecord(value: unknown): value is CachedWindowExtraction {
  if (!value || typeof value !== 'object') return false;
  const row = value as CachedWindowExtraction;
  return typeof row.windowId === 'string' && Array.isArray(row.notes);
}

export function createMemoryCreatorNotesExtractionCache(
  seed: Array<[CreatorNotesExtractionCacheKeyInput, CachedWindowExtraction]> = [],
): CreatorNotesExtractionCache & { store: Map<string, CachedWindowExtraction> } {
  const store = new Map<string, CachedWindowExtraction>();
  for (const [key, value] of seed) {
    store.set(extractionCacheKey(key), structuredClone(value));
  }
  return {
    store,
    async get(key) {
      const hit = store.get(extractionCacheKey(key));
      return hit ? structuredClone(hit) : null;
    },
    async set(key, value) {
      store.set(extractionCacheKey(key), structuredClone(value));
    },
  };
}

export function createFileCreatorNotesExtractionCache(
  cacheDir = DEFAULT_EXTRACTION_CACHE_DIR,
): CreatorNotesExtractionCache {
  return {
    async get(key) {
      try {
        const raw = await readFile(extractionCachePath(key, cacheDir), 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        return isCachedRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(extractionCachePath(key, cacheDir), `${JSON.stringify(value)}\n`, 'utf8');
    },
  };
}
