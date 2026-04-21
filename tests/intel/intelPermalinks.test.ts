import { describe, expect, it } from 'vitest';
import { intelItemPermalinkPath, preferredIntelShareUrl } from '@/lib/intel/permalinks';

describe('intel permalinks', () => {
  it('builds a stable internal permalink path for an item id', () => {
    expect(intelItemPermalinkPath('abc')).toBe('/intel/item/abc');
    expect(intelItemPermalinkPath(' id with spaces ')).toBe('/intel/item/id%20with%20spaces');
  });

  it('prefers internal permalink for share URL when id is available', () => {
    expect(
      preferredIntelShareUrl({
        id: 'row-123',
        canonicalUrl: 'https://example.com/raw',
      }),
    ).toBe('/intel/item/row-123');
  });

  it('falls back to canonicalUrl when id is missing', () => {
    expect(
      preferredIntelShareUrl({
        canonicalUrl: ' https://example.com/raw ',
      }),
    ).toBe('https://example.com/raw');
  });
});

