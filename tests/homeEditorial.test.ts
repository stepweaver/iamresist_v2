import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { Children, isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const journal = vi.hoisted(() => ({
  getHomepageJournalEntries: vi.fn(),
  featuredEssayExcerpt: vi.fn(async (entry: { summary?: string }) => String(entry?.summary || '').trim()),
}));

vi.mock('next/link', () => ({
  default: function HomeLink({ href, children, ...props }: { href: string; children?: React.ReactNode }) {
    return React.createElement('a', { href, ...props }, children);
  },
}));

vi.mock('@/app/fonts', () => ({
  barlowCondensed: { variable: 'font-display-test' },
  sourceSans3: { variable: 'font-body-test' },
}));

vi.mock('@/lib/journal', () => ({
  getHomepageJournalEntries: journal.getHomepageJournalEntries,
  featuredEssayExcerpt: journal.featuredEssayExcerpt,
}));

function expand(node: React.ReactNode): React.ReactNode {
  if (!isValidElement(node) || typeof node.type !== 'function') return node;
  const render = node.type as (props: unknown) => React.ReactNode;
  return expand(render(node.props));
}

function textOf(node: React.ReactNode, acc: string[] = []) {
  const current = expand(node);
  if (typeof current === 'string' || typeof current === 'number') acc.push(String(current));
  else if (Array.isArray(current)) current.forEach((child) => textOf(child, acc));
  else if (isValidElement(current)) {
    Children.forEach((current.props as { children?: React.ReactNode }).children, (child) => textOf(child, acc));
  }
  return acc;
}

function hrefsOf(node: React.ReactNode, acc: string[] = []) {
  const current = expand(node);
  if (Array.isArray(current)) current.forEach((child) => hrefsOf(child, acc));
  else if (isValidElement(current)) {
    const href = (current.props as { href?: string }).href;
    if (typeof href === 'string') acc.push(href);
    Children.forEach((current.props as { children?: React.ReactNode }).children, (child) => hrefsOf(child, acc));
  }
  return acc;
}

describe('homepage editorial section', () => {
  it('features the latest essay, then two other essays, without duplicates', async () => {
    journal.getHomepageJournalEntries.mockResolvedValue([
      {
        id: 'older',
        slug: 'older-essay',
        title: 'Older Essay',
        date: '2026-01-02',
        summary: 'An earlier argument.',
        tags: ['Courts'],
      },
      {
        id: 'latest',
        slug: 'latest-essay',
        title: 'Latest Essay Title',
        date: '2026-10-18',
        createdTime: '2026-10-18T15:00:00.000Z',
        summary: 'The central argument in two sentences.',
        tags: ['Democracy & Law'],
      },
      {
        id: 'middle',
        slug: 'middle-essay',
        title: 'Middle Essay',
        date: '2026-05-04',
        createdTime: '2026-05-04T12:00:00.000Z',
      },
      {
        id: 'latest',
        slug: 'latest-copy',
        title: 'Latest Copy',
        date: '2026-10-18',
        createdTime: '2026-10-18T01:00:00.000Z',
      },
    ]);

    const { default: JournalSection } = await import('@/components/home/JournalSection');
    const section = await JournalSection();
    const text = textOf(section).join(' ');
    const hrefs = hrefsOf(section);

    expect(section?.props['data-testid']).toBe('home-essays');
    expect(text).toContain('Latest Essay');
    expect(text.indexOf('Latest Essay Title')).toBeLessThan(text.indexOf('Middle Essay'));
    expect(text.indexOf('Middle Essay')).toBeLessThan(text.indexOf('Older Essay'));
    expect(text).toContain('The central argument in two sentences.');
    expect(text).toContain('An earlier argument.');
    expect(text).not.toContain('Latest Copy');
    expect(text).toContain('Read Essay');
    expect(hrefs).toContain('/journal/latest-essay');
    expect(hrefs).toContain('/journal/middle-essay');
    expect(hrefs).toContain('/journal/older-essay');
    expect(hrefs).not.toContain('/journal/latest-copy');
    expect(hrefs.filter((href) => href === '/journal/latest-essay').length).toBeGreaterThan(0);
  });

  it('omits the section when the journal is empty', async () => {
    journal.getHomepageJournalEntries.mockResolvedValue([]);
    const { default: JournalSection } = await import('@/components/home/JournalSection');
    expect(await JournalSection()).toBeNull();
  });

  it('omits the section when the journal request fails', async () => {
    journal.getHomepageJournalEntries.mockRejectedValue(new Error('notion unavailable'));
    const { default: JournalSection } = await import('@/components/home/JournalSection');
    expect(await JournalSection()).toBeNull();
  });

  it('uses one cached excerpt for the latest essay when Summary is empty', async () => {
    journal.featuredEssayExcerpt.mockResolvedValueOnce('A cached lead from the essay.');
    journal.getHomepageJournalEntries.mockResolvedValue([
      { id: 'only', slug: 'only-essay', title: 'Only Essay', date: '2026-03-03', summary: '' },
    ]);
    const { default: JournalSection } = await import('@/components/home/JournalSection');
    const section = await JournalSection();
    expect(textOf(section).join(' ')).toContain('A cached lead from the essay.');
    expect(journal.featuredEssayExcerpt).toHaveBeenCalledTimes(1);
  });
});
