import { describe, it, expect } from 'vitest';
import {
  getSubtotalCents,
  getShippingCents,
  getTotalCents,
  qualifiesForFreeShipping,
} from '@/lib/shopPricing';

const std = (qty) => ({ slug: 'sticker', productKey: 'individual', quantity: qty });
const bumper = (qty) => ({ slug: 'antifa', productKey: 'antifaIndividual', quantity: qty });

describe('getSubtotalCents — standard stickers', () => {
  it('1 → $6', () => expect(getSubtotalCents([std(1)])).toBe(600));
  it('2 → $12', () => expect(getSubtotalCents([std(2)])).toBe(1200));
  it('3 → $14', () => expect(getSubtotalCents([std(3)])).toBe(1400));
  it('4 → $20', () => expect(getSubtotalCents([std(4)])).toBe(2000));
  it('5 → $20', () => expect(getSubtotalCents([std(5)])).toBe(2000));
  it('6 → $26 (5-pack + 1)', () => expect(getSubtotalCents([std(6)])).toBe(2600));
  it('10 → $40 (two 5-packs)', () => expect(getSubtotalCents([std(10)])).toBe(4000));
});

describe('getSubtotalCents — bumper stickers', () => {
  it('1 → $10', () => expect(getSubtotalCents([bumper(1)])).toBe(1000));
  it('2 → $20', () => expect(getSubtotalCents([bumper(2)])).toBe(2000));
  it('3 → $24', () => expect(getSubtotalCents([bumper(3)])).toBe(2400));
  it('4 → $34 (3-pack + 1)', () => expect(getSubtotalCents([bumper(4)])).toBe(3400));
  it('5 → $36', () => expect(getSubtotalCents([bumper(5)])).toBe(3600));
  it('6 → $46 (5-pack + 1)', () => expect(getSubtotalCents([bumper(6)])).toBe(4600));
});

describe('getSubtotalCents — mixed cart', () => {
  it('1 standard + 1 bumper = $6 + $10 = $16', () => {
    expect(getSubtotalCents([std(1), bumper(1)])).toBe(1600);
  });

  it('2 standard + 1 bumper = $12 + $10 = $22 (no cross-category 3-pack discount)', () => {
    expect(getSubtotalCents([std(2), bumper(1)])).toBe(2200);
  });

  it('3 standard + 1 bumper = $14 + $10 = $24', () => {
    expect(getSubtotalCents([std(3), bumper(1)])).toBe(2400);
  });

  it('1 standard + 3 bumper = $6 + $24 = $30 (bumper 3-pack fires on bumper qty only)', () => {
    expect(getSubtotalCents([std(1), bumper(3)])).toBe(3000);
  });

  it('multiple standard slugs are pooled together for volume tiers', () => {
    const gadsden = { slug: 'gadsden', productKey: 'gadsdenIndividual', quantity: 2 };
    // std(1) + gadsden(2) = 3 standard total → $14
    expect(getSubtotalCents([std(1), gadsden])).toBe(1400);
  });
});

describe('getSubtotalCents — empty cart', () => {
  it('returns 0 for empty array', () => expect(getSubtotalCents([])).toBe(0));
  it('returns 0 for quantity 0', () => expect(getSubtotalCents(0)).toBe(0));
});

describe('getSubtotalCents — legacy number argument', () => {
  it('treats plain number as all-standard stickers', () => {
    expect(getSubtotalCents(1)).toBe(600);
    expect(getSubtotalCents(3)).toBe(1400);
    expect(getSubtotalCents(5)).toBe(2000);
  });
});

describe('getShippingCents', () => {
  it('charges $4 for 1 item', () => expect(getShippingCents(1)).toBe(400));
  it('charges $4 for 2 items', () => expect(getShippingCents(2)).toBe(400));
  it('is free at 3', () => expect(getShippingCents(3)).toBe(0));
  it('is free at 5', () => expect(getShippingCents(5)).toBe(0));
});

describe('qualifiesForFreeShipping', () => {
  it('false below threshold', () => expect(qualifiesForFreeShipping(2)).toBe(false));
  it('true at 3', () => expect(qualifiesForFreeShipping(3)).toBe(true));
});

describe('getTotalCents', () => {
  it('1 bumper sticker: subtotal $10 + shipping $4 = $14', () => {
    expect(getTotalCents([bumper(1)], 1)).toBe(1400);
  });

  it('3 bumper stickers: subtotal $24 + free shipping = $24', () => {
    expect(getTotalCents([bumper(3)], 3)).toBe(2400);
  });

  it('legacy number path still works', () => {
    expect(getTotalCents(1)).toBe(1000); // $6 + $4
    expect(getTotalCents(3)).toBe(1400); // $14 + $0
  });
});
