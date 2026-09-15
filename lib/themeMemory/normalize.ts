import { hashNormalizedPayload } from '@/lib/intel/hash';
import { stripHtmlToText } from '@/lib/intel/contentUse';
import { normalizeStoryUrl } from '@/lib/newswire';
import { getYoutubeVideoId } from '@/lib/utils/youtube';
import type {
  ThemeCandidateItem,
  ThemeCandidateRole,
  ThemeObservationSourceSystem,
  ThemeSourceSystem,
} from '@/lib/themeMemory/types';

const SUMMARY_CAP = 560;

export type VoiceThemeInput = {
  id?: string | null;
  sourceId?: string | null;
  title?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  description?: string | null;
  image?: string | null;
  voice?: {
    id?: string | null;
    title?: string | null;
    slug?: string | null;
    homeUrl?: string | null;
    platform?: string | null;
  } | null;
};

export type NewswireThemeInput = {
  id?: string | null;
  source?: string | null;
  sourceSlug?: string | null;
  title?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  excerpt?: string | null;
  image?: string | null;
  supportUrl?: string | null;
  note?: string | null;
  isCurated?: boolean | null;
  missionScope?: unknown;
};

export type IntelThemeInput = {
  id: string;
  external_id?: string | null;
  canonical_url: string;
  title: string;
  summary?: string | null;
  published_at?: string | null;
  fetched_at?: string | null;
  content_hash?: string | null;
  desk_lane?: string | null;
  surface_state?: string | null;
  state_change_type?: string | null;
  mission_tags?: string[] | null;
  cluster_keys?: Record<string, string> | null;
  structured?: Record<string, unknown> | null;
  sources?: {
    slug?: string | null;
    name?: string | null;
    provenance_class?: string | null;
    desk_lane?: string | null;
    source_family?: string | null;
  } | null;
};

function capSummary(text: string | null | undefined): string | null {
  if (text == null) return null;
  const stripped = stripHtmlToText(String(text));
  if (!stripped) return null;
  if (stripped.length <= SUMMARY_CAP) return stripped;
  return `${stripped.slice(0, SUMMARY_CAP - 1).trimEnd()}…`;
}

export function canonicalizeThemeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  return normalizeStoryUrl(url);
}

function youtubeVideoId(url: string, sourceId?: string | null): string | null {
  const lookup = getYoutubeVideoId as (u?: string | null, s?: string | null) => string | null;
  return lookup(url, sourceId ?? null);
}

export function themeObservationIdentityKey(input: {
  canonicalUrl: string;
  externalId?: string | null;
}): string {
  const yt = youtubeVideoId(input.canonicalUrl, input.externalId);
  if (yt) return `yt:${yt}`;
  const canonical = canonicalizeThemeUrl(input.canonicalUrl);
  return `url:${(canonical || input.canonicalUrl).toLowerCase()}`;
}

export function themeCandidateId(
  sourceSystem: ThemeSourceSystem,
  sourceSlug: string,
  identityKey: string,
): string {
  return `${sourceSystem}:${sourceSlug}:${identityKey}`;
}

export function themeIdentityFromCanonical(input: {
  sourceSystem: ThemeSourceSystem;
  sourceSlug: string;
  canonicalUrl: string;
  externalId?: string | null;
}): { sourceSystem: ThemeSourceSystem; sourceSlug: string; identityKey: string } {
  return {
    sourceSystem: input.sourceSystem,
    sourceSlug: String(input.sourceSlug || '').trim().toLowerCase() || 'unknown',
    identityKey: themeObservationIdentityKey({
      canonicalUrl: canonicalizeThemeUrl(input.canonicalUrl) || input.canonicalUrl,
      externalId: input.externalId ?? null,
    }),
  };
}

export function hashThemeCandidatePayload(parts: {
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  externalId: string | null;
}): string {
  return hashNormalizedPayload({
    canonicalUrl: parts.canonicalUrl,
    title: parts.title,
    summary: parts.summary,
    publishedAt: parts.publishedAt,
    externalId: parts.externalId,
    stateChangeType: 'theme_observation',
  });
}

export function roleForVoiceItem(): ThemeCandidateRole {
  return 'creator';
}

export function roleForNewswireItem(item: { isCurated?: boolean | null }): ThemeCandidateRole {
  return item.isCurated ? 'context' : 'reporting';
}

export function roleForIntelItem(item: {
  desk_lane?: string | null;
  sources?: { desk_lane?: string | null; provenance_class?: string | null } | null;
}): ThemeCandidateRole {
  const deskLane = item.sources?.desk_lane || item.desk_lane || null;
  if (deskLane === 'voices') return 'creator';

  const provenance = String(item.sources?.provenance_class || '').toUpperCase();
  if (provenance === 'PRIMARY') return 'primary';
  if (provenance === 'SPECIALIST') return 'specialist';
  if (provenance === 'COMMENTARY') return 'commentary';
  if (provenance === 'WIRE' || provenance === 'INDIE') return 'reporting';
  if (provenance === 'SCHEDULE') return 'context';
  return 'context';
}

function buildCandidate(input: {
  sourceSystem: ThemeSourceSystem;
  sourceSlug: string;
  sourceName: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  externalId: string | null;
  publishedAt: string | null;
  fetchedAt: string | null;
  role: ThemeCandidateRole;
  provenanceClass?: string | null;
  deskLane?: string | null;
  sourceFamily?: string | null;
  metadata?: Record<string, unknown>;
  contentHash?: string | null;
}): ThemeCandidateItem {
  const identityKey = themeObservationIdentityKey({
    canonicalUrl: input.canonicalUrl,
    externalId: input.externalId,
  });
  const title = input.title.trim() || 'Untitled';
  const summary = capSummary(input.summary);
  const contentHash =
    input.contentHash && String(input.contentHash).trim()
      ? String(input.contentHash)
      : hashThemeCandidatePayload({
          canonicalUrl: input.canonicalUrl,
          title,
          summary,
          publishedAt: input.publishedAt,
          externalId: input.externalId,
        });

  return {
    id: themeCandidateId(input.sourceSystem, input.sourceSlug, identityKey),
    sourceSystem: input.sourceSystem,
    sourceSlug: input.sourceSlug,
    sourceName: input.sourceName,
    title,
    summary,
    canonicalUrl: input.canonicalUrl,
    externalId: input.externalId,
    publishedAt: input.publishedAt,
    fetchedAt: input.fetchedAt,
    role: input.role,
    provenanceClass: input.provenanceClass ?? null,
    deskLane: input.deskLane ?? null,
    sourceFamily: input.sourceFamily ?? null,
    contentHash,
    identityKey,
    metadata: input.metadata ?? {},
  };
}

export function normalizeVoiceThemeCandidate(
  item: VoiceThemeInput,
  fetchedAt: string,
): ThemeCandidateItem | null {
  const url = typeof item.url === 'string' ? item.url.trim() : '';
  if (!url) return null;

  const sourceSlug = String(item.voice?.slug || '').trim().toLowerCase();
  if (!sourceSlug) return null;

  const externalId = item.sourceId || item.id || null;
  const yt = youtubeVideoId(url, externalId);

  return buildCandidate({
    sourceSystem: 'voice',
    sourceSlug,
    sourceName: item.voice?.title || sourceSlug,
    title: String(item.title || '').trim(),
    summary: item.description ?? null,
    canonicalUrl: url,
    externalId,
    publishedAt: item.publishedAt ?? null,
    fetchedAt,
    role: roleForVoiceItem(),
    provenanceClass: 'COMMENTARY',
    deskLane: 'voices',
    sourceFamily: 'general',
    metadata: {
      voiceId: item.voice?.id ?? null,
      platform: item.voice?.platform ?? null,
      homeUrl: item.voice?.homeUrl ?? null,
      image: item.image ?? null,
      youtubeVideoId: yt,
      originalFeedItemId: item.id ?? null,
    },
  });
}

export function normalizeNewswireThemeCandidate(
  item: NewswireThemeInput,
  fetchedAt: string,
): ThemeCandidateItem | null {
  const url = typeof item.url === 'string' ? item.url.trim() : '';
  if (!url) return null;

  const sourceSlug = String(item.sourceSlug || '').trim().toLowerCase() || 'unknown';
  const canonicalUrl = canonicalizeThemeUrl(url) || url;

  return buildCandidate({
    sourceSystem: 'newswire',
    sourceSlug,
    sourceName: item.source || sourceSlug,
    title: String(item.title || '').trim(),
    summary: item.excerpt || item.note || null,
    canonicalUrl,
    externalId: item.id ?? null,
    publishedAt: item.publishedAt ?? null,
    fetchedAt,
    role: roleForNewswireItem(item),
    provenanceClass: item.isCurated ? 'INDIE' : 'WIRE',
    deskLane: 'newswire',
    sourceFamily: 'general',
    metadata: {
      originalId: item.id ?? null,
      isCurated: Boolean(item.isCurated),
      supportUrl: item.supportUrl ?? null,
      image: item.image ?? null,
      note: item.note ?? null,
      missionScope: item.missionScope ?? null,
      originalUrl: url,
    },
  });
}

export function normalizeIntelThemeCandidate(item: IntelThemeInput): ThemeCandidateItem | null {
  const canonicalUrl = typeof item.canonical_url === 'string' ? item.canonical_url.trim() : '';
  if (!canonicalUrl || !item.id) return null;

  const sourceSlug = String(item.sources?.slug || '').trim().toLowerCase() || 'unknown';
  const provenanceClass = item.sources?.provenance_class ?? null;
  const deskLane = item.sources?.desk_lane || item.desk_lane || null;

  return buildCandidate({
    sourceSystem: 'intel',
    sourceSlug,
    sourceName: item.sources?.name || sourceSlug,
    title: String(item.title || '').trim(),
    summary: item.summary ?? null,
    canonicalUrl,
    externalId: item.external_id ?? null,
    publishedAt: item.published_at ?? null,
    fetchedAt: item.fetched_at ?? null,
    role: roleForIntelItem(item),
    provenanceClass,
    deskLane,
    sourceFamily: item.sources?.source_family ?? null,
    contentHash: item.content_hash ?? null,
    metadata: {
      sourceItemId: item.id,
      surfaceState: item.surface_state ?? null,
      stateChangeType: item.state_change_type ?? null,
      missionTags: Array.isArray(item.mission_tags) ? item.mission_tags : [],
      clusterKeys: item.cluster_keys ?? {},
    },
  });
}

export function dedupeThemeCandidates(items: ThemeCandidateItem[]): ThemeCandidateItem[] {
  const byKey = new Map<string, ThemeCandidateItem>();

  for (const item of items) {
    const key = `${item.sourceSystem}:${item.sourceSlug}:${item.identityKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }

    const nextPublished = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    const existingPublished = existing.publishedAt ? Date.parse(existing.publishedAt) : NaN;
    if (Number.isFinite(nextPublished) && (!Number.isFinite(existingPublished) || nextPublished > existingPublished)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values());
}

export function isPersistableObservationSystem(
  sourceSystem: ThemeSourceSystem,
): sourceSystem is ThemeObservationSourceSystem {
  return sourceSystem === 'voice' || sourceSystem === 'newswire';
}
