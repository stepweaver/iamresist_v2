import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSignalSources } from '@/lib/intel/signal-sources';
import { THEME_ATTENTION_RANKING, deriveThemeAttentionSignal } from '@/lib/intel/themeAttentionRanking';
import { getAllVoices, getEnabledVoices } from '@/lib/notion/voices.repo';

const RETIRED_INTEL_VOICE_SLUGS = [
  'robert-reich',
  'g-elliott-morris',
  'on-offense-kris-goldsmith',
  'total-hypocrisy',
] as const;

const enabledEq = vi.fn(async () => ({
  data: [{ id: 'enabled-source' }, { id: '' }],
  error: null,
}));
const laneEq = vi.fn(() => ({ eq: enabledEq }));
const select = vi.fn(() => ({ eq: laneEq }));
const from = vi.fn(() => ({ select }));
const schema = vi.fn(() => ({ from }));

vi.mock('@/lib/server/supabaseAdmin', () => ({
  supabaseAdmin: () => ({ schema }),
}));

vi.mock('@/lib/env/db', () => ({
  dbEnv: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  },
}));

describe('retired Intel Voices RSS sources', () => {
  it('disables the four commentary feeds and leaves other Substack sources enabled', () => {
    const sources = getSignalSources();
    for (const slug of RETIRED_INTEL_VOICE_SLUGS) {
      const source = sources.find((entry) => entry.slug === slug);
      expect(source?.isEnabled).toBe(false);
      expect(source?.deskLane).toBe('voices');
      expect(source?.fetchKind).toBe('rss');
    }

    const courier = sources.find((entry) => entry.slug === 'courier-the-cover-up');
    expect(courier?.isEnabled).toBe(true);
    expect(courier?.deskLane).toBe('osint');
  });

  it('keeps Notion Voices and Theme Memory entry points available', () => {
    expect(typeof getAllVoices).toBe('function');
    expect(typeof getEnabledVoices).toBe('function');
    expect(typeof deriveThemeAttentionSignal).toBe('function');
    expect(THEME_ATTENTION_RANKING.MAX_CONTRIBUTION).toBe(5);
  });
});

describe('fetchSourceIdsForDeskLane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enabledEq.mockResolvedValue({
      data: [{ id: 'enabled-source' }, { id: '' }],
      error: null,
    });
  });

  it('selects only enabled sources for a desk lane', async () => {
    const { fetchSourceIdsForDeskLane } = await import('@/lib/intel/db');
    const ids = await fetchSourceIdsForDeskLane('osint');

    expect(from).toHaveBeenCalledWith('sources');
    expect(select).toHaveBeenCalledWith('id, slug');
    expect(laneEq).toHaveBeenCalledWith('desk_lane', 'osint');
    expect(enabledEq).toHaveBeenCalledWith('is_enabled', true);
    expect(ids).toEqual(['enabled-source']);
  });

  it('drops a manifest-disabled slug that is still enabled in the database', async () => {
    enabledEq.mockResolvedValue({
      data: [
        { id: 'rappler-id', slug: 'rappler' },
        { id: 'bellingcat-id', slug: 'bellingcat' },
      ],
      error: null,
    });
    const { fetchSourceIdsForDeskLane } = await import('@/lib/intel/db');
    const ids = await fetchSourceIdsForDeskLane('watchdogs');
    expect(ids).toEqual(['bellingcat-id']);
  });
});
