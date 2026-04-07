import pLimit from 'p-limit';
import { unstable_cache } from 'next/cache';
import { NEWSWIRE_SOURCES } from '@/lib/data/newswire-sources';
import { fetchFeedItems } from '@/lib/feeds/rss';
import { getCuratedArticles } from '@/lib/notion/curatedArticles.repo';

const CONCURRENCY = 4;
const PER_SOURCE_LIMIT = 20;
const REVALIDATE = 300;
const FEED_CACHE_TAG = 'newswire';

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
    isCurated: false,
  };
}

async function buildNewswireStories() {
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

  return deduped;
}

export async function getNewswireStories() {
  return unstable_cache(buildNewswireStories, ['newswire-stories-v1'], {
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
