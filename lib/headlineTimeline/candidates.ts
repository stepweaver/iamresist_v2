import type { DeskLane, ProvenanceClass } from '@/lib/intel/types';
import type { HeadlineCandidate, HeadlineChannel, HeadlineSourceKind } from '@/lib/headlineTimeline/types';

/** Commerce roundups and live sports boards. They are not story headlines. */
const NOISE_TITLE = [
  /\bpromo\s+codes?\b/i,
  /\bcoupons?\b/i,
  /\b\d+%\s+off\b/i,
  /\bbest\b[^.]{0,80}\b20\d\d\b/i,
  /\buefa\b/i,
  /\bnations league\b/i,
  /\bpremier league\b/i,
  /\bchampions league\b/i,
  /\bformula\s*1\b/i,
  /\bgrand prix\b/i,
  /\blive\s*:\s*.+\bvs\.?\b/i,
];

export function isHeadlineNoiseTitle(title: string): boolean {
  const text = String(title || '');
  return NOISE_TITLE.some((pattern) => pattern.test(text));
}

export type HeadlineSourceEmbed = {
  id?: string;
  slug?: string;
  name?: string;
  provenance_class?: ProvenanceClass | null;
  desk_lane?: DeskLane | null;
};

export type HeadlineSourceItemRecord = {
  id: string;
  title: string | null;
  summary: string | null;
  canonical_url: string | null;
  published_at: string | null;
  surface_state: string | null;
  sources: HeadlineSourceEmbed | HeadlineSourceEmbed[] | null;
};

export type HeadlineNewswireStory = {
  id?: string;
  title?: string;
  url?: string;
  publishedAt?: string | null;
  excerpt?: string;
  source?: string;
  sourceSlug?: string;
};

function sourceOf(row: HeadlineSourceItemRecord): HeadlineSourceEmbed | null {
  if (!row.sources) return null;
  return Array.isArray(row.sources) ? row.sources[0] || null : row.sources;
}

export function looseHeadlineUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}

export function candidateFromSourceItem(row: HeadlineSourceItemRecord): HeadlineCandidate | null {
  const source = sourceOf(row);
  const title = String(row.title || '').trim();
  const url = String(row.canonical_url || '').trim();
  const publishedAt = row.published_at ? String(row.published_at) : null;
  if (!title || !url || !publishedAt || !source) return null;
  if (row.surface_state === 'suppressed') return null;
  if (source.desk_lane === 'indicators') return null;
  if (source.provenance_class === 'SCHEDULE') return null;

  const creator = source.desk_lane === 'voices' || source.provenance_class === 'COMMENTARY';
  const sourceKind: HeadlineSourceKind = creator ? 'creator' : 'news';
  const channel: HeadlineChannel = creator ? 'voices' : 'intel';
  const sourceId = `${channel}:${source.id || source.slug || source.name || row.id}`;
  return {
    id: String(row.id),
    sourceId,
    sourceName: String(source.name || source.slug || 'Source'),
    sourceKind,
    channel,
    title,
    url,
    publishedAt,
    summary: row.summary ? String(row.summary) : null,
  };
}

export function candidateFromNewswireStory(story: HeadlineNewswireStory): HeadlineCandidate | null {
  const title = String(story.title || '').trim();
  const url = String(story.url || '').trim();
  const publishedAt = story.publishedAt ? String(story.publishedAt) : null;
  if (!title || !url || !publishedAt) return null;
  const slug = String(story.sourceSlug || story.source || 'newswire').trim() || 'newswire';
  return {
    id: `newswire:${story.id || looseHeadlineUrl(url)}`,
    sourceId: `newswire:${slug}`,
    sourceName: String(story.source || slug),
    sourceKind: 'news',
    channel: 'newswire',
    title,
    url,
    publishedAt,
    summary: story.excerpt ? String(story.excerpt) : null,
  };
}

export function candidateFromVoiceItem(item: {
  sourceItemId: string;
  title: string | null;
  url: string;
  publishedAt: string | null;
  creatorId: string | null;
  creatorName: string | null;
}): HeadlineCandidate | null {
  const title = String(item.title || '').trim();
  const url = String(item.url || '').trim();
  const publishedAt = item.publishedAt ? String(item.publishedAt) : null;
  const id = String(item.sourceItemId || '').trim();
  if (!title || !url || !publishedAt || !id) return null;
  const creatorKey = String(item.creatorId || item.creatorName || id).trim();
  return {
    id,
    sourceId: `voices:${creatorKey}`,
    sourceName: String(item.creatorName || creatorKey),
    sourceKind: 'creator',
    channel: 'voices',
    title,
    url,
    publishedAt,
    summary: null,
  };
}

/** Same URL collapses to one title. A persisted intel row wins over the live Newswire copy. */
export function dedupeHeadlineCandidates(candidates: HeadlineCandidate[]): HeadlineCandidate[] {
  const byUrl = new Map<string, HeadlineCandidate>();
  const rest: HeadlineCandidate[] = [];
  for (const candidate of candidates) {
    const key = looseHeadlineUrl(candidate.url);
    if (!key) {
      rest.push(candidate);
      continue;
    }
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, candidate);
      continue;
    }
    const preferIncoming = existing.channel === 'newswire' && candidate.channel !== 'newswire';
    if (preferIncoming) byUrl.set(key, candidate);
  }
  return [...byUrl.values(), ...rest];
}
