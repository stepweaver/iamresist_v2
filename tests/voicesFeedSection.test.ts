import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { Children, isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

type SectionProps = { children?: React.ReactNode; className?: string };

function asElement(node: React.ReactNode, label: string): React.ReactElement<SectionProps> {
  if (!isValidElement<SectionProps>(node)) {
    throw new Error(label);
  }
  return node;
}

vi.mock('server-only', () => ({}));

vi.mock('@/components/voices/VoicesGridWithPlayerClient', () => ({
  default: () => React.createElement('div', { 'data-testid': 'voices-grid' }, 'Voices grid'),
}));

describe('VoicesFeedSection header sizing', () => {
  it('matches Live Briefing header scale for the Telescreen section', async () => {
    const { default: VoicesFeedSection } = await import('@/components/voices/VoicesFeedSection');

    const element = await VoicesFeedSection({
      items: [{ id: 'voice-1', title: 'Voice item' }],
      title: 'Telescreen',
      description: 'Commentary and media.',
    });

    const section = asElement(element, 'Expected VoicesFeedSection to return a valid React element');
    const sectionChildren = Children.toArray(section.props.children);
    const headerRow = asElement(sectionChildren[0], 'Expected section header row to be a valid React element');
    const headerChildren = Children.toArray(headerRow.props.children);
    const copyBlock = asElement(headerChildren[0], 'Expected section copy block to be a valid React element');
    const copyChildren = Children.toArray(copyBlock.props.children);
    const title = asElement(copyChildren[0], 'Expected section title and description to be valid React elements');
    const description = asElement(copyChildren[1], 'Expected section title and description to be valid React elements');

    expect(title.props.className).toBe('kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block');
    expect(description.props.className).toBe(
      'text-[11px] sm:text-xs text-foreground/60 font-mono mt-1 max-w-2xl leading-relaxed',
    );
  });
});
