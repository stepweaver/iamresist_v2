import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: any[]) => any) => fn,
}));

vi.mock('@/lib/intel/deskLimits', () => ({
  parseDeskSurfacedFetchLimit: () => 20,
  parseDeskDownrankedFetchLimit: () => 10,
  parseDeskSuppressedFetchLimit: () => 5,
  parseDeskMaxVisibleItems: () => 2,
}));

vi.mock('@/lib/feeds/ogImage.js', () => ({
  fetchOgImageUncached: async () => null,
  fetchOgImageFetchCached: async () => null,
}));

function makeRow(partial: Record<string, any>) {
  return {
    id: partial.id ?? 'row',
    title: partial.title ?? 'Title',
    summary: partial.summary ?? null,
    canonical_url: partial.canonical_url ?? `https://example.com/${partial.id ?? 'row'}`,
    image_url: partial.image_url ?? null,
    published_at: partial.published_at ?? new Date().toISOString(),
    fetched_at: partial.fetched_at ?? new Date().toISOString(),
    desk_lane: partial.desk_lane ?? 'osint',
    content_use_mode: partial.content_use_mode ?? 'feed_summary',
    cluster_keys: partial.cluster_keys ?? {},
    state_change_type: partial.state_change_type ?? 'specialist_item',
    mission_tags: partial.mission_tags ?? [],
    branch_of_government: partial.branch_of_government ?? 'unknown',
    institutional_area: partial.institutional_area ?? 'specialist',
    relevance_score: partial.relevance_score ?? 60,
    surface_state: partial.surface_state ?? 'surfaced',
    suppression_reason: partial.suppression_reason ?? null,
    relevance_explanations: partial.relevance_explanations ?? [],
    sources: {
      slug: partial.sources?.slug ?? `${partial.id ?? 'row'}-source`,
      name: partial.sources?.name ?? 'Source',
      provenance_class: partial.sources?.provenance_class ?? 'SPECIALIST',
      desk_lane: partial.sources?.desk_lane ?? partial.desk_lane ?? 'osint',
      source_family: partial.sources?.source_family ?? 'general',
      trust_warning_mode: partial.sources?.trust_warning_mode ?? 'none',
    },
  };
}

const OSINT_SURFACED_FIXTURE = [
  // Two White House ceremonial items (should be demoted by display priority)
  makeRow({
    id: '1',
    title: 'A Proclamation on National Something Day',
    canonical_url: 'https://example.com/p1',
    desk_lane: 'osint',
    cluster_keys: { proclamation: '123' },
    state_change_type: 'presidential_action',
    mission_tags: ['executive_power'],
    branch_of_government: 'executive',
    institutional_area: 'white_house',
    relevance_score: 70,
    sources: { slug: 'wh-presidential', name: 'WH', provenance_class: 'PRIMARY' },
  }),
  makeRow({
    id: '2',
    title: 'A Proclamation on National Another Day',
    canonical_url: 'https://example.com/p2',
    desk_lane: 'osint',
    cluster_keys: { proclamation: '124' },
    state_change_type: 'presidential_action',
    mission_tags: ['executive_power'],
    branch_of_government: 'executive',
    institutional_area: 'white_house',
    relevance_score: 68,
    sources: { slug: 'wh-presidential', name: 'WH', provenance_class: 'PRIMARY' },
  }),
  // High-impact specialist item (should win a lead slot)
  makeRow({
    id: '3',
    title: 'Court grants preliminary injunction in voting rights case',
    canonical_url: 'https://example.com/court',
    desk_lane: 'osint',
    cluster_keys: {},
    state_change_type: 'specialist_item',
    mission_tags: ['courts', 'voting_rights'],
    branch_of_government: 'judicial',
    institutional_area: 'courts',
    relevance_score: 55,
    sources: { slug: 'scotusblog', name: 'SCOTUSblog', provenance_class: 'SPECIALIST' },
  }),
];

function defaultRowsForLane(lane: string) {
  if (lane === 'osint') return OSINT_SURFACED_FIXTURE;
  if (lane === 'voices') {
    return [
      makeRow({
        id: 'voice-default',
        title: 'Creator commentary on a separate story',
        summary: 'This should not affect the default desk tests.',
        desk_lane: 'voices',
        cluster_keys: { topic: 'separate-voice-story' },
        mission_tags: ['executive_power'],
        sources: {
          slug: 'voice-default',
          name: 'Voice Default',
          provenance_class: 'COMMENTARY',
          desk_lane: 'voices',
          source_family: 'claims_public',
        },
      }),
    ];
  }
  return [
    makeRow({
      id: `${lane}-1`,
      title: `${lane} item`,
      canonical_url: `https://example.com/${lane}`,
      desk_lane: lane,
      relevance_score: 50,
      sources: {
        slug: `${lane}-source`,
        name: `${lane} source`,
        provenance_class: 'SPECIALIST',
        desk_lane: lane,
        source_family: 'general',
      },
    }),
  ];
}

const { fetchSurfacedSourceItemsForLive, fetchIntelFreshnessForDeskLane } = vi.hoisted(() => ({
  fetchSurfacedSourceItemsForLive: vi.fn(async (limit: number, lane: string) => defaultRowsForLane(lane)),
  fetchIntelFreshnessForDeskLane: vi.fn(async () => ({
    latestFetchedAt: null,
    latestSuccessfulIngestAt: null,
  })),
}));

vi.mock('@/lib/intel/db', () => ({
  intelDbConfigured: () => true,
  fetchIntelFreshnessForDeskLane,
  saveLiveDeskSnapshot: async () => {},
  loadLiveDeskSnapshot: async () => null,
  fetchDownrankedSourceItemsForLive: async () => [],
  fetchSuppressedSourceItemsForLive: async () => [],
  fetchSurfacedSourceItemsForLive,
}));

describe('live desk composition (Milestone 2)', () => {
  beforeEach(() => {
    fetchSurfacedSourceItemsForLive.mockClear();
    fetchIntelFreshnessForDeskLane.mockClear();
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => defaultRowsForLane(lane));
  });

  it('does not let ceremonial proclamations dominate the lead block', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    const desk = await getLiveIntelDesk('osint');

    expect(Array.isArray(desk.leadItems)).toBe(true);
    expect(Array.isArray(desk.secondaryLeadItems)).toBe(true);

    const top = [...(desk.leadItems ?? []), ...(desk.secondaryLeadItems ?? [])];
    expect(top.length).toBeGreaterThan(0);

    // The court item should appear in the lead block.
    expect(top.some((x) => x.id === '3')).toBe(true);

    // And the lead block should not be entirely ceremonial WH proclamations.
    const whCeremonialCount = top.filter((x) => x.sourceSlug === 'wh-presidential').length;
    expect(whCeremonialCount).toBeLessThan(top.length);
  });
});

describe('live desk lane routing', () => {
  beforeEach(() => {
    fetchSurfacedSourceItemsForLive.mockClear();
    fetchIntelFreshnessForDeskLane.mockClear();
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => defaultRowsForLane(lane));
  });

  it('preserves watchdogs lane', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    await getLiveIntelDesk('watchdogs');
    expect(fetchSurfacedSourceItemsForLive).toHaveBeenCalledWith(expect.any(Number), 'watchdogs');
    expect(fetchIntelFreshnessForDeskLane).toHaveBeenCalledWith('watchdogs');
  });

  it('preserves defense_ops lane', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    await getLiveIntelDesk('defense_ops');
    expect(fetchSurfacedSourceItemsForLive).toHaveBeenCalledWith(expect.any(Number), 'defense_ops');
    expect(fetchIntelFreshnessForDeskLane).toHaveBeenCalledWith('defense_ops');
  });

  it('preserves indicators lane', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    await getLiveIntelDesk('indicators');
    expect(fetchSurfacedSourceItemsForLive).toHaveBeenCalledWith(expect.any(Number), 'indicators');
    expect(fetchIntelFreshnessForDeskLane).toHaveBeenCalledWith('indicators');
  });

  it('preserves statements lane', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    await getLiveIntelDesk('statements');
    expect(fetchSurfacedSourceItemsForLive).toHaveBeenCalledWith(expect.any(Number), 'statements');
    expect(fetchIntelFreshnessForDeskLane).toHaveBeenCalledWith('statements');
  });
});

describe('metadata_only on default desk surfaces', () => {
  beforeEach(() => {
    fetchSurfacedSourceItemsForLive.mockClear();
    fetchIntelFreshnessForDeskLane.mockClear();
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => defaultRowsForLane(lane));
  });

  it('excludes metadata_only from OSINT visible desk output', async () => {
    fetchSurfacedSourceItemsForLive.mockImplementationOnce(async () => [
      ...OSINT_SURFACED_FIXTURE,
      {
        id: 'meta-osint-1',
        title: 'Procedural schedule pointer',
        summary: null,
        canonical_url: 'https://example.com/meta',
        image_url: null,
        published_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
        desk_lane: 'osint',
        content_use_mode: 'metadata_only',
        cluster_keys: {},
        state_change_type: 'scheduled_release',
        mission_tags: [],
        branch_of_government: 'unknown',
        institutional_area: 'unknown',
        relevance_score: 90,
        surface_state: 'surfaced',
        suppression_reason: null,
        relevance_explanations: [],
        sources: {
          slug: 'test-meta',
          name: 'Test meta',
          provenance_class: 'SCHEDULE',
          desk_lane: 'osint',
          source_family: 'general',
        },
      },
    ]);

    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    const desk = await getLiveIntelDesk('osint');
    const ids = [
      ...(desk.items ?? []),
      ...(desk.leadItems ?? []),
      ...(desk.secondaryLeadItems ?? []),
    ].map((x: { id: string }) => x.id);
    expect(ids).not.toContain('meta-osint-1');
  });
});

describe('live desk debug payload', () => {
  beforeEach(() => {
    fetchSurfacedSourceItemsForLive.mockClear();
    fetchIntelFreshnessForDeskLane.mockClear();
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => defaultRowsForLane(lane));
  });

  it('exposes a bounded pre-cap candidate list with real helper output', async () => {
    const { getLiveIntelDeskDebug } = await import('@/lib/feeds/liveIntel.service');
    const debugDesk = await getLiveIntelDeskDebug('osint');

    expect(debugDesk.deskLane).toBe('osint');
    expect(debugDesk.counts.visible).toBe(2);
    expect(debugDesk.counts.preCapCandidates).toBe(3);
    expect(debugDesk.items.visible).toHaveLength(2);
    expect(debugDesk.items.preCapCandidates).toHaveLength(3);

    expect(debugDesk.items.preCapCandidates.map((item: any) => item.preCapRank)).toEqual([1, 2, 3]);
    expect(debugDesk.items.preCapCandidates.map((item: any) => item.madeVisible)).toEqual([
      true,
      true,
      false,
    ]);

    expect(debugDesk.items.preCapCandidates[0]).toMatchObject({
      listName: 'pre_cap_candidate',
      title: expect.any(String),
      url: expect.stringContaining('https://example.com/'),
      sourceSlug: expect.any(String),
      deskLane: 'osint',
      provenanceClass: expect.any(String),
      publishedAt: expect.any(String),
      relevance_score: expect.any(Number),
      surface_state: expect.any(String),
      suppression_reason: null,
      baseDisplayPriority: expect.any(Number),
      displayPriority: expect.any(Number),
      creatorCorroborationBoost: expect.any(Number),
      displayBucket: expect.any(String),
      missionScope: {
        reason: expect.any(String),
        positiveHits: expect.any(Array),
        sportsHits: expect.any(Array),
        softOffTopicHits: expect.any(Array),
      },
      duplicateClusterKey: null,
      creatorCorroboration: null,
      duplicateSelection: 'unique',
      duplicateWinnerId: null,
      shortExplanations: {
        relevance: expect.any(Array),
        display: expect.any(Array),
      },
    });
  });
});

describe('live desk creator corroboration bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));
    fetchSurfacedSourceItemsForLive.mockClear();
    fetchIntelFreshnessForDeskLane.mockClear();
  });

  it('gives an already-eligible watchdog item a small boost from trusted creator convergence', async () => {
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => {
      if (lane === 'watchdogs') {
        return [
          makeRow({
            id: 'watchdog-ice',
            title: 'Watchdog documents Los Angeles detention raid fallout after ICE crackdown',
            summary: 'Monitors corroborate detainee counts and timeline.',
            desk_lane: 'watchdogs',
            cluster_keys: { topic: 'la-detention-crackdown' },
            mission_tags: ['executive_power', 'civil_liberties'],
            relevance_score: 66,
            published_at: '2026-04-17T10:45:00.000Z',
            sources: {
              slug: 'watchdog-ice',
              name: 'Watchdog ICE',
              provenance_class: 'SPECIALIST',
              desk_lane: 'watchdogs',
              source_family: 'watchdog_global',
            },
          }),
          makeRow({
            id: 'watchdog-routine',
            title: 'Routine ethics calendar note',
            desk_lane: 'watchdogs',
            relevance_score: 61,
            mission_tags: ['federal_agencies'],
            sources: {
              slug: 'routine-watchdog',
              name: 'Routine Watchdog',
              provenance_class: 'PRIMARY',
              desk_lane: 'watchdogs',
            },
          }),
        ];
      }
      if (lane === 'voices') {
        return [
          makeRow({
            id: 'voice-a',
            title: 'Creator tracks ICE detention raid fallout in Los Angeles',
            summary: 'Multiple communities document the same detention crackdown.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'la-detention-crackdown' },
            mission_tags: ['executive_power', 'civil_liberties'],
            published_at: '2026-04-17T10:30:00.000Z',
            sources: {
              slug: 'creator-a',
              name: 'Creator A',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
          makeRow({
            id: 'voice-b',
            title: 'Trusted voice maps Los Angeles detention raid fallout and ICE crackdown',
            summary: 'Another independent creator surfaces the same detention operation.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'la-detention-crackdown' },
            mission_tags: ['executive_power', 'civil_liberties'],
            published_at: '2026-04-17T09:50:00.000Z',
            sources: {
              slug: 'creator-b',
              name: 'Creator B',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
        ];
      }
      return defaultRowsForLane(lane);
    });

    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    const desk = await getLiveIntelDesk('watchdogs');
    const bridged = desk.items.find((item: any) => item.id === 'watchdog-ice');

    expect(bridged?.creatorCorroborationBoost).toBeGreaterThan(0);
    expect(bridged?.creatorCorroborationBoost).toBeLessThanOrEqual(4);
    expect(bridged?.baseDisplayPriority).toBeLessThan(bridged?.displayPriority);
    expect(bridged?.creatorCorroboration?.reasons).toContain('trusted_creator_convergence');
  });

  it('does not let unsupported creator-heavy chatter dominate the desk', async () => {
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => {
      if (lane === 'watchdogs') {
        return [
          makeRow({
            id: 'hard-item',
            title: 'Inspector general subpoena expands prison abuse investigation',
            summary: 'Documented accountability escalation.',
            desk_lane: 'watchdogs',
            cluster_keys: { investigation: 'prison-abuse-1' },
            mission_tags: ['civil_liberties', 'federal_agencies'],
            relevance_score: 72,
            sources: {
              slug: 'hard-watchdog',
              name: 'Hard Watchdog',
              provenance_class: 'PRIMARY',
              desk_lane: 'watchdogs',
              source_family: 'watchdog_global',
            },
          }),
          makeRow({
            id: 'soft-item',
            title: 'Monitoring thread on vague media shakeup rumors',
            summary: 'Thin reporting and no corroborating documentation.',
            desk_lane: 'watchdogs',
            cluster_keys: { topic: 'media-rumor-wave' },
            mission_tags: ['executive_power'],
            relevance_score: 52,
            sources: {
              slug: 'soft-watchdog',
              name: 'Soft Watchdog',
              provenance_class: 'SPECIALIST',
              desk_lane: 'watchdogs',
              source_family: 'general',
            },
          }),
        ];
      }
      if (lane === 'voices') {
        return [
          makeRow({
            id: 'voice-noise-a',
            title: 'Creator reacts to vague rumors about a media shakeup',
            summary: 'Live reaction without corroborating reporting.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'media-rumor-wave' },
            mission_tags: ['executive_power'],
            published_at: '2026-04-17T10:00:00.000Z',
            sources: {
              slug: 'noise-a',
              name: 'Noise A',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
          makeRow({
            id: 'voice-noise-b',
            title: 'Another creator reacts to the same media shakeup rumors',
            summary: 'Second creator echoes the chatter.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'media-rumor-wave' },
            mission_tags: ['executive_power'],
            published_at: '2026-04-17T09:40:00.000Z',
            sources: {
              slug: 'noise-b',
              name: 'Noise B',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
        ];
      }
      return defaultRowsForLane(lane);
    });

    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    const desk = await getLiveIntelDesk('watchdogs');
    const rankedIds = desk.preCapCandidates.map((item: any) => item.id);
    const softItem = desk.preCapCandidates.find((item: any) => item.id === 'soft-item');

    expect(rankedIds[0]).toBe('hard-item');
    expect(softItem?.creatorCorroborationBoost).toBeGreaterThan(0);
    expect(softItem?.displayPriority).toBeLessThan(
      desk.preCapCandidates.find((item: any) => item.id === 'hard-item')?.displayPriority,
    );
  });

  it('does not let off-topic creator activity bypass topic gating', async () => {
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => {
      if (lane === 'osint') {
        return [
          makeRow({
            id: 'sports-item',
            title: 'Team wins dramatic playoff game in overtime',
            summary: 'Pure sports chatter that should stay off mission.',
            desk_lane: 'osint',
            cluster_keys: { topic: 'playoff-overtime-game' },
            mission_tags: [],
            relevance_score: 60,
            sources: {
              slug: 'sports-wire',
              name: 'Sports Wire',
              provenance_class: 'WIRE',
              desk_lane: 'osint',
            },
          }),
          makeRow({
            id: 'mission-item',
            title: 'Federal court hears challenge to surveillance authority',
            summary: 'A real accountability story for the desk.',
            desk_lane: 'osint',
            cluster_keys: { case_number: 'surveillance-case-1' },
            mission_tags: ['courts', 'civil_liberties'],
            relevance_score: 68,
            sources: {
              slug: 'court-watch',
              name: 'Court Watch',
              provenance_class: 'SPECIALIST',
              desk_lane: 'osint',
            },
          }),
        ];
      }
      if (lane === 'voices') {
        return [
          makeRow({
            id: 'sports-voice-a',
            title: 'Creator celebrates the same playoff overtime game',
            summary: 'Same sports chatter.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'playoff-overtime-game' },
            published_at: '2026-04-17T10:00:00.000Z',
            sources: {
              slug: 'sports-voice-a',
              name: 'Sports Voice A',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
          makeRow({
            id: 'sports-voice-b',
            title: 'Another creator echoes the playoff overtime game reaction',
            summary: 'More off-topic creator activity.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'playoff-overtime-game' },
            published_at: '2026-04-17T09:45:00.000Z',
            sources: {
              slug: 'sports-voice-b',
              name: 'Sports Voice B',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
        ];
      }
      return defaultRowsForLane(lane);
    });

    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    const desk = await getLiveIntelDesk('osint');
    const sportsItem = desk.preCapCandidates.find((item: any) => item.id === 'sports-item');

    expect(sportsItem?.creatorCorroborationBoost).toBe(0);
    expect(sportsItem?.creatorCorroboration).toBeNull();
  });

  it('does not import direct voices items into the live intel desk', async () => {
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => {
      if (lane === 'watchdogs') {
        return [
          makeRow({
            id: 'watchdog-visible',
            title: 'Watchdog item for desk',
            desk_lane: 'watchdogs',
            mission_tags: ['civil_liberties'],
            sources: {
              slug: 'watchdog-visible',
              name: 'Watchdog Visible',
              provenance_class: 'PRIMARY',
              desk_lane: 'watchdogs',
            },
          }),
        ];
      }
      if (lane === 'voices') {
        return [
          makeRow({
            id: 'voice-direct-a',
            title: 'Creator item that should stay support-only',
            desk_lane: 'voices',
            cluster_keys: { topic: 'support-only' },
            sources: {
              slug: 'voice-direct-a',
              name: 'Voice Direct A',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
          makeRow({
            id: 'voice-direct-b',
            title: 'Second creator item that should stay support-only',
            desk_lane: 'voices',
            cluster_keys: { topic: 'support-only' },
            sources: {
              slug: 'voice-direct-b',
              name: 'Voice Direct B',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
        ];
      }
      return defaultRowsForLane(lane);
    });

    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    const desk = await getLiveIntelDesk('watchdogs');
    const ids = desk.preCapCandidates.map((item: any) => item.id);

    expect(ids).not.toContain('voice-direct-a');
    expect(ids).not.toContain('voice-direct-b');
  });

  it('includes creator corroboration reasons in the debug output when applied', async () => {
    fetchSurfacedSourceItemsForLive.mockImplementation(async (limit: number, lane: string) => {
      if (lane === 'watchdogs') {
        return [
          makeRow({
            id: 'watchdog-debug',
            title: 'Watchdog documents Los Angeles detention raid fallout after ICE crackdown',
            summary: 'Monitors corroborate detainee counts and timeline.',
            desk_lane: 'watchdogs',
            cluster_keys: { topic: 'la-detention-crackdown' },
            mission_tags: ['executive_power', 'civil_liberties'],
            published_at: '2026-04-17T10:45:00.000Z',
            sources: {
              slug: 'watchdog-debug',
              name: 'Watchdog Debug',
              provenance_class: 'SPECIALIST',
              desk_lane: 'watchdogs',
              source_family: 'watchdog_global',
            },
          }),
        ];
      }
      if (lane === 'voices') {
        return [
          makeRow({
            id: 'voice-debug-a',
            title: 'Creator tracks ICE detention raid fallout in Los Angeles',
            summary: 'Multiple communities document the same detention crackdown.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'la-detention-crackdown' },
            published_at: '2026-04-17T10:30:00.000Z',
            mission_tags: ['executive_power', 'civil_liberties'],
            sources: {
              slug: 'voice-debug-a',
              name: 'Voice Debug A',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
          makeRow({
            id: 'voice-debug-b',
            title: 'Trusted voice maps Los Angeles detention raid fallout and ICE crackdown',
            summary: 'Another independent creator surfaces the same detention operation.',
            desk_lane: 'voices',
            cluster_keys: { topic: 'la-detention-crackdown' },
            published_at: '2026-04-17T09:50:00.000Z',
            mission_tags: ['executive_power', 'civil_liberties'],
            sources: {
              slug: 'voice-debug-b',
              name: 'Voice Debug B',
              provenance_class: 'COMMENTARY',
              desk_lane: 'voices',
              source_family: 'claims_public',
            },
          }),
        ];
      }
      return defaultRowsForLane(lane);
    });

    const { getLiveIntelDeskDebug } = await import('@/lib/feeds/liveIntel.service');
    const debugDesk = await getLiveIntelDeskDebug('watchdogs');
    const debugItem = debugDesk.items.preCapCandidates.find((item: any) => item.id === 'watchdog-debug');

    expect(debugItem?.creatorCorroborationBoost).toBeGreaterThan(0);
    expect(debugItem?.creatorCorroboration?.applied).toBe(true);
    expect(debugItem?.creatorCorroboration?.reasons).toContain('trusted_creator_convergence');
    expect(
      debugItem?.shortExplanations?.display?.some(
        (entry: any) => entry?.ruleId === 'live_desk:creator_corroboration_bridge',
      ),
    ).toBe(true);
  });
});
