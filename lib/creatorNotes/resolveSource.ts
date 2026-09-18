import 'server-only';

import pLimit from 'p-limit';

import {
  sourceHasNoUrlError,
  sourceItemNotFoundError,
} from '@/lib/creatorNotes/errors';
import { isUuid } from '@/lib/creatorNotes/identity';
import type { ResolvedCreatorSource } from '@/lib/creatorNotes/types';
import {
  classifyCreatorSourceProvider,
  parseYouTubeVideoId,
} from '@/lib/creatorNotes/youtubeIdentity';
import { fetchFeedItemsWithMeta } from '@/lib/feeds/rss';
import { fetchSourceItemById, intelDbConfigured } from '@/lib/intel/db';
import { getAllVoices } from '@/lib/notion/voices.repo';

const VOICE_FETCH_CONCURRENCY = 6;
const VOICE_ITEMS_PER_FEED = 20;

type IntelSourceItemRow = {
  id: string;
  title?: string | null;
  canonical_url?: string | null;
  published_at?: string | null;
  desk_lane?: string | null;
  external_id?: string | null;
  sources?: {
    name?: string | null;
    slug?: string | null;
    desk_lane?: string | null;
  } | null;
};

type VoiceRegistryRow = {
  id?: string | null;
  title?: string | null;
  slug?: string | null;
  feedUrl?: string | null;
  homeUrl?: string | null;
  platform?: string | null;
};

type VoiceFeedItem = {
  id?: string | null;
  sourceId?: string | null;
  title?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  voice?: VoiceRegistryRow | null;
};

export type CreatorVoiceCatalogItem = {
  sourceItemId: string;
  sourceId: string | null;
  title: string | null;
  url: string;
  publishedAt: string | null;
  creatorId: string | null;
  creatorName: string | null;
};

export type ResolveCreatorSourceDeps = {
  dbConfigured?: () => boolean;
  fetchIntelById?: (id: string) => Promise<IntelSourceItemRow | null>;
  listVoiceItems?: () => Promise<CreatorVoiceCatalogItem[]>;
};

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function identitySet(values: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const cleaned = optionalText(value);
    if (!cleaned) continue;
    out.add(cleaned);
    out.add(cleaned.toLowerCase());
  }
  return out;
}

export function voiceIdentityAliases(item: {
  sourceItemId: string;
  sourceId?: string | null;
  url?: string | null;
  creatorId?: string | null;
}): string[] {
  const yt = parseYouTubeVideoId(item.url, item.sourceId || item.sourceItemId);
  const slug = optionalText(item.creatorId)?.toLowerCase() || null;
  return [
    item.sourceItemId,
    item.sourceId || null,
    item.url || null,
    yt,
    yt ? `yt:video:${yt}` : null,
    yt ? `yt:${yt}` : null,
    yt && slug ? `voice:${slug}:yt:${yt}` : null,
  ].filter((value): value is string => Boolean(value));
}

export function matchesVoiceIdentity(
  item: {
    sourceItemId: string;
    sourceId?: string | null;
    url?: string | null;
    creatorId?: string | null;
  },
  sourceItemId: string,
): boolean {
  const needle = optionalText(sourceItemId);
  if (!needle) return false;
  const needles = identitySet([
    needle,
    parseYouTubeVideoId(needle, needle),
    parseYouTubeVideoId(null, needle),
  ]);
  const yt = parseYouTubeVideoId(needle, needle);
  if (yt) {
    needles.add(`yt:video:${yt}`);
    needles.add(`yt:${yt}`);
    needles.add(yt.toLowerCase());
  }
  const aliases = identitySet(voiceIdentityAliases(item));
  for (const alias of aliases) {
    if (needles.has(alias)) return true;
  }
  return false;
}

export function canonicalVoiceIdentityKey(item: {
  sourceItemId: string;
  sourceId?: string | null;
  url?: string | null;
}): string {
  const yt = parseYouTubeVideoId(item.url, item.sourceId || item.sourceItemId);
  if (yt) return `yt:${yt.toLowerCase()}`;
  const url = optionalText(item.url);
  if (url) return `url:${url.toLowerCase()}`;
  return `id:${String(item.sourceItemId || '').trim().toLowerCase()}`;
}

function publishedMs(item: { publishedAt?: string | null }): number {
  if (!item.publishedAt) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(item.publishedAt);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function compareVoiceItemsNewestFirst(
  a: { sourceItemId: string; creatorId?: string | null; publishedAt?: string | null },
  b: { sourceItemId: string; creatorId?: string | null; publishedAt?: string | null },
): number {
  const byTime = publishedMs(b) - publishedMs(a);
  if (byTime !== 0) return byTime;
  const byId = String(a.sourceItemId).localeCompare(String(b.sourceItemId));
  if (byId !== 0) return byId;
  return String(a.creatorId || '').localeCompare(String(b.creatorId || ''));
}

export function sortVoiceItemsNewestFirst<T extends {
  sourceItemId: string;
  creatorId?: string | null;
  publishedAt?: string | null;
}>(items: T[]): T[] {
  return [...items].sort(compareVoiceItemsNewestFirst);
}

export function dedupeVoiceIdentities<T extends {
  sourceItemId: string;
  sourceId?: string | null;
  url?: string | null;
}>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = canonicalVoiceIdentityKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function isNonContentVoiceArtifact(item: {
  sourceItemId: string;
  sourceId?: string | null;
  url?: string | null;
}): boolean {
  const identity = String(item.sourceId || item.sourceItemId || '');
  if (/^yt:(playlist|channel|user|community):/i.test(identity)) return true;
  const yt = parseYouTubeVideoId(item.url, item.sourceId || item.sourceItemId);
  if (yt) return false;
  const url = String(item.url || '').toLowerCase();
  return /youtube\.com\/(playlist|channel|user|@)/i.test(url);
}

export function isEligibleYouTubeVoiceItem(item: CreatorVoiceCatalogItem): boolean {
  if (!optionalText(item.url) || !optionalText(item.sourceItemId)) return false;
  if (isNonContentVoiceArtifact(item)) return false;
  const yt = parseYouTubeVideoId(item.url, item.sourceId || item.sourceItemId);
  if (!yt) return false;
  return classifyCreatorSourceProvider(item.url, item.sourceId || item.sourceItemId) === 'youtube';
}

export function resolvedCreatorSourceFromVoiceItem(item: CreatorVoiceCatalogItem): ResolvedCreatorSource {
  return resolvedFromVoiceItem(item);
}

function resolvedFromVoiceItem(item: CreatorVoiceCatalogItem): ResolvedCreatorSource {
  const url = item.url;
  const externalId =
    parseYouTubeVideoId(url, item.sourceId || item.sourceItemId) || item.sourceId || item.sourceItemId;
  return {
    sourceItemId: item.sourceItemId,
    creatorId: item.creatorId,
    creatorName: item.creatorName,
    title: item.title,
    url,
    publishedAt: item.publishedAt,
    provider: classifyCreatorSourceProvider(url, item.sourceId || item.sourceItemId),
    externalId,
  };
}

function resolvedFromIntelRow(row: IntelSourceItemRow): ResolvedCreatorSource | null {
  const url = optionalText(row.canonical_url);
  if (!url) return null;
  const externalId =
    parseYouTubeVideoId(url, row.external_id || row.id) || optionalText(row.external_id);
  return {
    sourceItemId: row.id,
    creatorId: optionalText(row.sources?.slug),
    creatorName: optionalText(row.sources?.name),
    title: optionalText(row.title),
    url,
    publishedAt: optionalText(row.published_at),
    provider: classifyCreatorSourceProvider(url, row.external_id || row.id),
    externalId,
  };
}

function toCatalogItem(item: VoiceFeedItem, voice: VoiceRegistryRow): CreatorVoiceCatalogItem | null {
  const url = optionalText(item.url);
  if (!url) return null;
  const sourceItemId = optionalText(item.id) || optionalText(item.sourceId) || url;
  return {
    sourceItemId,
    sourceId: optionalText(item.sourceId),
    title: optionalText(item.title),
    url,
    publishedAt: optionalText(item.publishedAt),
    creatorId: optionalText(voice.slug),
    creatorName: optionalText(voice.title),
  };
}

export async function loadVoiceCatalogItems(): Promise<CreatorVoiceCatalogItem[]> {
  const voices = (await getAllVoices()) as VoiceRegistryRow[];
  if (!Array.isArray(voices) || voices.length === 0) return [];

  const limiter = pLimit(VOICE_FETCH_CONCURRENCY);
  const groups = await Promise.all(
    voices.map((voice) =>
      limiter(async () => {
        const feedUrl = optionalText(voice.feedUrl);
        if (!feedUrl) return [] as CreatorVoiceCatalogItem[];
        const result = await fetchFeedItemsWithMeta(feedUrl, {
          limit: VOICE_ITEMS_PER_FEED,
          tags: ['creator-notes-voices', `creator-notes-voice:${optionalText(voice.slug) || 'unknown'}`],
        });
        const items = Array.isArray(result.items) ? result.items : [];
        return items
          .map((item) => toCatalogItem(item as VoiceFeedItem, voice))
          .filter((item): item is CreatorVoiceCatalogItem => Boolean(item));
      }),
    ),
  );

  return dedupeVoiceIdentities(sortVoiceItemsNewestFirst(groups.flat()));
}

async function loadIntelRow(
  sourceItemId: string,
  deps: ResolveCreatorSourceDeps,
): Promise<IntelSourceItemRow | null> {
  if (!isUuid(sourceItemId)) return null;
  const configured = deps.dbConfigured ? deps.dbConfigured() : intelDbConfigured();
  if (!configured) return null;
  const fetchById = deps.fetchIntelById || fetchSourceItemById;
  try {
    return await fetchById(sourceItemId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid input syntax for type uuid/i.test(message)) return null;
    throw error;
  }
}

export async function resolveCreatorSource(
  sourceItemId: string,
  deps: ResolveCreatorSourceDeps = {},
): Promise<ResolvedCreatorSource> {
  const id = optionalText(sourceItemId);
  if (!id) throw sourceItemNotFoundError(String(sourceItemId || ''));

  const intelRow = await loadIntelRow(id, deps);
  if (intelRow) {
    const resolved = resolvedFromIntelRow(intelRow);
    if (!resolved) throw sourceHasNoUrlError();
    return resolved;
  }

  const listVoiceItems = deps.listVoiceItems || loadVoiceCatalogItems;
  const items = await listVoiceItems();
  const match = items.find((item) => matchesVoiceIdentity(item, id));
  if (!match) throw sourceItemNotFoundError(id);
  return resolvedFromVoiceItem(match);
}

export async function listCreatorSources(
  opts: { limit?: number } = {},
  deps: ResolveCreatorSourceDeps = {},
): Promise<ResolvedCreatorSource[]> {
  const limitRaw = opts.limit == null ? 20 : Number(opts.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.round(limitRaw))) : 20;
  const listVoiceItems = deps.listVoiceItems || loadVoiceCatalogItems;
  const items = await listVoiceItems();
  return items.slice(0, limit).map(resolvedFromVoiceItem);
}
