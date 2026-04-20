import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildArticleSchema,
  buildBreadcrumbListSchema,
  buildOrganizationSchema,
  buildProductSchema,
  buildWebSiteSchema,
} from '@/lib/seo/schema';
import {
  buildSeoExcerptFromBlocks,
  joinSeoDescriptionParts,
  pickSeoDescription,
} from '@/lib/seo/text';

describe('seo text helpers', () => {
  it('cleans editorial signatures and keeps descriptions readable', () => {
    const description = pickSeoDescription(
      ['Field notes from the archive.\n\n- [RESIST]'],
      'Fallback description.',
      180,
    );

    expect(description).toBe('Field notes from the archive.');
  });

  it('joins description parts and truncates on a word boundary', () => {
    const description = joinSeoDescriptionParts(
      [
        'A very long description about resistance reporting and public accountability.',
        'Additional context about democratic backsliding and civic response.',
      ],
      80,
    );

    expect(description.length).toBeLessThanOrEqual(80);
    expect(description.endsWith('...')).toBe(true);
  });

  it('extracts a short excerpt from Notion-like blocks', () => {
    const excerpt = buildSeoExcerptFromBlocks(
      [
        {
          type: 'heading_2',
          heading_2: {
            rich_text: [{ plain_text: 'Primary heading' }],
          },
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                plain_text:
                  'This is the first substantive paragraph for metadata and schema generation.',
              },
            ],
          },
        },
      ],
      { maxBlocks: 2, maxLength: 120 },
    );

    expect(excerpt).toContain('Primary heading');
    expect(excerpt).toContain('first substantive paragraph');
  });
});

describe('seo schema helpers', () => {
  it('builds organization and website schema with canonical absolute URLs', () => {
    const organization = buildOrganizationSchema({
      description: 'Independent editorial project.',
    });
    const website = buildWebSiteSchema({
      description: 'Editorial website.',
    });

    expect(organization.url).toBe('https://www.iamresist.org/');
    expect(organization.logo).toBe('https://www.iamresist.org/resist_sticker.png');
    expect(website.url).toBe('https://www.iamresist.org/');
    expect(website.publisher.name).toBe('I AM [RESIST]');
  });

  it('builds breadcrumb and article schema for canonical detail routes', () => {
    const breadcrumb = buildBreadcrumbListSchema([
      { name: 'Home', url: '/' },
      { name: 'Journal', url: '/journal' },
      { name: 'Entry title', url: '/journal/entry-title' },
    ]);
    const article = buildArticleSchema({
      headline: 'Entry title',
      description: 'A grounded article description.',
      url: '/journal/entry-title',
      image: '/resist_sticker.png',
      datePublished: '2026-04-20',
      dateModified: '2026-04-21T10:00:00.000Z',
    });

    expect(breadcrumb?.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.iamresist.org/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Journal',
        item: 'https://www.iamresist.org/journal',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Entry title',
        item: 'https://www.iamresist.org/journal/entry-title',
      },
    ]);
    expect(article.url).toBe('https://www.iamresist.org/journal/entry-title');
    expect(article.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://www.iamresist.org/journal/entry-title',
    });
    expect(article.image).toBe('https://www.iamresist.org/resist_sticker.png');
    expect(article.publisher.name).toBe('I AM [RESIST]');
  });

  it('builds product schema conservatively and skips incomplete offers', () => {
    const product = buildProductSchema({
      name: 'I AM [RESIST] Vinyl Sticker',
      description: 'Premium vinyl sticker.',
      url: '/shop/sticker',
      image: '/resist_sticker.png',
      offers: {
        price: 6,
        priceCurrency: 'USD',
      },
    });

    expect(product.url).toBe('https://www.iamresist.org/shop/sticker');
    expect(product.brand).toEqual({
      '@type': 'Brand',
      name: 'I AM [RESIST]',
    });
    expect(product).not.toHaveProperty('offers');
  });
});
