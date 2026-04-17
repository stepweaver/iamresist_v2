import { describe, expect, it } from 'vitest';
import {
  extractFeedImage,
  inspectFeedItemImage,
  polishFeedCardImageUrl,
  shouldSkipFeedImageCandidate,
} from '@/lib/feeds/feedItemImage.js';

describe('feedItemImage', () => {
  it('skips Meduza imgly/share headline cards (not usable photos)', () => {
    const bad =
      'https://meduza.io/imgly/share/1776283903/en/news/2026/04/15/moscow-sex-worker-gets-13-days-in-jail-for-nazi-eagle-hat-photos-used-in-role-play';
    expect(shouldSkipFeedImageCandidate(bad)).toBe(true);
    expect(shouldSkipFeedImageCandidate('https://example.com/photo.jpg')).toBe(false);
  });

  it('extractFeedImage prefers real Meduza attachment images over share cards', () => {
    const share = extractFeedImage({
      link: 'https://meduza.io/en/news/2026/04/15/story',
      enclosure: {
        url: 'https://meduza.io/imgly/share/123/en/news/2026/04/15/story',
        type: 'image/png',
      },
      'media:thumbnail': [{ $: { url: 'https://meduza.io/image/attachments/images/012/098/659/small/abc' } }],
    } as Record<string, unknown>);
    expect(share).toBe('https://meduza.io/image/attachments/images/012/098/659/small/abc');
  });

  it('upgrades Rappler Tachyon URLs to a wider max width for sharp card display', () => {
    const low =
      'https://www.rappler.com/tachyon/2026/04/photo.jpg?fit=400%2C300&w=320';
    const out = polishFeedCardImageUrl(low);
    expect(out).toContain('w=1280');
    expect(out).not.toContain('fit=');
  });

  it('skips Rappler Tachyon favicon / tiny fit assets', () => {
    const icon = 'https://www.rappler.com/tachyon/2022/11/cropped-Piano-Small.png?fit=32%2C32';
    expect(shouldSkipFeedImageCandidate(icon)).toBe(true);
  });

  it('surfaces tiny Haaretz thumbs as accepted feed images before newswire-specific dropping', () => {
    const result = inspectFeedItemImage({
      link: 'https://www.haaretz.com/israel-news/2026-04-17/story',
      enclosure: {
        url: 'https://img.haarets.co.il/bs/00000196/sample.jpg?width=108&height=81',
        type: 'image/jpeg',
      },
    } as Record<string, unknown>);

    expect(result.image).toContain('img.haarets.co.il');
    expect(result.skippedByPolicy).toBe(false);
    expect(result.firstCandidate?.resolvedUrl).toContain('img.haarets.co.il');
  });
});
