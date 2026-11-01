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
    return React.createElement('div', { 'data-testid': 'hero-hud-frame' });
  },
  TargetReticle: function TargetReticle() {
    return React.createElement('div', { 'data-testid': 'hero-reticle' });
  },
}));

vi.mock('@/components/home/HeroEssayLink', () => ({
  default: function HeroEssayLink() {
    return React.createElement('a', { href: '/journal/latest-essay', 'data-testid': 'hero-latest-essay' }, 'Read Latest Essay');
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

function textOf(node: React.ReactNode, acc: string[] = []) {
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => textOf(child, acc));
    return acc;
  }
  if (!isValidElement(node)) return acc;
  const props = node.props as { children?: React.ReactNode };
  if (typeof node.type === 'function') textOf((node.type as (props: unknown) => React.ReactNode)(node.props), acc);
  else textOf(props.children, acc);
  return acc;
}

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
    expect(ids.indexOf('home-masthead')).toBeLessThan(ids.indexOf('hero-hud-frame'));
    expect(ids.indexOf('hero-hud-frame')).toBeLessThan(ids.indexOf('hero-reticle'));
    expect(ids.indexOf('hero-reticle')).toBeLessThan(ids.indexOf('hero-latest-essay'));
    expect(ids.indexOf('hero-latest-essay')).toBeLessThan(ids.indexOf('home-essays'));
    expect(ids.indexOf('home-essays')).toBeLessThan(ids.indexOf('home-essays-skeleton'));
    expect(ids.indexOf('home-essays-skeleton')).toBeLessThan(ids.indexOf('home-channels'));
    expect(ids.indexOf('home-channels')).toBeLessThan(ids.indexOf('home-feed'));
    expect(elements.some((element) => element.type === Suspense)).toBe(true);
  });

  it('keeps the mission readable on narrow screens and links to the full mission', async () => {
    const { default: Home } = await import('@/app/page');
    const page = Home();
    const elements = walk(page);
    const text = textOf(page).join(' ');
    const mastheadAt = elements.findIndex(
      (element) => (element.props as { 'data-testid'?: string })['data-testid'] === 'home-masthead',
    );
    const channelsAt = elements.findIndex(
      (element) => (element.props as { 'data-testid'?: string })['data-testid'] === 'home-channels',
    );
    const hero = elements.slice(mastheadAt, channelsAt);
    const heroClassNames = hero
      .map((element) => String((element.props as { className?: string }).className || ''))
      .join(' ');

    expect(text).toContain('RESISTANCE SIGNAL // PUBLIC RELEASE');
    expect(text).toContain('I AM');
    expect(text).toContain('RESIST');
    expect(text).toContain('A call to awareness. A chronicle of resistance.');
    expect(text).toContain('Silence in the face of fascism is surrender.');
    expect(text).toContain('Read Full Mission');
    expect(heroClassNames).not.toContain('whitespace-nowrap');
    expect(heroClassNames).toContain('order-1');
    expect(heroClassNames).toContain('order-2');
    expect(heroClassNames).toContain('order-3');
    expect(heroClassNames).toContain('lg:col-start-1');
    expect(heroClassNames).toContain('lg:col-start-2');
    expect(heroClassNames).toContain('z-10');
    expect(heroClassNames).toContain('aspect-[1500/839]');
    expect(heroClassNames).toContain('object-contain');
    expect(heroClassNames).toContain('lg:aspect-square');
    expect(heroClassNames).toContain('lg:inset-[18%]');
    expect(heroClassNames).toContain('hidden lg:contents');
    expect(hero.filter((element) => element.type === 'h1')).toHaveLength(1);
    expect(
      hero.filter(
        (element) =>
          element.type === 'a' && (element.props as { href?: string }).href === '/about',
      ),
    ).toHaveLength(1);
    expect(
      hero.filter(
        (element) =>
          (element.props as { 'data-testid'?: string })['data-testid'] === 'hero-latest-essay',
      ),
    ).toHaveLength(1);
  });
});
