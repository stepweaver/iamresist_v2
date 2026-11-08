import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { parseImageHeader, readPublicEditorialSize } from '@/lib/journal/publicEditorialSize';
import { buildArticleSchema } from '@/lib/seo/schema';

const state = vi.hoisted(() => ({
  entry: null,
  blocks: [],
}));

vi.mock('@/lib/journal', () => ({
  getJournalEntryBySlug: async (slug) => (state.entry?.slug === slug ? state.entry : null),
  getJournalEntryById: async () => null,
  getAllJournalEntries: async () => [],
  journalEntryBodyEditedTime: async () => null,
  resolvePublishedJournalEntry: async (slug) => {
    const entry = state.entry && (state.entry.slug === slug || state.entry.id === slug) ? state.entry : null;
    return entry
      ? { entry, availability: 'available' }
      : { entry: null, availability: 'missing' };
  },
  readJournalEntryBlocks: async () => ({ status: 'ok', blocks: state.blocks }),
}));

vi.mock('@/lib/notion-blocks', () => ({
  getCachedPageBlocks: async () => state.blocks,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }) => React.createElement('a', { href }, children),
}));

const SIGNED =
  'https://prod-files-secure.s3.us-west-2.amazonaws.com/note/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123';

function entry(overrides = {}) {
  return {
    id: 'page-1',
    title: 'Show Me the Proof',
    slug: 'show-me-the-proof',
    date: '2026-04-02',
    tags: ['Law'],
    summary: 'A public record of power.',
    featured: false,
    propertyImage: null,
    coverImage: null,
    createdTime: '2026-04-02T12:00:00.000Z',
    lastEditedTime: '2026-04-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('journal editorial metadata and layout', () => {
  beforeEach(() => {
    state.entry = entry();
    state.blocks = [
      {
        id: 'p-1',
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'The essay continues from the public record.' }] },
      },
    ];
  });

  it('keeps the site fallback image when an essay has no artwork', async () => {
    const { generateMetadata, default: Page } = await import('@/app/(site)/journal/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'show-me-the-proof' }) });
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: 'show-me-the-proof' }) }),
    );

    expect(meta.openGraph.images).toEqual([
      {
        url: '/resist_sticker.png',
        width: 1200,
        height: 1200,
        alt: 'I AM [RESIST] - The flag of resistance',
      },
    ]);
    expect(meta.openGraph.title).toContain('Show Me the Proof');
    expect(meta.openGraph.description).toContain('A public record of power.');
    expect(meta.twitter.card).toBe('summary_large_image');
    expect(meta.twitter.images).toEqual(['https://www.iamresist.org/resist_sticker.png']);
    expect(html).not.toContain('journal-editorial');
    expect(html).not.toContain('journal-pullquote');
    expect(html).toContain('journal-article__deck');
    expect(html).toContain('A public record of power.');
    expect(html).toContain('https://www.iamresist.org/resist_sticker.png');
    expect(html).toContain('The essay continues from the public record.');

    const article = buildArticleSchema({
      headline: 'Show Me the Proof',
      url: '/journal/show-me-the-proof',
      image: meta.openGraph.images[0],
    });
    expect(article.image).toBe('https://www.iamresist.org/resist_sticker.png');
  });

  it('shows a supplied pull quote and reading time without inventing either', async () => {
    state.entry = entry({
      pullQuote: 'Question the record before you repeat it.',
      readingMinutes: 7,
      featured: true,
    });
    const { default: Page } = await import('@/app/(site)/journal/[slug]/page');
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: 'show-me-the-proof' }) }),
    );

    expect(html).toContain('journal-pullquote');
    expect(html).toContain('Question the record before you repeat it.');
    expect(html).toContain('7 min read');
    expect(html).toContain('Featured');
    expect(html).not.toContain('journal-editorial');
  });

  it('uses a stable same-origin image for Open Graph, Twitter, and Article schema', async () => {
    state.entry = entry({
      propertyImage: { url: SIGNED, fileName: 'essay.png', caption: '' },
      coverImage: { url: 'https://cdn.example/cover.jpg' },
    });
    state.blocks = [
      {
        id: 'body-image',
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://cdn.example/body.jpg' },
          caption: [{ plain_text: 'Body caption' }],
        },
      },
      {
        id: 'p-1',
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'The essay continues from the public record.' }] },
      },
    ];

    const { generateMetadata, default: Page } = await import('@/app/(site)/journal/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'show-me-the-proof' }) });
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: 'show-me-the-proof' }) }),
    );

    expect(meta.openGraph.images[0].url).toBe('/journal/show-me-the-proof/image');
    expect(JSON.stringify(meta.openGraph)).not.toContain('X-Amz');
    expect(JSON.stringify(meta.twitter)).not.toContain('prod-files-secure');
    expect(meta.twitter.card).toBe('summary_large_image');
    expect(meta.twitter.images).toEqual([
      'https://www.iamresist.org/journal/show-me-the-proof/image',
    ]);
    expect(meta.openGraph.title).toContain('Show Me the Proof');
    expect(meta.description).toContain('A public record of power.');

    const article = buildArticleSchema({
      headline: state.entry.title,
      description: meta.description,
      url: '/journal/show-me-the-proof',
      image: meta.openGraph.images[0],
    });
    expect(article.image).toBe('https://www.iamresist.org/journal/show-me-the-proof/image');
    expect(html).toContain('src="/journal/show-me-the-proof/image"');
    expect(html).toContain('journal-editorial');
    expect(html.indexOf('journal-article__title')).toBeLessThan(html.indexOf('journal-editorial'));
    expect(html.indexOf('journal-editorial')).toBeLessThan(html.indexOf('journal-prose'));
    expect(html.split('journal-prose')[0]).not.toContain('cdn.example/body.jpg');
    expect(html.split('journal-prose')[1]).toContain('https://cdn.example/body.jpg');
    expect(html).not.toContain('X-Amz');
  });

  it('shows a body image once, under the title, with its caption', async () => {
    state.blocks = [
      {
        id: 'body-image',
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://cdn.example/essay.jpg' },
          caption: [{ plain_text: 'Satirical editorial illustration.' }],
        },
      },
      {
        id: 'p-1',
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'The essay continues from the public record.' }] },
      },
    ];

    const { default: Page } = await import('@/app/(site)/journal/[slug]/page');
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: 'show-me-the-proof' }) }),
    );
    const prose = html.split('journal-prose')[1] || '';

    expect(html).toContain('alt="Satirical editorial illustration."');
    expect(html).toContain('Satirical editorial illustration.');
    expect(prose).not.toContain('https://cdn.example/essay.jpg');
    expect(html).toContain('https://cdn.example/essay.jpg');
    expect(html).toContain('The essay continues from the public record.');
  });

  it('reads the public editorial asset dimensions', () => {
    const bytes = fs.readFileSync('public/editorial/trump-putin-leash.webp');
    expect(parseImageHeader(bytes)).toEqual({ width: 1536, height: 1024 });
    expect(readPublicEditorialSize('/editorial/trump-putin-leash.webp')).toEqual({
      width: 1536,
      height: 1024,
    });
    expect(readPublicEditorialSize('/editorial/../package.json')).toBeNull();
  });
});
