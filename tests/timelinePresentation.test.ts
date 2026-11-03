import * as React from 'react';
import { describe, expect, it } from 'vitest';

const { isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

function walk(node: React.ReactNode, found: React.ReactElement[] = []) {
  if (!isValidElement(node)) return found;
  found.push(node);
  const children = (node.props as { children?: React.ReactNode }).children;
  if (Array.isArray(children)) children.forEach((child) => walk(child, found));
  else walk(children, found);
  return found;
}

describe('timeline presentation', () => {
  it('keeps category anchors, source links, and the documented event text', async () => {
    const { default: TimelineSection } = await import('@/components/sections/TimelineSection');
    const view = TimelineSection();
    const elements = walk(view);
    const first = elements.find((element) => element.type === 'article');
    const props = first?.props as { id?: string; 'data-category'?: string };
    const links = elements.filter((element) => (element.props as { href?: string }).href);
    const firstHref = (links[0]?.props as { href?: string } | undefined)?.href;

    expect(props?.id).toBe('timeline-supporting-underminers');
    expect(props?.['data-category']).toBe('supporting-underminers');
    expect(firstHref).toBe(
      'https://www.brennancenter.org/our-work/research-reports/timeline-trump-administrations-efforts-undermine-elections',
    );
    expect(
      links.every((link) => (link.props as { href?: string }).href?.startsWith('https://www.brennancenter.org/')),
    ).toBe(true);
  });
});
