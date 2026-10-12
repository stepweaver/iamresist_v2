import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { Children, isValidElement, Suspense } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const fetchers = vi.hoisted(() => ({
  getHomepageIntelFeed: vi.fn(async () => [{ id: 'voice-1', title: 'Voice item' }]),
  getHomeLiveBriefing: vi.fn(async () => ({ items: [{ id: 'brief-1' }] })),
  getRecentProtestMusicItemsWithFallback: vi.fn(async () => []),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/feeds/homepageIntel.service', () => ({
  getHomepageIntelFeed: fetchers.getHomepageIntelFeed,
}));

vi.mock('@/lib/feeds/homepageBriefing.service', () => ({
  getHomeLiveBriefing: fetchers.getHomeLiveBriefing,
}));

vi.mock('@/lib/feeds/protestMusicFeed.service', () => ({
  getRecentProtestMusicItemsWithFallback: fetchers.getRecentProtestMusicItemsWithFallback,
}));

vi.mock('@/components/home/ShopPromoSection', () => ({
  default: () => React.createElement('section', { 'data-testid': 'shop-promo' }, 'Shop promo'),
}));

vi.mock('@/components/home/CurrentlyReadingCard', () => ({
  default: () => React.createElement('section', { 'data-testid': 'currently-reading' }, 'Currently reading'),
}));

vi.mock('@/components/home/CurrentlyReadingCardSkeleton', () => ({
  default: () =>
    React.createElement('section', { 'data-testid': 'currently-reading-skeleton' }, 'Currently reading skeleton'),
}));

vi.mock('@/components/home/HomeLiveBriefingSection', () => ({
  default: () => React.createElement('section', { 'data-testid': 'live-briefing' }, 'Live briefing'),
}));

vi.mock('@/components/voices/VoicesFeedSection', () => ({
  default: () => React.createElement('section', { 'data-testid': 'telescreen' }, 'Telescreen'),
}));

vi.mock('@/components/home/ProtestMusicSection', () => ({
  default: () => React.createElement('section', { 'data-testid': 'protest-music' }, 'Protest music'),
}));

function asElement(node: React.ReactNode) {
  if (!isValidElement(node)) {
    throw new Error('Expected a React element');
  }
  return node as React.ReactElement<{
    className?: string;
    children?: React.ReactNode;
    fallback?: React.ReactElement;
    'data-testid'?: string;
  }>;
}

function invoke(node: React.ReactElement): Promise<React.ReactNode> {
  const type = node.type;
  if (typeof type !== 'function') {
    throw new Error('Expected a component');
  }
  return Promise.resolve(
    (type as (props: unknown) => React.ReactNode | Promise<React.ReactNode>)(node.props),
  );
}

function walk(node: React.ReactNode, found: React.ReactElement[] = []) {
  if (!isValidElement(node)) return found;
  found.push(node);
  const children = (node.props as { children?: React.ReactNode }).children;
  Children.forEach(children, (child) => walk(child, found));
  return found;
}

describe('HomeFeed layout ordering', () => {
  it('puts Telescreen ahead of Live Briefing below desktop while preserving desktop order classes', async () => {
    const { default: HomeFeed, HomeTelescreenSlot, TELESCREEN_SECTION_CLASS } = await import(
      '@/components/home/HomeFeed.server'
    );

    const element = asElement(HomeFeed());
    const topLevelChildren = Children.toArray(element.props.children);
    const orderedSections = asElement(topLevelChildren[2]);
    const musicBoundary = asElement(topLevelChildren[3]);

    expect(orderedSections.props.className).toBe('flex flex-col');
    expect(musicBoundary.type).toBe(Suspense);

    const orderedChildren = Children.toArray(orderedSections.props.children);
    const liveWrapper = asElement(orderedChildren[0]);
    const telescreenBoundary = asElement(orderedChildren[1]);

    expect(liveWrapper.props.className).toBe('order-2 lg:order-1');
    expect(telescreenBoundary.type).toBe(Suspense);
    const fallback = asElement(telescreenBoundary.props.fallback);
    expect(fallback.props.className).toBe(TELESCREEN_SECTION_CLASS);

    const telescreen = asElement(await HomeTelescreenSlot());
    expect(telescreen.props.className).toBe('order-1 mb-6 sm:mb-8 lg:order-2');
    const renderedSection = asElement(await invoke(asElement(telescreen.props.children)));
    expect(renderedSection.props['data-testid']).toBe('telescreen');
  });
});

describe('HomeFeed independent sections', () => {
  it('does not let a slow Telescreen feed block an already ready Live Briefing', async () => {
    fetchers.getHomepageIntelFeed.mockClear();
    fetchers.getHomeLiveBriefing.mockClear();
    let releaseIntel: (value: { id: string; title: string }[]) => void = () => {};
    fetchers.getHomepageIntelFeed.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseIntel = resolve;
        }),
    );
    fetchers.getHomeLiveBriefing.mockResolvedValue({ items: [{ id: 'brief-1' }] });

    const { default: HomeFeed, HomeLiveBriefingSlot, HomeTelescreenSlot } = await import(
      '@/components/home/HomeFeed.server'
    );
    const tree = HomeFeed();
    const elements = walk(tree);
    const briefingEl = elements.find((el) => el.type === HomeLiveBriefingSlot);
    const telescreenEl = elements.find((el) => el.type === HomeTelescreenSlot);
    if (!briefingEl || !telescreenEl) throw new Error('Expected both section slots in the tree');

    const telescreenPromise = invoke(telescreenEl);
    const winner = await Promise.race([
      invoke(briefingEl).then(() => 'briefing'),
      telescreenPromise.then(() => 'telescreen'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 300)),
    ]);

    expect(winner).toBe('briefing');
    expect(fetchers.getHomeLiveBriefing).toHaveBeenCalledTimes(1);
    releaseIntel([]);
    await telescreenPromise;
  });

  it('does not let a slow Live Briefing block already ready Telescreen content', async () => {
    fetchers.getHomepageIntelFeed.mockClear();
    fetchers.getHomeLiveBriefing.mockClear();
    let releaseBriefing: (value: { items: { id: string }[] }) => void = () => {};
    fetchers.getHomeLiveBriefing.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseBriefing = resolve;
        }),
    );
    fetchers.getHomepageIntelFeed.mockResolvedValue([{ id: 'voice-1', title: 'Voice item' }]);

    const { HomeLiveBriefingSlot, HomeTelescreenSlot } = await import('@/components/home/HomeFeed.server');
    const briefingPromise = HomeLiveBriefingSlot();
    const winner = await Promise.race([
      HomeTelescreenSlot().then(() => 'telescreen'),
      briefingPromise.then(() => 'briefing'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 300)),
    ]);

    expect(winner).toBe('telescreen');
    expect(fetchers.getHomepageIntelFeed).toHaveBeenCalledTimes(1);
    releaseBriefing({ items: [] });
    await briefingPromise;
  });

  it('fetches each homepage section once when the slots render', async () => {
    fetchers.getHomepageIntelFeed.mockClear();
    fetchers.getHomeLiveBriefing.mockClear();
    fetchers.getRecentProtestMusicItemsWithFallback.mockClear();
    fetchers.getHomepageIntelFeed.mockResolvedValue([{ id: 'voice-1', title: 'Voice item' }]);
    fetchers.getHomeLiveBriefing.mockResolvedValue({ items: [] });
    fetchers.getRecentProtestMusicItemsWithFallback.mockResolvedValue([]);

    const { HomeLiveBriefingSlot, HomeTelescreenSlot, HomeProtestMusicSlot } = await import(
      '@/components/home/HomeFeed.server'
    );

    await Promise.all([HomeLiveBriefingSlot(), HomeTelescreenSlot(), HomeProtestMusicSlot()]);

    expect(fetchers.getHomepageIntelFeed).toHaveBeenCalledTimes(1);
    expect(fetchers.getHomeLiveBriefing).toHaveBeenCalledTimes(1);
    expect(fetchers.getRecentProtestMusicItemsWithFallback).toHaveBeenCalledTimes(1);
  });
});
