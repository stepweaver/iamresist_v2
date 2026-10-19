import { describe, expect, it } from 'vitest';
import { journalOgImage, journalOgTitle, journalOgTitleSize } from '@/lib/seo/journalOg';

describe('journal open graph metadata', () => {
  it('points each essay at its own image without changing the article path', () => {
    const image = journalOgImage({
      slug: 'show-me-the-proof',
      title: 'Show Me the Proof',
    });

    expect(image.url).toBe('/journal/show-me-the-proof/og');
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
    expect(image.alt).toContain('Show Me the Proof');
    expect(image.alt).toContain('I AM [RESIST]');
  });

  it('keeps long titles inside the image and sizes them down', () => {
    const title = 'Accountability '.repeat(20).trim();
    const fitted = journalOgTitle(title);
    expect(fitted.endsWith('…')).toBe(true);
    expect(fitted.length).toBeLessThanOrEqual(141);
    expect(journalOgTitleSize(title)).toBeLessThan(journalOgTitleSize('Short essay'));
    expect(journalOgTitle('')).toBe('Essay');
  });
});
