import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { selectHomepageEssays } from '@/components/journal/journalFormat';
import {
  externalDestinationUrl,
  formatCuratedResourcePage,
  publishedFilterForProperties,
  selectCuratedResources,
  selectHomepageCuratedArticles,
} from '@/lib/curated/resources';

const { Children, isValidElement } = React;
globalThis.React = React;

vi.mock('next/link', () => ({
  default: function ResourceLink({ href, children }) {
    return React.createElement('a', { href }, children);
  },
}));

const SIGNED =
  'https://prod-files-secure.s3.us-west-2.amazonaws.com/note/poster.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc';

function page(overrides = {}) {
  return {
    id: '40abc620-4ba0-81bc-8c15-d2e03b3c9283',
    created_time: '2026-10-01T00:00:00.000Z',
    properties: {
      Title: { type: 'title', title: [{ plain_text: "David Pakman's 2026 Midterm Election Guide" }] },
      URL: { type: 'url', url: 'https://www.davidpakman.com/signup?ref=iamresist' },
      Source: { type: 'select', select: { name: 'David Pakman' } },
      Status: { type: 'status', status: { name: 'Published' } },
      'Editorial Note': { type: 'rich_text', rich_text: [{ plain_text: 'A voting guide from the creator.' }] },
      'Resource Type': { type: 'select', select: { name: 'Guide' } },
      Slug: {
        type: 'rich_text',
        rich_text: [{ plain_text: 'david-pakman-2026-midterm-election-guide' }],
      },
      Featured: { type: 'checkbox', checkbox: true },
      'Published At': { type: 'date', date: { start: '2026-10-20' } },
      'Hero Image': {
        type: 'files',
        files: [{ name: 'poster.png', type: 'file', file: { url: SIGNED } }],
      },
      ...overrides,
    },
  };
}

function expand(node) {
  if (!isValidElement(node) || typeof node.type !== 'function') return node;
  return expand(node.type(node.props));
}

function textOf(node, acc = []) {
  const current = expand(node);
  if (typeof current === 'string' || typeof current === 'number') acc.push(String(current));
  else if (Array.isArray(current)) current.forEach((child) => textOf(child, acc));
  else if (isValidElement(current)) {
    Children.forEach(current.props?.children, (child) => textOf(child, acc));
  }
  return acc.join(' ');
}

function hrefsOf(node, acc = []) {
  const current = expand(node);
  if (Array.isArray(current)) {
    current.forEach((child) => hrefsOf(child, acc));
    return acc;
  }
  if (!isValidElement(current)) return acc;
  const href = current.props?.href;
  if (typeof href === 'string') acc.push(href);
  Children.forEach(current.props?.children, (child) => hrefsOf(child, acc));
  return acc;
}

describe('curated resource publication', () => {
  it('keeps the creator destination and does not serve an attached file', () => {
    const resource = formatCuratedResourcePage(page());
    expect(resource.url).toBe('https://www.davidpakman.com/signup?ref=iamresist');
    expect(resource.url).not.toMatch(/notion|poster\.png|guide\.pdf/i);
    expect(resource.source).toBe('David Pakman');
    expect(resource.resourceType).toBe('Guide');
    expect(resource.editorialNote).toBe('A voting guide from the creator.');
    expect(resource.featured).toBe(true);
    expect(resource.published).toBe(true);
    expect(resource.publishedAt).toBe('2026-10-20');
    expect(resource.path).toBe('/curated/articles/david-pakman-2026-midterm-election-guide');
    expect(resource.contentType).toBe('curated-article');
    expect(resource.image?.src).toBe('/curated/articles/david-pakman-2026-midterm-election-guide/image');
    expect(resource.image?.src).not.toMatch(/X-Amz|prod-files-secure/);
    expect(resource.heroImage).toBeNull();
  });

  it('ignores a guide file when that is the only attachment', () => {
    const resource = formatCuratedResourcePage(
      page({
        'Hero Image': {
          type: 'files',
          files: [
            {
              name: 'midterm-guide.pdf',
              type: 'file',
              file: { url: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/note/guide.pdf?X-Amz-Signature=abc' },
            },
          ],
        },
      }),
    );
    expect(resource.image).toBeNull();
    expect(resource.url).toBe('https://www.davidpakman.com/signup?ref=iamresist');
  });

  it('publishes a guide when the hero image and publication date are empty', () => {
    const resource = formatCuratedResourcePage(
      page({
        'Hero Image': { type: 'files', files: [] },
        'Published At': { type: 'date', date: null },
      }),
    );
    expect(resource.publishedAt).toBeNull();
    expect(resource.image).toBeNull();
    expect(selectCuratedResources([resource])).toHaveLength(1);
    expect(selectHomepageCuratedArticles([resource]).map((item) => item.slug)).toEqual([
      'david-pakman-2026-midterm-election-guide',
    ]);
  });

  it('keeps a featured article ahead of a newer unfeatured article', () => {
    const featured = formatCuratedResourcePage(
      page({
        'Published At': { type: 'date', date: null },
      }),
    );
    const newer = formatCuratedResourcePage({
      ...page({
        Featured: { type: 'checkbox', checkbox: false },
        URL: { type: 'url', url: 'https://example.com/later' },
        Slug: { type: 'rich_text', rich_text: [{ plain_text: 'later-briefing' }] },
        'Published At': { type: 'date', date: { start: '2026-11-01' } },
      }),
      id: 'later-resource',
      created_time: '2026-11-01T00:00:00.000Z',
    });
    const archived = formatCuratedResourcePage(
      page({
        Status: { type: 'status', status: { name: 'Archived' } },
        URL: { type: 'url', url: 'https://example.com/archived' },
        Slug: { type: 'rich_text', rich_text: [{ plain_text: 'archived-guide' }] },
      }),
    );
    const draft = formatCuratedResourcePage(
      page({ Status: { type: 'status', status: { name: 'Draft' } } }),
    );

    expect(selectHomepageCuratedArticles([newer, archived, draft, featured]).map((item) => item.slug)).toEqual([
      'david-pakman-2026-midterm-election-guide',
    ]);
    expect(selectCuratedResources([newer, archived, draft, featured]).map((item) => item.slug)).toEqual([
      'david-pakman-2026-midterm-election-guide',
      'later-briefing',
    ]);
  });

  it('drops unpublished rows and records without an external destination', () => {
    const draft = formatCuratedResourcePage(
      page({ Status: { type: 'status', status: { name: 'Draft' } } }),
    );
    const unlinked = formatCuratedResourcePage(page({ URL: { type: 'url', url: null } }));
    expect(selectCuratedResources([draft, unlinked, formatCuratedResourcePage(page())])).toHaveLength(1);
    expect(externalDestinationUrl('notion://guide')).toBe('');
  });

  it('builds a status, select, or checkbox publication filter from the database schema', () => {
    expect(
      publishedFilterForProperties({
        Status: { type: 'status', status: { options: [{ name: 'Published' }] } },
      }),
    ).toEqual({ property: 'Status', status: { equals: 'Published' } });
    expect(
      publishedFilterForProperties({
        Status: { type: 'select', select: { options: [{ name: 'Published' }] } },
      }),
    ).toEqual({ property: 'Status', select: { equals: 'Published' } });
    expect(
      publishedFilterForProperties({
        Published: { type: 'checkbox', checkbox: {} },
      }),
    ).toEqual({ property: 'Published', checkbox: { equals: true } });
  });

  it('prioritizes featured resources without mixing them into journal essays', () => {
    const olderFeatured = formatCuratedResourcePage(page());
    const newer = formatCuratedResourcePage({
      ...page({
        Featured: { type: 'checkbox', checkbox: false },
        URL: { type: 'url', url: 'https://example.com/later' },
        'Published At': { type: 'date', date: { start: '2026-11-01' } },
      }),
      id: 'later-resource',
    });
    newer.title = 'Later briefing';
    const selected = selectCuratedResources([newer, olderFeatured, olderFeatured]);
    expect(selected.map((item) => item.url)).toEqual([
      'https://www.davidpakman.com/signup?ref=iamresist',
      'https://example.com/later',
    ]);

    const essays = selectHomepageEssays([
      { id: 'essay', slug: 'newest-essay', title: 'Newest Essay', date: '2026-09-01' },
    ]);
    expect(essays.latest.slug).toBe('newest-essay');
    expect(essays.explicitlyFeatured).toBe(false);
    expect(essays.recent).toEqual([]);
  });

  it('returns no curated resources when the directory is empty', async () => {
    const { default: CuratedResourceGroup } = await import('@/components/resources/CuratedResourceGroup');
    const { default: ResourcesSection } = await import('@/app/(site)/telescreen/ResourcesSection');
    expect(selectCuratedResources([])).toEqual([]);
    expect(selectCuratedResources(null)).toEqual([]);
    expect(CuratedResourceGroup({ resources: [] })).toBeNull();

    const section = ResourcesSection({ curated: [] });
    const text = textOf(section);
    expect(text).toContain('AORTA');
    expect(text).toContain('Brennan Center for Justice');
    expect(text).not.toContain('Curated Resources');
  });

  it('lists a published curated resource beside the static civic directory', async () => {
    const { default: ResourcesSection } = await import('@/app/(site)/telescreen/ResourcesSection');
    const section = ResourcesSection({ curated: [formatCuratedResourcePage(page())] });
    const text = textOf(section);
    const hrefs = hrefsOf(section);
    expect(text).toContain('Curated articles');
    expect(text).toContain("David Pakman's 2026 Midterm Election Guide");
    expect(text).toContain('David Pakman');
    expect(text).toContain('Featured');
    expect(text).toContain('AORTA');
    expect(hrefs).toContain('/curated/articles/david-pakman-2026-midterm-election-guide');
    expect(hrefs).toContain('/curated/articles');
    expect(hrefs).not.toContain('https://www.davidpakman.com/signup?ref=iamresist');
    expect(hrefs).toContain('https://www.aorta.co/');
    expect(hrefs.some((href) => href.includes('guide.pdf') || href.startsWith('/journal/'))).toBe(false);
  });
});
