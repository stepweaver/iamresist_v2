import * as React from 'react';
import { Children, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

globalThis.React = React;

const books = vi.hoisted(() => ({
  listBooks: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: function Image() {
    return null;
  },
}));

vi.mock('next/link', () => ({
  default: function Link({ href, children, ...props }) {
    return React.createElement('a', { href, ...props }, children);
  },
}));

vi.mock('@/lib/bookclub/service', () => ({
  listBooks: books.listBooks,
}));

function textOf(node, acc = []) {
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => textOf(child, acc));
    return acc;
  }
  if (!isValidElement(node)) return acc;
  textOf(node.props.children, acc);
  return acc;
}

function hrefsOf(node, acc = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => hrefsOf(child, acc));
    return acc;
  }
  if (!isValidElement(node)) return acc;
  if (typeof node.props.href === 'string') acc.push(node.props.href);
  Children.forEach(node.props.children, (child) => hrefsOf(child, acc));
  return acc;
}

describe('The Resistance Shelf', () => {
  it('removes Intel tabs from the book archive and keeps the existing URL', () => {
    const source = readFileSync(path.join(process.cwd(), 'app/(site)/book-club/page.jsx'), 'utf8');
    expect(source).not.toContain('IntelTabs');
    expect(source).toContain('The Resistance Shelf');
    expect(source).toContain("urlPath: '/book-club'");
  });

  it('labels shelf cards View book because notes are not guaranteed', async () => {
    books.listBooks.mockResolvedValue([
      {
        id: 'book-1',
        slug: 'shelf-book',
        title: 'Shelf Book',
        author: 'Ada',
        status: 'Shelf',
        synopsis: 'Historical context.',
      },
    ]);
    const { default: BooksSection } = await import('@/app/(site)/telescreen/BooksSection');
    const section = await BooksSection();
    const text = textOf(section).join(' ');

    expect(text).toContain('View book');
    expect(text).toContain('Shelf Book');
    expect(text).not.toContain('Read notes');
    expect(hrefsOf(section)).toContain('/book-club/shelf-book');
  });

  it('features a non-Reading shelf book on the homepage card', async () => {
    books.listBooks.mockResolvedValue([
      { slug: 'only-shelf', title: 'Only Shelf', author: 'Bea', status: 'Shelf' },
    ]);
    const { default: CurrentlyReadingCard } = await import('@/components/home/CurrentlyReadingCard');
    const card = await CurrentlyReadingCard();
    const text = textOf(card).join(' ');

    expect(text).toContain('The Resistance Shelf');
    expect(text).toContain('Only Shelf');
    expect(text).toContain('View book');
    expect(text).not.toContain('Read notes');
    expect(text).not.toContain('Browse book notes');
    expect(hrefsOf(card)).toEqual(expect.arrayContaining(['/book-club/only-shelf', '/book-club']));
  });
});
