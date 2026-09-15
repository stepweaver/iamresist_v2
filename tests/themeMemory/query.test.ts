import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchThemeObservationsInWindow = vi.fn();
const fetchIntelSourceItemsForThemeWindow = vi.fn();

vi.mock('@/lib/themeMemory/db', () => ({
  fetchThemeObservationsInWindow,
  fetchIntelSourceItemsForThemeWindow,
}));

describe('Theme Memory candidate query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges persisted observations with Intel source_items through one interface', async () => {
    fetchThemeObservationsInWindow.mockResolvedValue([
      {
        id: 'obs-1',
        source_system: 'voice',
        source_slug: 'david-pakman',
        source_name: 'David Pakman',
        identity_key: 'yt:pakman11111',
        external_id: 'pakman-1',
        canonical_url: 'https://youtube.com/watch?v=pakman11111',
        title: 'Pakman Monday',
        summary: 'Creators discuss X',
        published_at: '2026-09-14T12:00:00.000Z',
        fetched_at: '2026-09-15T16:00:00.000Z',
        content_hash: 'h1',
        role: 'creator',
        metadata: {},
      },
      {
        id: 'obs-2',
        source_system: 'newswire',
        source_slug: 'the-intercept',
        source_name: 'The Intercept',
        identity_key: 'url:https://theintercept.test/story',
        external_id: 'nw-1',
        canonical_url: 'https://theintercept.test/story',
        title: 'Surveillance bill',
        summary: 'Reporting on X',
        published_at: '2026-09-14T10:00:00.000Z',
        fetched_at: '2026-09-15T16:00:00.000Z',
        content_hash: 'h2',
        role: 'reporting',
        metadata: {},
      },
    ]);
    fetchIntelSourceItemsForThemeWindow.mockResolvedValue([
      {
        id: 'intel-1',
        external_id: 'fr-1',
        canonical_url: 'https://federalregister.gov/d/2026-1',
        title: 'Court-adjacent primary record',
        summary: 'Primary document related to X',
        published_at: '2026-09-13T09:00:00.000Z',
        fetched_at: '2026-09-13T09:05:00.000Z',
        content_hash: 'h3',
        desk_lane: 'osint',
        surface_state: 'surfaced',
        state_change_type: 'published_document',
        mission_tags: ['surveillance_privacy'],
        cluster_keys: {},
        sources: {
          slug: 'federal-register',
          name: 'Federal Register',
          provenance_class: 'PRIMARY',
          desk_lane: 'osint',
          source_family: 'general',
        },
      },
    ]);

    const { getThemeCandidateItems } = await import('@/lib/themeMemory/query');
    const items = await getThemeCandidateItems({
      start: '2026-09-08T16:00:00.000Z',
      end: '2026-09-15T16:00:00.000Z',
    });

    expect(items.map((item) => item.sourceSystem).sort()).toEqual(['intel', 'newswire', 'voice']);
    expect(items.find((item) => item.sourceSystem === 'voice')?.role).toBe('creator');
    expect(items.find((item) => item.sourceSystem === 'newswire')?.role).toBe('reporting');
    expect(items.find((item) => item.sourceSystem === 'intel')?.role).toBe('primary');
    expect(items[0]?.publishedAt).toBe('2026-09-14T12:00:00.000Z');
  });

  it('does not copy Intel rows into the observation query when only intel is requested', async () => {
    fetchIntelSourceItemsForThemeWindow.mockResolvedValue([]);
    const { getThemeCandidateItems } = await import('@/lib/themeMemory/query');
    await getThemeCandidateItems({
      days: 7,
      now: '2026-09-15T16:00:00.000Z',
      sourceSystems: ['intel'],
    });
    expect(fetchThemeObservationsInWindow).not.toHaveBeenCalled();
    expect(fetchIntelSourceItemsForThemeWindow).toHaveBeenCalledTimes(1);
  });
});
