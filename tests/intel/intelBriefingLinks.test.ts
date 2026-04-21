import { describe, expect, it } from 'vitest';
import { buildIntelBriefingLinks } from '@/lib/intel/briefingLinks';

describe('homepage intel briefing link/share derivation', () => {
  it('prefers internal permalink for detail navigation when row has a stable id; share uses preferredIntelShareUrl; source URL remains distinct', () => {
    const row = {
      id: 'row-123',
      canonicalUrl: ' https://example.com/article?utm_source=x ',
    };

    const { internalUrl, shareUrl, sourceUrl } = buildIntelBriefingLinks(row);

    expect(internalUrl).toBe('/intel/item/row-123');
    expect(shareUrl).toBe('/intel/item/row-123');
    expect(sourceUrl).toBe('https://example.com/article?utm_source=x');
    expect(sourceUrl).not.toBe(internalUrl);
  });

  it('falls back to external canonical URL for share when id is missing while keeping internalUrl empty', () => {
    const row = {
      canonicalUrl: ' https://example.com/article ',
    };

    const { internalUrl, shareUrl, sourceUrl } = buildIntelBriefingLinks(row);

    expect(internalUrl).toBe('');
    expect(shareUrl).toBe('https://example.com/article');
    expect(sourceUrl).toBe('https://example.com/article');
  });
});

