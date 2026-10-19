import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { Children, isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock('next/link', () => ({
  default: function JournalLink({ href, children }: { href: string; children?: React.ReactNode }) {
    return React.createElement('a', { href }, children);
  },
}));

function textOf(node: React.ReactNode, acc: string[] = []) {
  if (typeof node === 'string' || typeof node === 'number') acc.push(String(node));
  else if (Array.isArray(node)) node.forEach((child) => textOf(child, acc));
  else if (isValidElement(node)) {
    Children.forEach((node.props as { children?: React.ReactNode }).children, (child) => textOf(child, acc));
  }
  return acc;
}

function hrefsOf(node: React.ReactNode, acc: string[] = []) {
  if (!isValidElement(node)) return acc;
  const href = (node.props as { href?: string }).href;
  if (typeof href === 'string') acc.push(href);
  Children.forEach((node.props as { children?: React.ReactNode }).children, (child) => hrefsOf(child, acc));
  return acc;
}

describe('journal landing presentation', () => {
  it('introduces the publication as Essays & Analysis', async () => {
    const { default: ArchiveHero } = await import('@/components/journal/ArchiveHero');
    const text = textOf(ArchiveHero()).join(' ');
    expect(text).toContain('Essays & Analysis');
    expect(text).toContain('Original writing on power, propaganda, democratic accountability');
    expect(text).toContain('I AM [RESIST]');
    expect(text).not.toContain('The Resistance Archive');
  });

  it('links the featured title to the essay and skips a missing excerpt', async () => {
    const { default: FeaturedRecord } = await import('@/components/journal/FeaturedRecord');
    const featured = FeaturedRecord({
      record: {
        id: 'essay-1',
        href: '/journal/show-me-the-proof',
        title: 'Show Me the Proof',
        dateLabel: '10-OCT-2026',
        dateTime: '2026-10-10',
        tags: ['Law'],
        excerpt: '',
      },
    });
    const text = textOf(featured).join(' ');
    expect(text).toContain('Featured essay');
    expect(text).toContain('Show Me the Proof');
    expect(text).toContain('Read essay');
    expect(hrefsOf(featured)).toContain('/journal/show-me-the-proof');
    expect(text).not.toContain('undefined');
  });

  it('renders recent writing without repeating the featured href', async () => {
    const { default: JournalRecent } = await import('@/components/journal/JournalRecent');
    const recent = JournalRecent({
      records: [
        {
          id: 'mid',
          href: '/journal/middle-essay',
          title: 'Middle Essay',
          dateLabel: '01-JUN-2026',
          tags: ['Courts'],
          excerpt: 'A second argument.',
        },
      ],
    });
    const text = textOf(recent).join(' ');
    expect(text).toContain('Recent writing');
    expect(text).toContain('Middle Essay');
    expect(text).toContain('A second argument.');
    expect(hrefsOf(recent)).toEqual(['/journal/middle-essay', '/journal/middle-essay']);
    expect(JournalRecent({ records: [] })).toBeNull();
  });
});
