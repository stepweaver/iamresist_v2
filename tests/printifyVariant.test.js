import { describe, expect, it } from 'vitest';
import { selectEnabledVariant } from '@/lib/fulfillment/printify';

const variants = [
  { id: 111, is_enabled: true },
  { id: 222, is_enabled: true },
  { id: 333, is_enabled: false },
];

describe('selectEnabledVariant', () => {
  it('keeps the first enabled variant when no variant id is configured', () => {
    expect(selectEnabledVariant(variants, '')?.id).toBe(111);
    expect(selectEnabledVariant(variants)?.id).toBe(111);
  });

  it('uses the configured variant when it is enabled', () => {
    expect(selectEnabledVariant(variants, '222')?.id).toBe(222);
    expect(selectEnabledVariant(variants, 222)?.id).toBe(222);
  });

  it('does not select a configured variant that is disabled', () => {
    expect(selectEnabledVariant(variants, '333')).toBeNull();
  });

  it('does not fall back to another variant when the configured id is missing', () => {
    expect(selectEnabledVariant(variants, '999')).toBeNull();
  });
});
