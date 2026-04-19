import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { createElement, Children, isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock('server-only', () => ({}));

vi.mock('@/lib/feeds/homepagePayload.service', () => ({
  getHomepagePayload: vi.fn(async () => ({
    feedItems: [{ id: 'voice-1', title: 'Voice item' }],
    latestProtestMusicItem: null,
    briefing: { items: [] },
  })),
}));

vi.mock('@/components/home/ShopPromoSection', () => ({
  default: () => createElement('section', { 'data-testid': 'shop-promo' }, 'Shop promo'),
}));

vi.mock('@/components/subscribe/ResistanceBriefSignup', () => ({
  default: () => createElement('section', { 'data-testid': 'signup' }, 'Signup'),
}));

vi.mock('@/components/home/CurrentlyReadingCard', () => ({
  default: () => createElement('section', { 'data-testid': 'currently-reading' }, 'Currently reading'),
}));

vi.mock('@/components/home/CurrentlyReadingCardSkeleton', () => ({
  default: () =>
    createElement('section', { 'data-testid': 'currently-reading-skeleton' }, 'Currently reading skeleton'),
}));

vi.mock('@/components/home/HomeLiveBriefingSection', () => ({
  default: () => createElement('section', { 'data-testid': 'live-briefing' }, 'Live briefing'),
}));

vi.mock('@/components/voices/VoicesFeedSection', () => ({
  default: () => createElement('section', { 'data-testid': 'telescreen' }, 'Telescreen'),
}));

vi.mock('@/components/home/ProtestMusicSection', () => ({
  default: () => createElement('section', { 'data-testid': 'protest-music' }, 'Protest music'),
}));

describe('HomeFeed layout ordering', () => {
  it('puts Telescreen ahead of Live Briefing below desktop while preserving desktop order classes', async () => {
    const { default: HomeFeed } = await import('@/components/home/HomeFeed.server');

    const element = await HomeFeed();
    if (!isValidElement(element)) {
      throw new Error('Expected HomeFeed to return a valid React element');
    }

    const topLevelChildren = Children.toArray(element.props.children);
    const orderedSections = topLevelChildren[3];

    if (!isValidElement(orderedSections)) {
      throw new Error('Expected ordered sections container to be a valid React element');
    }

    expect(orderedSections.props.className).toBe('flex flex-col');

    const orderedChildren = Children.toArray(orderedSections.props.children);
    const liveWrapper = orderedChildren[0];
    const telescreenWrapper = orderedChildren[1];

    if (!isValidElement(liveWrapper) || !isValidElement(telescreenWrapper)) {
      throw new Error('Expected both homepage section wrappers to be valid React elements');
    }

    const liveElement = isValidElement(liveWrapper.props.children)
      ? liveWrapper.props.children.type(liveWrapper.props.children.props)
      : null;
    const telescreenElement = isValidElement(telescreenWrapper.props.children)
      ? telescreenWrapper.props.children.type(telescreenWrapper.props.children.props)
      : null;

    if (!isValidElement(liveElement) || !isValidElement(telescreenElement)) {
      throw new Error('Expected both homepage sections to resolve to valid React elements');
    }

    expect(liveWrapper.props.className).toBe('order-2 lg:order-1');
    expect(telescreenWrapper.props.className).toBe('order-1 mb-6 sm:mb-8 lg:order-2');
    expect(liveElement.props['data-testid']).toBe('live-briefing');
    expect(telescreenElement.props['data-testid']).toBe('telescreen');
  });
});
