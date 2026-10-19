import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { isValidElement, Suspense } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock('next/image', () => ({
  default: function HomeImage() {
    return null;
  },
}));

vi.mock('next/link', () => ({
  default: function HomeLink({ href, children }: { href: string; children?: React.ReactNode }) {
    return React.createElement('a', { href }, children);
  },
}));

vi.mock('@/components/home/RotatingWord', () => ({
  default: function RotatingWord() {
    return 'RESIST';
  },
}));

vi.mock('@/components/home/HudOverlay', () => ({
  default: function HudOverlay() {
    return null;
  },
}));

vi.mock('@/components/seo/StructuredData', () => ({
  default: function StructuredData() {
    return null;
  },
}));

vi.mock('@/components/home/HomeFeed.server', () => ({
  default: function HomeFeed() {
    return React.createElement('div', { 'data-testid': 'home-feed' }, 'Field channels');
  },
}));

vi.mock('@/components/home/JournalSection', () => ({
  default: function JournalSection() {
    return React.createElement('section', { 'data-testid': 'home-essays' }, 'Latest essay');
  },
  JournalSectionSkeleton: function JournalSectionSkeleton() {
    return React.createElement('div', { 'data-testid': 'home-essays-skeleton' }, 'Loading essays');
  },
}));

function walk(node: React.ReactNode, found: React.ReactElement[] = []) {
  if (!isValidElement(node)) return found;
  found.push(node);
  const rendered =
    typeof node.type === 'function'
      ? (node.type as (props: unknown) => React.ReactNode)(node.props)
      : null;
  const props = node.props as { children?: React.ReactNode; fallback?: React.ReactNode };
  [rendered, props.children, props.fallback].forEach((target) => {
    if (Array.isArray(target)) target.forEach((child) => walk(child, found));
    else walk(target, found);
  });
  return found;
}

describe('homepage editorial order', () => {
  it('places the masthead and essays before the aggregated field channels', async () => {
    const { default: Home } = await import('@/app/page');
    const elements = walk(Home());
    const ids = elements
      .map((element) => (element.props as { 'data-testid'?: string })['data-testid'])
      .filter(Boolean);

    expect(ids.indexOf('home-masthead')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('home-masthead')).toBeLessThan(ids.indexOf('home-essays'));
    expect(ids.indexOf('home-essays')).toBeLessThan(ids.indexOf('home-essays-skeleton'));
    expect(ids.indexOf('home-essays-skeleton')).toBeLessThan(ids.indexOf('home-channels'));
    expect(ids.indexOf('home-channels')).toBeLessThan(ids.indexOf('home-feed'));
    expect(elements.some((element) => element.type === Suspense)).toBe(true);
  });
});
