import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { Children, isValidElement } = React;
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

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

    if (!isValidElement(element)) {
      throw new Error('Expected VoicesFeedSection to return a valid React element');
    }

    const sectionChildren = Children.toArray(element.props.children);
    const headerRow = sectionChildren[0];

    if (!isValidElement(headerRow)) {
      throw new Error('Expected section header row to be a valid React element');
    }

    const headerChildren = Children.toArray(headerRow.props.children);
    const copyBlock = headerChildren[0];

    if (!isValidElement(copyBlock)) {
      throw new Error('Expected section copy block to be a valid React element');
    }

    const copyChildren = Children.toArray(copyBlock.props.children);
    const title = copyChildren[0];
    const description = copyChildren[1];

    if (!isValidElement(title) || !isValidElement(description)) {
      throw new Error('Expected section title and description to be valid React elements');
    }

    expect(title.props.className).toBe('kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block');
    expect(description.props.className).toBe(
      'text-[11px] sm:text-xs text-foreground/60 font-mono mt-1 max-w-2xl leading-relaxed',
    );
  });
});
