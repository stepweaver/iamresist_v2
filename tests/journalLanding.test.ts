import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { Children, isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock('next/link', () => ({
  default: function JournalLink({ href, children }: { href: string; children?: React.ReactNode }) {
    return React.createElement('a', { href }, children);
  },
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
  if (!isValidElement(current)) return acc;
  const href = (current.props as { href?: string }).href;
  if (typeof href === 'string') acc.push(href);
  Children.forEach((current.props as { children?: React.ReactNode }).children, (child) => hrefsOf(child, acc));
  return acc;
}

function classNamesOf(node: React.ReactNode, acc: string[] = []) {
  const current = expand(node);
  if (Array.isArray(current)) current.forEach((child) => classNamesOf(child, acc));
  else if (isValidElement(current)) {
    const className = (current.props as { className?: string }).className;
    if (typeof className === 'string') acc.push(className);
    Children.forEach((current.props as { children?: React.ReactNode }).children, (child) => classNamesOf(child, acc));
  }
  return acc;
}

function srcsOf(node: React.ReactNode, acc: string[] = []) {
  const current = expand(node);
  if (Array.isArray(current)) current.forEach((child) => srcsOf(child, acc));
  else if (isValidElement(current)) {
    const src = (current.props as { src?: string }).src;
    if (current.type === 'img' && typeof src === 'string') acc.push(src);
    Children.forEach((current.props as { children?: React.ReactNode }).children, (child) => srcsOf(child, acc));
  }
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
    expect(text).toContain('Latest essay');
    expect(text).toContain('Show Me the Proof');
    expect(text).toContain('Read essay');
    expect(text).toContain('Law');
    expect(hrefsOf(featured)).toContain('/journal/show-me-the-proof');
    expect(text).not.toContain('undefined');
    expect(srcsOf(featured)).toEqual([]);
    expect(classNamesOf(featured).join(' ')).not.toContain('journal-editorial');
  });

  it('shows editorial artwork on the featured essay and recent cards when a listing image exists', async () => {
    const { default: FeaturedRecord } = await import('@/components/journal/FeaturedRecord');
    const { default: JournalRecent } = await import('@/components/journal/JournalRecent');
    const image = { src: '/journal/show-me-the-proof/image', alt: 'Editorial image for Show Me the Proof' };
    const featured = FeaturedRecord({
      record: {
        id: 'essay-1',
        href: '/journal/show-me-the-proof',
        title: 'Show Me the Proof',
        image,
      },
    });
    const recent = JournalRecent({
      records: [
        {
          id: 'mid',
          href: '/journal/middle-essay',
          title: 'Middle Essay',
          image: { src: 'https://cdn.example/middle.jpg', alt: 'Middle' },
        },
      ],
    });
    expect(srcsOf(featured)).toEqual(['/journal/show-me-the-proof/image']);
    expect(classNamesOf(featured).join(' ')).toContain('journal-editorial--contain');
    expect(srcsOf(recent)).toEqual(['https://cdn.example/middle.jpg']);
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
    expect(text).toContain('Further reading');
    expect(text).toContain('Middle Essay');
    expect(text).toContain('A second argument.');
    expect(text).toContain('Courts');
    expect(hrefsOf(recent)).toEqual(['/journal/middle-essay']);
    expect(JournalRecent({ records: [] })).toBeNull();
  });
});
