import { describe, expect, it } from 'vitest';
import { selectSourceScopedArticleImage } from '@/lib/feeds/ogImage';

describe('ogImage source-scoped fallback', () => {
  it('allows article-image fallback for Al Jazeera', () => {
    const out = selectSourceScopedArticleImage('https://www.aljazeera.com/news/2026/04/17/story', [
      'https://www.aljazeera.com/wp-content/uploads/2026/04/hero.jpg',
    ]);

    expect(out).toBe('https://www.aljazeera.com/wp-content/uploads/2026/04/hero.jpg');
  });

  it('fails closed for non-allowlisted publishers', () => {
    const out = selectSourceScopedArticleImage('https://example.com/story', [
      'https://example.com/images/hero.jpg',
    ]);

    expect(out).toBeNull();
  });
});
