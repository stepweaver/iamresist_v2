import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const schema = vi.fn(() => ({ from }));
const supabaseAdmin = vi.fn(() => ({ schema }));

vi.mock('@/lib/server/supabaseAdmin', () => ({
  supabaseAdmin,
}));

vi.mock('@/lib/env/db', () => ({
  dbEnv: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  },
}));

describe('live desk snapshot loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves preCapCandidates when present and remains backward compatible', async () => {
    const { loadLiveDeskSnapshot } = await import('@/lib/intel/db');

    maybeSingle.mockResolvedValueOnce({
      data: {
        payload: {
          items: [{ id: 'visible-1' }],
          preCapCandidates: [{ id: 'candidate-1' }, { id: 'candidate-2' }],
          suppressedItems: [{ id: 'suppressed-1' }],
          freshness: null,
          freshnessMeta: null,
        },
      },
      error: null,
    });

    const withPreCap = await loadLiveDeskSnapshot(1);
    expect(withPreCap).toMatchObject({
      items: [{ id: 'visible-1' }],
      preCapCandidates: [{ id: 'candidate-1' }, { id: 'candidate-2' }],
      suppressedItems: [{ id: 'suppressed-1' }],
      freshness: null,
      freshnessMeta: null,
    });

    maybeSingle.mockResolvedValueOnce({
      data: {
        payload: {
          items: [{ id: 'legacy-visible-1' }],
          freshness: null,
          freshnessMeta: null,
        },
      },
      error: null,
    });

    const legacy = await loadLiveDeskSnapshot(1);
    expect(legacy).toMatchObject({
      items: [{ id: 'legacy-visible-1' }],
      preCapCandidates: [],
      freshness: null,
      freshnessMeta: null,
    });
  });
});
