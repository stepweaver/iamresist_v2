import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CuratedArticlesLane from '@/components/home/CuratedArticlesLane';
import { selectHomepageCuratedArticles } from '@/lib/curated/resources';

vi.mock('next/link', () => ({
  default: ({ href, children }) => React.createElement('a', { href }, children),
}));

function article(overrides) {
  return {
    id: overrides.id,
    title: overrides.title,
    slug: overrides.slug,
    path: `/curated/articles/${overrides.slug}`,
    url: overrides.url,
    source: overrides.source,
    resourceType: overrides.resourceType || 'Article',
    editorialNote: overrides.editorialNote || '',
    featured: overrides.featured === true,
    published: true,
    status: 'Published',
    publishedAt: overrides.publishedAt || null,
    createdTime: overrides.createdTime || '2026-10-01T00:00:00.000Z',
    contentType: 'curated-article',
    sourceType: 'curated-article',
  };
}

describe('homepage curated article lane', () => {
  it('places the published guide inside the homepage feed and links to its local page', () => {
    const pakman = article({
      id: 'pakman',
      title: "David Pakman's 2026 Midterm Election Guide",
      slug: 'david-pakman-2026-midterm-election-guide',
      url: 'https://davidpakman.com/white-paper/26midtermguide/',
      source: 'David Pakman',
      resourceType: 'Guide',
      editorialNote: 'A voting guide from the creator.',
      featured: true,
      publishedAt: null,
      createdTime: '2026-10-01T00:00:00.000Z',
    });
    const newer = article({
      id: 'newer',
      title: 'Later briefing',
      slug: 'later-briefing',
      url: 'https://example.com/later',
      source: 'Example',
      featured: false,
      publishedAt: '2026-11-01',
      createdTime: '2026-11-01T00:00:00.000Z',
    });

    const selected = selectHomepageCuratedArticles([newer, pakman]);
    const html = renderToStaticMarkup(React.createElement(CuratedArticlesLane, { articles: selected }));

    expect(selected.map((item) => item.slug)).toEqual(['david-pakman-2026-midterm-election-guide']);
    expect(html).toContain('data-testid="home-curated-articles"');
    expect(html).toContain('href="/curated/articles/david-pakman-2026-midterm-election-guide"');
    expect(html).not.toContain('https://davidpakman.com/white-paper/26midtermguide/');
    expect(html).not.toContain('later-briefing');
  });
});
