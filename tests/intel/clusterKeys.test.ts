import { describe, expect, it } from 'vitest';
import {
  billCanonicalKey,
  extractBillClusterKeys,
  extractExecutiveClusterKeys,
  extractFrClusterKeys,
  parseBillFromUrl,
} from '@/lib/intel/clusterKeys';

describe('clusterKeys (deterministic)', () => {
  it('parses GovInfo BILLS detail URL', () => {
    const url = 'https://www.govinfo.gov/app/details/BILLS-119hr123';
    const p = parseBillFromUrl(url);
    expect(p).toEqual({ congress: '119', type: 'hr', number: '123' });
    expect(billCanonicalKey(p)).toBe('119-hr-123');
    expect(extractBillClusterKeys(url)).toEqual({ bill: '119-hr-123' });
  });

  it('extracts FR document number', () => {
    expect(extractFrClusterKeys('2026-07143')).toEqual({ fr_document_number: '2026-07143' });
    expect(extractFrClusterKeys('')).toEqual({});
  });

  it('extracts executive order number from title', () => {
    expect(extractExecutiveClusterKeys('Executive Order 14123 on something')).toEqual({
      executive_order: '14123',
    });
  });

  it('extracts proclamation number from title', () => {
    expect(extractExecutiveClusterKeys('A Proclamation 9981')).toEqual({
      proclamation: '9981',
    });
  });
});
