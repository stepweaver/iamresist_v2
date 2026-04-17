import pLimit from 'p-limit';
import { unstable_cache } from 'next/cache';
import { NEWSWIRE_SOURCES } from '@/lib/data/newswire-sources';
import { fetchFeedItems } from '@/lib/feeds/rss';
import { enrichStoriesWithOgImages, fetchSourceScopedArticleImageUncached } from '@/lib/feeds/ogImage';
import { dropTinyHaaretzThumbsForOgEnrichment } from '@/lib/feeds/newswireImage';
import { getCuratedArticles } from '@/lib/notion/curatedArticles.repo';

const CONCURRENCY = 4;
const PER_SOURCE_LIMIT = 20;
const REVALIDATE = 300;
const FEED_CACHE_TAG = 'newswire';

function parseNewswireOgFallbackEnabled() {
  return String(process.env.NEWSWIRE_OG_FALLBACK || '').trim() === '1';
}

function stripHtml(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateExcerpt(text, max = 200) {
  const stripped = stripHtml(text);
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max).trim() + '…';
}

export function normalizeStoryUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const url = new URL(u);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    const keep = new URLSearchParams();
    for (const [k, v] of url.searchParams.entries()) {
      const lower = k.toLowerCase();
      if (lower.startsWith('utm_') || lower === 'fbclid' || lower === 'gclid') {
        continue;
      }
      keep.append(k, v);
    }
    url.search = keep.toString();
    return url.href.replace(/\/$/, '');
  } catch {
    return u.trim().toLowerCase();
  }
}

export function dedupeStoriesByCanonicalUrl(stories) {
  const byUrl = new Map();
  for (const s of stories) {
    const key = normalizeStoryUrl(s.url);
    if (!key) continue;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, s);
      continue;
    }
    const sCurated = Boolean(s.isCurated);
    const eCurated = Boolean(existing.isCurated);
    if (sCurated && !eCurated) {
      byUrl.set(key, s);
      continue;
    }
    if (!sCurated && eCurated) continue;
    if (new Date(s.publishedAt || 0) > new Date(existing.publishedAt || 0)) {
      byUrl.set(key, s);
    }
  }
  return Array.from(byUrl.values()).sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  );
}

function toRssStory(item, source) {
  const guid = (item.id || item.sourceId || item.url || '').toString();
  const id = `${source.slug}__${guid}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    id,
    source: source.name,
    sourceSlug: source.slug,
    title: item.title || '',
    url: item.url || '',
    publishedAt: item.publishedAt || null,
    excerpt: truncateExcerpt(item.description || ''),
    image: item.image || null,
    supportUrl: source.supportUrl || null,
    note: '',
    isCurated: false,
  };
}

/**
 * Prefer distinct sources (newest first), then fill by recency — mirrors source
 * `pickDiverseTopStories` so one fast RSS publisher does not own every homepage slot.
 */
export function pickDiverseTopStories(stories, limit, maxPerSourceFirstPass = 1) {
  if (!Array.isArray(stories) || stories.length === 0) return [];

  const cap = Math.max(1, Number(limit) || 3);
  const maxPer = Math.max(1, Number(maxPerSourceFirstPass) || 1);

  const sorted = [...stories].sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  );

  const picked = [];
  const pickedIds = new Set();
  const countBySource = {};

  for (const s of sorted) {
    if (picked.length >= cap) break;
    const slug = s.sourceSlug || 'unknown';

    if ((countBySource[slug] || 0) < maxPer) {
      picked.push(s);
      pickedIds.add(s.id);
      countBySource[slug] = (countBySource[slug] || 0) + 1;
    }
  }

  for (const s of sorted) {
    if (picked.length >= cap) break;
    if (!pickedIds.has(s.id)) {
      picked.push(s);
      pickedIds.add(s.id);
    }
  }

  return picked;
}

async function enrichStoriesWithSourceScopedImages(stories, opts = {}) {
  const max = Math.min(12, Math.max(0, Number(opts.max) ?? 4));
  const concurrency = Math.min(2, Math.max(1, Number(opts.concurrency) ?? 1));
  if (!Array.isArray(stories) || max === 0) return stories;

  const need = [];
  for (const story of stories) {
    if (!story?.url || story.image) continue;
    need.push(story);
    if (need.length >= max) break;
  }
  if (need.length === 0) return stories;

  const limit = pLimit(concurrency);
  await Promise.all(
    need.map((story) =>
      limit(async () => {
        try {
          const fallback = await fetchSourceScopedArticleImageUncached(story.url);
          if (fallback) story.image = fallback;
        } catch {
          // keep null; this is a narrow best-effort recovery path
        }
      }),
    ),
  );

  return stories;
}

async function buildNewswireStories() {
  const ogFallbackEnabled = parseNewswireOgFallbackEnabled();

  const rssSources = NEWSWIRE_SOURCES.filter(
    (s) => s.automation === 'rss' && s.rssUrl && s.status === 'active'
  );

  const limit = pLimit(CONCURRENCY);

  const [curatedStories, rssResults] = await Promise.all([
    getCuratedArticles({ limit: 30 }).then((articles) =>
      articles.map((article) => ({
        id: `curated-article__${article.id}`,
        source: article.source || 'Curated',
        sourceSlug: 'curated',
        title: article.title || '',
        url: article.url || '',
        publishedAt: article.publishedAt || article.createdTime || null,
        excerpt: '',
        image: article.heroImage || null,
        supportUrl: article.supportUrl || null,
        note: article.description ? truncateExcerpt(article.description, 400) : '',
        isCurated: true,
      }))
    ),
    Promise.allSettled(
      rssSources.map((source) =>
        limit(async () => {
          const items = await fetchFeedItems(source.rssUrl, { limit: PER_SOURCE_LIMIT });
          return (items || []).map((it) => toRssStory(it, source));
        })
      )
    ),
  ]);

  const rssStories = rssResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .filter((s) => s.url && s.title);

  const merged = [...(curatedStories || []), ...rssStories];
  const deduped = dedupeStoriesByCanonicalUrl(merged);

  dropTinyHaaretzThumbsForOgEnrichment(deduped);
  await enrichStoriesWithSourceScopedImages(deduped, { max: 4, concurrency: 1 });

  // Hot-path OG fallback is OFF by default.
  // Enable only for debugging/emergency: NEWSWIRE_OG_FALLBACK=1
  if (ogFallbackEnabled) {
    await enrichStoriesWithOgImages(deduped, { max: 2, concurrency: 1 });
  }

  return deduped;
}

export async function getNewswireStories() {
  return unstable_cache(buildNewswireStories, ['newswire-stories-v4'], {
    revalidate: REVALIDATE,
    tags: [FEED_CACHE_TAG],
  })();
}

export function getNewswireSources() {
  return NEWSWIRE_SOURCES.filter((s) => s.status === 'active');
}

export async function getNewswireData() {
  const [stories, sources] = await Promise.all([
    getNewswireStories(),
    Promise.resolve(getNewswireSources()),
  ]);
  return { stories, sources };
}
