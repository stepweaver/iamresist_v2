import * as React from 'react';
import { Children, isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock('next/link', () => ({
  default: function Link({ href, children }: { href: string; children?: React.ReactNode }) {
    return React.createElement('a', { href }, children);
  },
}));

vi.mock('lucide-react', () => ({
  ExternalLink: function ExternalLink() {
    return null;
  },
}));

vi.mock('@/components/newswire/NewswireHeadlineCard', () => ({
  default: function Story({ story }: { story: { title?: string } }) {
    return React.createElement('article', { 'data-testid': 'briefing-story' }, story.title);
  },
}));

vi.mock('@/components/newswire/RemoteCoverImage', () => ({
  default: function RemoteCoverImage() {
    return null;
  },
}));

vi.mock('@/components/ShareButton', () => ({
  default: function ShareButton() {
    return null;
  },
}));

function materialize(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) return node.map((child) => materialize(child));
  if (!isValidElement(node) || typeof node.type !== 'function') return node;
  return materialize((node.type as (props: unknown) => React.ReactNode)(node.props));
}

function countStories(node: React.ReactNode): number {
  const current = materialize(node);
  if (Array.isArray(current)) return current.reduce<number>((sum, child) => sum + countStories(child), 0);
  if (!isValidElement(current)) return 0;
  const own = (current.props as { 'data-testid'?: string })['data-testid'] === 'briefing-story' ? 1 : 0;
  const children = (current.props as { children?: React.ReactNode }).children;
  return own + Children.toArray(children).reduce<number>((sum, child) => sum + countStories(child), 0);
}

function textOf(node: React.ReactNode, acc: string[] = []) {
  const current = materialize(node);
  if (typeof current === 'string' || typeof current === 'number') {
    acc.push(String(current));
    return acc;
  }
  if (Array.isArray(current)) {
    current.forEach((child) => textOf(child, acc));
    return acc;
  }
  if (!isValidElement(current)) return acc;
  textOf((current.props as { children?: React.ReactNode }).children, acc);
  return acc;
}

describe('live briefing presentation limit', () => {
  it('renders one lead and two supporting stories from a longer ranked briefing', async () => {
    const { default: HomeLiveBriefingSection } = await import('@/components/home/HomeLiveBriefingSection');
    const items = [1, 2, 3, 4, 5].map((id) => ({
      kind: 'newswire',
      briefLane: 'newswire',
      story: { id: `story-${id}`, title: `Story ${id}` },
    }));

    const section = HomeLiveBriefingSection({ briefing: { items } });
    const text = textOf(section).join(' ');

    expect(countStories(section)).toBe(3);
    expect(text.indexOf('Story 1')).toBeLessThan(text.indexOf('Story 2'));
    expect(text.indexOf('Story 2')).toBeLessThan(text.indexOf('Story 3'));
    expect(text).not.toContain('Story 4');
    expect(text).toContain('Newswire');
    expect(text).toContain('Newswire →');
  });
});
