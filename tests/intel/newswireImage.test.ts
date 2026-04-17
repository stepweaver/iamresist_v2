import { describe, expect, it } from 'vitest';
import { dropTinyHaaretzThumbsForOgEnrichment } from '@/lib/feeds/newswireImage';

describe('newswireImage', () => {
  it('upgrades tiny Haaretz thumbs before falling back to text-only', () => {
    const stories = [
      {
        sourceSlug: 'haaretz',
        image: 'https://img.haarets.co.il/bs/00000196/sample.jpg?width=108&height=81',
      },
    ];

    dropTinyHaaretzThumbsForOgEnrichment(stories);

    expect(stories[0].image).toContain('width=1200');
    expect(stories[0].image).not.toContain('height=81');
  });
});
