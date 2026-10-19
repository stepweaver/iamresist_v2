import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const journal = vi.hoisted(() => ({
  getHomepageJournalEntries: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: function HomeLink({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: React.ReactNode;
  }) {
    return React.createElement('a', { href, ...props }, children);
  },
}));

vi.mock('@/lib/journal', () => ({
  getHomepageJournalEntries: journal.getHomepageJournalEntries,
}));

function classNames(node: React.ReactNode, acc: string[] = []) {
  if (!isValidElement(node)) return acc;
  const props = node.props as { className?: string; children?: React.ReactNode };
  if (typeof props.className === 'string') acc.push(props.className);
  const children = props.children;
  if (Array.isArray(children)) children.forEach((child) => classNames(child, acc));
  else classNames(children, acc);
  return acc;
}

describe('tactical hero overlay', () => {
  it('keeps frame decorations behind the content and the reticle off the pointer', async () => {
    const { default: HudOverlay, TargetReticle } = await import('@/components/home/HudOverlay');
    const frame = HudOverlay({ title: 'RESISTANCE SIGNAL', code: 'IAMR-BRIEF-01' });
    const reticle = TargetReticle();
    const frameClasses = classNames(frame).join(' ');
    const reticleClasses = classNames(reticle).join(' ');

    expect(frame.props.className).toContain('pointer-events-none');
    expect(frame.props.className).toContain('z-0');
    expect(frame.props.className).not.toContain('z-20');
    expect(frame.props['aria-hidden']).toBe('true');
    expect(frameClasses).not.toContain('bg-hud-red/55');
    expect(frameClasses).not.toContain('left-8');
    expect(reticle.props.className).toContain('pointer-events-none');
    expect(reticle.props['aria-hidden']).toBe('true');
    expect(reticle.props['data-testid']).toBe('hero-reticle');
    expect(reticleClasses).toContain('border-dashed');
    expect(reticleClasses).toContain('bg-hud-red/35');
  });
});

describe('hero latest essay link', () => {
  it('points at the featured essay from the cached homepage list', async () => {
    journal.getHomepageJournalEntries.mockResolvedValue([
      { id: 'older', slug: 'older-essay', title: 'Older', date: '2026-01-02' },
      { id: 'latest', slug: 'latest-essay', title: 'Latest', date: '2026-10-18' },
    ]);
    const { default: HeroEssayLink } = await import('@/components/home/HeroEssayLink');
    const link = await HeroEssayLink();

    expect(link?.props.href).toBe('/journal/latest-essay');
    expect(link?.props['data-testid']).toBe('hero-latest-essay');
    expect(link?.props.className).toContain('min-h-11');
  });

  it('renders nothing when the journal is empty', async () => {
    journal.getHomepageJournalEntries.mockResolvedValue([]);
    const { default: HeroEssayLink } = await import('@/components/home/HeroEssayLink');
    expect(await HeroEssayLink()).toBeNull();
  });

  it('renders nothing when the journal request fails', async () => {
    journal.getHomepageJournalEntries.mockRejectedValue(new Error('notion unavailable'));
    const { default: HeroEssayLink } = await import('@/components/home/HeroEssayLink');
    expect(await HeroEssayLink()).toBeNull();
  });
});
