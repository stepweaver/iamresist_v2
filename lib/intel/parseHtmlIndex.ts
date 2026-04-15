import { applyContentUseModeToSummary } from '@/lib/intel/contentUse';
import {
  extractBillClusterKeys,
  extractExecutiveClusterKeys,
  mergeClusterParts,
} from '@/lib/intel/clusterKeys';
import { hashNormalizedItem } from '@/lib/intel/hash';
import type { ContentUseMode, FetchKind, NormalizedItem, StateChangeType } from '@/lib/intel/types';

function mapStateChange(input: {
  slug: string;
  provenanceClass: string;
  deskLane?: string | null;
  sourceFamily?: string | null;
}): StateChangeType {
  const slug = input.slug;
  const provenanceClass = input.provenanceClass;
  if (provenanceClass === 'SCHEDULE') return 'scheduled_release';
  if (provenanceClass === 'WIRE') return 'wire_item';
  if (provenanceClass === 'COMMENTARY') return 'commentary_item';
  if (provenanceClass === 'SPECIALIST') return 'specialist_item';

  // Match RSS behavior: treat defense/ops primaries as press statements, not unknown.
  const lane = input.deskLane || null;
  const fam = input.sourceFamily || null;
  if (
    provenanceClass === 'PRIMARY' &&
    (lane === 'defense_ops' || fam === 'defense_primary' || fam === 'combatant_command')
  ) {
    return 'press_statement';
  }

  return 'unknown';
}

function canonHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function hostMatchesUrl(u: URL, expectedHost: string): boolean {
  return canonHost(u.hostname) === canonHost(expectedHost);
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
    deskLane?: string | null;
    sourceFamily?: string | null;
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
      imageUrl: null as string | null,
      structured: {
        fetchKind: ctx.fetchKind,
        htmlIndex: true,
      },
      clusterKeys,
      stateChangeType: mapStateChange({
        slug: ctx.sourceSlug,
        provenanceClass: ctx.provenanceClass,
        deskLane: ctx.deskLane ?? null,
        sourceFamily: ctx.sourceFamily ?? null,
      }),
    };

    items.push({
      ...base,
      contentHash: hashNormalizedItem(base),
    });
  }

  return items;
}

/**
 * Generic listing HTML: same-host links (metadata-only titles from URL slug).
 * Used for BLS/BEA schedule pages and similar.
 * Pass `baseUrl` (final redirect URL from fetch) so root-relative `href="/news.release/..."` resolves.
 */
export function parseSameHostArticleLinksHtml(
  html: string,
  ctx: {
    sourceSlug: string;
    provenanceClass: string;
    deskLane?: string | null;
    sourceFamily?: string | null;
    contentUseMode: ContentUseMode;
    fetchKind: FetchKind;
    /** e.g. `www.bls.gov` */
    hostname: string;
    /**
     * If set, pathname must include this substring, or (when an array) any one of them.
     * BLS `schedule/.../home.htm` often links to monthly `MM_sched.htm` pages, not directly to `news.release`.
     */
    pathIncludes?: string | string[];
    /** Page URL used to resolve relative hrefs (e.g. `https://www.bls.gov/schedule/2026/home.htm`). */
    baseUrl?: string | null;
  },
): NormalizedItem[] {
  if (!html || html.length < 200) return [];

  const pathIncludesOk = (pathname: string): boolean => {
    const p = ctx.pathIncludes;
    if (p == null) return true;
    if (Array.isArray(p)) {
      if (p.length === 0) return true;
      return p.some((frag) => frag && pathname.includes(frag));
    }
    return pathname.includes(p);
  };

  const hostEsc = ctx.hostname.replace(/\./g, '\\.');
  const candidateUrls = new Set<string>();

  const absRe = new RegExp(`href=["'](https?://${hostEsc}[^"'#\\s]+)`, 'gi');
  for (const m of html.matchAll(absRe)) {
    const raw = m[1];
    if (raw) candidateUrls.add(raw);
  }

  const base = ctx.baseUrl?.trim();
  if (base) {
    try {
      const relRe = /href=["'](\/[^"'#\s]+)/gi;
      for (const m of html.matchAll(relRe)) {
        const path = m[1];
        if (!path) continue;
        try {
          const u = new URL(path, base);
          if (hostMatchesUrl(u, ctx.hostname)) {
            candidateUrls.add(u.toString());
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* invalid baseUrl */
    }
  }

  const items: NormalizedItem[] = [];
  const seen = new Set<string>();

  for (const raw of candidateUrls) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (!hostMatchesUrl(u, ctx.hostname)) continue;
    if (!pathIncludesOk(u.pathname)) continue;

    const canonicalUrl = u.toString();
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    const slug = u.pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slug) continue;

    const title = slugToTitle(slug.replace(/\.htm?$/i, ''));
    const summary = applyContentUseModeToSummary(null, ctx.contentUseMode);

    const clusterKeys = mergeClusterParts(
      extractBillClusterKeys(canonicalUrl),
      extractExecutiveClusterKeys(title),
    );

    const baseItem = {
      externalId: canonicalUrl,
      canonicalUrl,
      title,
      summary,
      publishedAt: null as string | null,
      imageUrl: null as string | null,
      structured: {
        fetchKind: ctx.fetchKind,
        htmlIndex: true,
        scheduleListing: true,
      },
      clusterKeys,
      stateChangeType: mapStateChange({
        slug: ctx.sourceSlug,
        provenanceClass: ctx.provenanceClass,
        deskLane: ctx.deskLane ?? null,
        sourceFamily: ctx.sourceFamily ?? null,
      }),
    };

    items.push({
      ...baseItem,
      contentHash: hashNormalizedItem(baseItem),
    });
  }

  return items;
}

const USNI_HOST = 'news.usni.org';

/**
 * USNI News listing: article URLs on news.usni.org (e.g. fleet tracker posts).
 */
export function parseUsniNewsListingHtml(
  html: string,
  ctx: {
    sourceSlug: string;
    provenanceClass: string;
    deskLane?: string | null;
    sourceFamily?: string | null;
    contentUseMode: ContentUseMode;
    fetchKind: FetchKind;
    baseUrl?: string | null;
  },
): NormalizedItem[] {
  if (!html || html.length < 200) return [];

  const candidateUrls = new Set<string>();
  const hrefAbs = /href=["'](https?:\/\/news\.usni\.org\/[^\s"'#]+)/gi;
  for (const m of html.matchAll(hrefAbs)) {
    const raw = m[1];
    if (raw) candidateUrls.add(raw);
  }

  const base = ctx.baseUrl?.trim();
  if (base) {
    try {
      const hrefRel = /href=["'](\/[^"'#\s]+)/gi;
      for (const m of html.matchAll(hrefRel)) {
        const path = m[1];
        if (!path) continue;
        try {
          const u = new URL(path, base);
          if (canonHost(u.hostname) === canonHost(USNI_HOST)) {
            candidateUrls.add(u.toString());
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* invalid baseUrl */
    }
  }

  const items: NormalizedItem[] = [];
  const seen = new Set<string>();

  for (const raw of candidateUrls) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (canonHost(u.hostname) !== canonHost(USNI_HOST)) continue;
    if (!/fleet|marine|tracker|carrier/i.test(u.pathname)) continue;

    const canonicalUrl = u.toString();
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    const slug = u.pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slug) continue;

    const title = slugToTitle(slug);
    const summary = applyContentUseModeToSummary(null, ctx.contentUseMode);

    const clusterKeys = mergeClusterParts(
      extractBillClusterKeys(canonicalUrl),
      extractExecutiveClusterKeys(title),
    );

    const baseItem = {
      externalId: canonicalUrl,
      canonicalUrl,
      title,
      summary,
      publishedAt: null as string | null,
      imageUrl: null as string | null,
      structured: {
        fetchKind: ctx.fetchKind,
        htmlIndex: true,
        usniListing: true,
      },
      clusterKeys,
      stateChangeType: mapStateChange({
        slug: ctx.sourceSlug,
        provenanceClass: ctx.provenanceClass,
        deskLane: ctx.deskLane ?? null,
        sourceFamily: ctx.sourceFamily ?? null,
      }),
    };

    items.push({
      ...baseItem,
      contentHash: hashNormalizedItem(baseItem),
    });
  }

  return items;
}

const CENTCOM_HOST = 'www.centcom.mil';

function canonUrlNoQuery(raw: string, baseUrl?: string | null): string | null {
  try {
    const u = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    u.hash = '';
    u.search = '';
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * CENTCOM press releases listing: pulls canonical Press-Release-View Article URLs.
 * Intentionally does not paginate: listing page only.
 */
export function parseCentcomPressReleasesHtml(
  html: string,
  ctx: {
    sourceSlug: string;
    provenanceClass: string;
    deskLane?: string | null;
    sourceFamily?: string | null;
    contentUseMode: ContentUseMode;
    fetchKind: FetchKind;
    baseUrl?: string | null;
  },
): NormalizedItem[] {
  if (!html || html.length < 200) return [];

  const candidateUrls = new Set<string>();
  const absRe = /href=["'](https?:\/\/www\.centcom\.mil\/MEDIA\/PRESS-RELEASES\/Press-Release-View\/Article\/[^"'#?\s]+)\/?["']/gi;
  for (const m of html.matchAll(absRe)) {
    const raw = m[1];
    if (raw) candidateUrls.add(raw);
  }

  const base = ctx.baseUrl?.trim();
  if (base) {
    const relRe = /href=["'](\/MEDIA\/PRESS-RELEASES\/Press-Release-View\/Article\/[^"'#?\s]+)\/?["']/gi;
    for (const m of html.matchAll(relRe)) {
      const path = m[1];
      if (path) candidateUrls.add(path);
    }
  }

  const items: NormalizedItem[] = [];
  const seen = new Set<string>();

  for (const raw of candidateUrls) {
    const canonicalUrl = canonUrlNoQuery(raw, base);
    if (!canonicalUrl) continue;
    let u: URL;
    try {
      u = new URL(canonicalUrl);
    } catch {
      continue;
    }
    if (!hostMatchesUrl(u, CENTCOM_HOST)) continue;
    if (!u.pathname.includes('/MEDIA/PRESS-RELEASES/Press-Release-View/Article/')) continue;
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    const slug = u.pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slug) continue;

    const title = slugToTitle(slug);
    const summary = applyContentUseModeToSummary(null, ctx.contentUseMode);

    const clusterKeys = mergeClusterParts(
      extractBillClusterKeys(canonicalUrl),
      extractExecutiveClusterKeys(title),
    );

    const baseItem = {
      externalId: canonicalUrl,
      canonicalUrl,
      title,
      summary,
      publishedAt: null as string | null,
      imageUrl: null as string | null,
      structured: {
        fetchKind: ctx.fetchKind,
        htmlIndex: true,
        centcomListing: true,
      },
      clusterKeys,
      stateChangeType: mapStateChange({
        slug: ctx.sourceSlug,
        provenanceClass: ctx.provenanceClass,
        deskLane: ctx.deskLane ?? null,
        sourceFamily: ctx.sourceFamily ?? null,
      }),
    };

    items.push({
      ...baseItem,
      contentHash: hashNormalizedItem(baseItem),
    });
  }

  return items;
}

const OFAC_HOST = 'ofac.treasury.gov';

/**
 * OFAC recent actions listing: extracts detail pages under `/recent-actions/{id}`.
 * Metadata-only (title derived from slug by default).
 */
export function parseOfacRecentActionsHtml(
  html: string,
  ctx: {
    sourceSlug: string;
    provenanceClass: string;
    deskLane?: string | null;
    sourceFamily?: string | null;
    contentUseMode: ContentUseMode;
    fetchKind: FetchKind;
    baseUrl?: string | null;
  },
): NormalizedItem[] {
  if (!html || html.length < 200) return [];

  const candidateUrls = new Set<string>();
  const absRe = /href=["'](https?:\/\/ofac\.treasury\.gov\/recent-actions\/[^"'#?\s]+)\/?["']/gi;
  for (const m of html.matchAll(absRe)) {
    const raw = m[1];
    if (raw) candidateUrls.add(raw);
  }

  const base = ctx.baseUrl?.trim();
  if (base) {
    const relRe = /href=["'](\/recent-actions\/[^"'#?\s]+)\/?["']/gi;
    for (const m of html.matchAll(relRe)) {
      const path = m[1];
      if (path) candidateUrls.add(path);
    }
  }

  const items: NormalizedItem[] = [];
  const seen = new Set<string>();

  for (const raw of candidateUrls) {
    const canonicalUrl = canonUrlNoQuery(raw, base);
    if (!canonicalUrl) continue;
    let u: URL;
    try {
      u = new URL(canonicalUrl);
    } catch {
      continue;
    }
    if (!hostMatchesUrl(u, OFAC_HOST)) continue;
    if (!u.pathname.startsWith('/recent-actions/')) continue;
    if (u.pathname === '/recent-actions' || u.pathname === '/recent-actions/') continue;
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);

    const slug = u.pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slug) continue;

    const title = slugToTitle(slug);
    const summary = applyContentUseModeToSummary(null, ctx.contentUseMode);

    const clusterKeys = mergeClusterParts(
      extractBillClusterKeys(canonicalUrl),
      extractExecutiveClusterKeys(title),
    );

    const baseItem = {
      externalId: canonicalUrl,
      canonicalUrl,
      title,
      summary,
      publishedAt: null as string | null,
      imageUrl: null as string | null,
      structured: {
        fetchKind: ctx.fetchKind,
        htmlIndex: true,
        ofacRecentActions: true,
      },
      clusterKeys,
      stateChangeType: mapStateChange({
        slug: ctx.sourceSlug,
        provenanceClass: ctx.provenanceClass,
        deskLane: ctx.deskLane ?? null,
        sourceFamily: ctx.sourceFamily ?? null,
      }),
    };

    items.push({
      ...baseItem,
      contentHash: hashNormalizedItem(baseItem),
    });
  }

  return items;
}
