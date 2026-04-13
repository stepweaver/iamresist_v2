import { applyContentUseModeToSummary } from '@/lib/intel/contentUse';
import {
  extractBillClusterKeys,
  extractExecutiveClusterKeys,
  mergeClusterParts,
} from '@/lib/intel/clusterKeys';
import { hashNormalizedItem } from '@/lib/intel/hash';
import type { ContentUseMode, FetchKind, NormalizedItem, StateChangeType } from '@/lib/intel/types';

function mapStateChange(slug: string, provenanceClass: string): StateChangeType {
  if (provenanceClass === 'WIRE') return 'wire_item';
  if (provenanceClass === 'COMMENTARY') return 'commentary_item';
  if (provenanceClass === 'SPECIALIST') return 'specialist_item';
  return 'unknown';
}

/** Derive a readable title from the last URL path segment. */
function slugToTitle(slug: string): string {
  const t = slug
    .split('-')
    .filter(Boolean)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
    .trim();
  return t || 'Untitled';
}

function normalizeDemocracyDocketArticleUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hostname !== 'www.democracydocket.com' && u.hostname !== 'democracydocket.com') {
    return null;
  }
  if (u.hostname === 'democracydocket.com') {
    u.hostname = 'www.democracydocket.com';
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'news-alerts') return null;
  if (parts[1] === 'page') return null;
  const slug = parts[parts.length - 1];
  if (!slug) return null;
  u.hash = '';
  u.search = '';
  if (!u.pathname.endsWith('/')) u.pathname = `${u.pathname}/`;
  return u.toString();
}

/**
 * Ingest Democracy Docket news from the public `/news-alerts/` listing HTML.
 * Extracts article URLs under `/news-alerts/{slug}/` (excludes pagination `/news-alerts/page/N/`).
 */
export function parseDemocracyDocketNewsAlertsHtml(
  html: string,
  ctx: {
    sourceSlug: string;
    provenanceClass: string;
    contentUseMode: ContentUseMode;
    fetchKind: FetchKind;
  },
): NormalizedItem[] {
  if (!html || html.length < 200) return [];

  const hrefRe =
    /href=["'](https?:\/\/(?:www\.)?democracydocket\.com\/news-alerts\/[^"'#?\s]+)/gi;
  const seen = new Set<string>();
  const items: NormalizedItem[] = [];

  for (const m of html.matchAll(hrefRe)) {
    const raw = m[1];
    if (!raw) continue;
    const canonicalUrl = normalizeDemocracyDocketArticleUrl(raw);
    if (!canonicalUrl || seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    let slug = '';
    try {
      const u = new URL(canonicalUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      slug = parts[parts.length - 1] ?? '';
    } catch {
      continue;
    }
    if (!slug) continue;

    const title = slugToTitle(slug);
    const summary = applyContentUseModeToSummary(null, ctx.contentUseMode);

    const clusterKeys = mergeClusterParts(
      extractBillClusterKeys(canonicalUrl),
      extractExecutiveClusterKeys(title),
    );

    const base = {
      externalId: canonicalUrl,
      canonicalUrl,
      title,
      summary,
      publishedAt: null as string | null,
      structured: {
        fetchKind: ctx.fetchKind,
        htmlIndex: true,
      },
      clusterKeys,
      stateChangeType: mapStateChange(ctx.sourceSlug, ctx.provenanceClass),
    };

    items.push({
      ...base,
      contentHash: hashNormalizedItem(base),
    });
  }

  return items;
}
