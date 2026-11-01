import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  article: null,
  blocks: [],
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/curated/articles', () => ({
  getCuratedArticleBySlug: async (slug) => (state.article?.slug === slug ? state.article : null),
  curatedArticleActionLabel: (article) => (String(article?.resourceType || '').toLowerCase().includes('guide') ? 'Get the Guide' : 'Read Original'),
  presentCuratedArticle: (article) => ({
    editorial: null,
    metadataImage: article?.image?.src
      ? { url: article.image.src, alt: article.image.alt || '' }
      : { url: '/resist_sticker.png', width: 1200, height: 1200, alt: 'I AM [RESIST]' },
    displayImage: article?.image || null,
    omitBlockIds: [],
  }),
}));

vi.mock('@/lib/notion-blocks', () => ({
  getCachedPageBlocks: async () => state.blocks,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }) => React.createElement('a', { href }, children),
}));

vi.mock('@/components/ShareButton', () => ({
  default: ({ url }) => React.createElement('button', { type: 'button', 'data-share-url': url }, 'Share'),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

function pakman(overrides = {}) {
  return {
    id: '40abc620-4ba0-81bc-8c15-d2e03b3c9283',
    contentType: 'curated-article',
    title: "David Pakman's 2026 Midterm Election Guide",
    slug: 'david-pakman-2026-midterm-election-guide',
    path: '/curated/articles/david-pakman-2026-midterm-election-guide',
    url: 'https://davidpakman.com/white-paper/26midtermguide/',
    source: 'David Pakman',
    resourceType: 'Guide',
    editorialNote: 'A voting guide selected for readers who want the original source.',
    featured: true,
    status: 'Published',
    publishedAt: null,
    image: null,
    propertyImage: null,
    coverImage: null,
    ...overrides,
  };
}

describe('curated article page', () => {
  beforeEach(() => {
    state.article = pakman();
    state.blocks = [];
  });

  it('uses the local canonical URL and keeps the original link on the page', async () => {
    const { generateMetadata, default: Page } = await import('@/app/(site)/curated/articles/[slug]/page');
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'david-pakman-2026-midterm-election-guide' }),
    });
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: 'david-pakman-2026-midterm-election-guide' }) }),
    );

    expect(meta.alternates.canonical).toBe('/curated/articles/david-pakman-2026-midterm-election-guide');
    expect(meta.description).toContain('voting guide');
    expect(meta.openGraph.url).toContain('/curated/articles/david-pakman-2026-midterm-election-guide');
    expect(meta.openGraph.images[0].url).toBe('/resist_sticker.png');
    expect(html).toContain("David Pakman&#x27;s 2026 Midterm Election Guide");
    expect(html).toContain('David Pakman');
    expect(html).toContain('Guide');
    expect(html).toContain('I AM [RESIST] editorial note');
    expect(html).toContain('Get the Guide');
    expect(html).toContain('https://davidpakman.com/white-paper/26midtermguide/');
    expect(html).toContain('href="/curated/articles"');
    expect(html).toContain('data-share-url="https://www.iamresist.org/curated/articles/david-pakman-2026-midterm-election-guide"');
    expect(html).not.toContain('notion.so');
  });

  it('does not publish a draft as a public page', async () => {
    state.article = null;
    const { default: Page } = await import('@/app/(site)/curated/articles/[slug]/page');
    await expect(Page({ params: Promise.resolve({ slug: 'draft-guide' }) })).rejects.toThrow('NOT_FOUND');
  });
});
