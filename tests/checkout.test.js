import { describe, it, expect } from 'vitest';
import { validateAndNormalizeCart } from '@/lib/server/validators/checkout';

describe('validateAndNormalizeCart', () => {
  it('rejects non-integer quantity', () => {
    const r = validateAndNormalizeCart({
      cart: [{ slug: 'sticker', productKey: 'individual', quantity: 1.5 }],
    });
    expect(r.ok).toBe(false);
  });

  it('merges duplicate productKey lines', () => {
    const r = validateAndNormalizeCart({
      cart: [
        { slug: 'sticker', productKey: 'individual', quantity: 1 },
        { slug: 'sticker', productKey: 'individual', quantity: 2 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].quantity).toBe(3);
  });

  it('rejects unknown keys on items', () => {
    const r = validateAndNormalizeCart({
      cart: [{ slug: 'x', productKey: 'individual', quantity: 1, extra: 1 }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects slug/productKey identity mismatches', () => {
    const r = validateAndNormalizeCart({
      cart: [{ slug: 'taco', productKey: 'individual', quantity: 1 }],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts the believe-nothing bumper sticker catalog key', () => {
    const r = validateAndNormalizeCart({
      cart: [{ slug: 'believe-nothing', productKey: 'believeNothingIndividual', quantity: 1 }],
    });
    expect(r.ok).toBe(true);
    expect(r.items[0]).toMatchObject({
      slug: 'believe-nothing',
      productKey: 'believeNothingIndividual',
      quantity: 1,
      sku: 'BELIEVE-NOTHING-STICKER-001',
      productName: 'BELIEVE NOTHING Bumper Sticker',
    });
    expect(r.items[0]).toHaveProperty('printifyProductId');
    expect(r.items[0]).toHaveProperty('printifyVariantId');
  });
});
