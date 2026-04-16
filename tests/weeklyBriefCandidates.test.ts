import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('weekly brief candidate merge', () => {
  it('dedupes by canonical URL and keeps the stronger source-system candidate while preserving seenIn', async () => {
    const { buildWeeklyCandidateWindow, mergeWeeklyCandidates } = await import(
      '@/lib/feeds/weeklyBriefCandidates.service'
    );

    const window = buildWeeklyCandidateWindow({
      windowStart: '2026-04-08T00:00:00.000Z',
      windowEnd: '2026-04-15T00:00:00.000Z',
    });

    const out = mergeWeeklyCandidates(
      [
        {
          id: 'a',
          originId: 'a',
          sourceSystem: 'newswire',
          sourceScore: 72,
          compositeScore: 272,
          canonicalUrl: 'https://example.test/story?utm_source=x',
          url: 'https://example.test/story?utm_source=x',
          publishedAt: '2026-04-14T10:00:00.000Z',
          seenIn: ['newswire'],
          explain: {},
        },
        {
          id: 'b',
          originId: 'b',
          sourceSystem: 'homepage-briefing',
          sourceScore: 80,
          compositeScore: 480,
          canonicalUrl: 'https://example.test/story',
          url: 'https://example.test/story',
          publishedAt: '2026-04-14T10:00:00.000Z',
          seenIn: ['homepage-briefing'],
          explain: {},
        },
      ],
      window
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.sourceSystem).toBe('homepage-briefing');
    expect(out[0]?.seenIn).toEqual(expect.arrayContaining(['homepage-briefing', 'newswire']));
  });

  it('filters candidates outside the requested weekly window', async () => {
    const { buildWeeklyCandidateWindow, mergeWeeklyCandidates } = await import(
      '@/lib/feeds/weeklyBriefCandidates.service'
    );

    const window = buildWeeklyCandidateWindow({
      windowStart: '2026-04-08T00:00:00.000Z',
      windowEnd: '2026-04-15T00:00:00.000Z',
    });

    const out = mergeWeeklyCandidates(
      [
        {
          id: 'inside',
          originId: 'inside',
          sourceSystem: 'live-intel-desk',
          sourceScore: 60,
          compositeScore: 360,
          canonicalUrl: 'https://example.test/in',
          url: 'https://example.test/in',
          publishedAt: '2026-04-10T12:00:00.000Z',
          seenIn: ['live-intel-desk'],
          explain: {},
        },
        {
          id: 'outside',
          originId: 'outside',
          sourceSystem: 'live-intel-desk',
          sourceScore: 99,
          compositeScore: 399,
          canonicalUrl: 'https://example.test/out',
          url: 'https://example.test/out',
          publishedAt: '2026-03-10T12:00:00.000Z',
          seenIn: ['live-intel-desk'],
          explain: {},
        },
      ],
      window
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('inside');
  });
});

describe('weekly brief candidate service', () => {
  it('builds an inspectable deterministic pool from existing ranked sources', async () => {
    vi.resetModules();

    vi.doMock('@/lib/feeds/homepageBriefing.service', async () => {
      const actual = await vi.importActual<typeof import('@/lib/feeds/homepageBriefing.service')>(
        '@/lib/feeds/homepageBriefing.service'
      );
      return {
        ...actual,
        getHomeLiveBriefingWithExplain: vi.fn(async () => ({
          items: [
            {
              kind: 'intel',
              briefLane: 'osint',
              homepageBriefingScore: 92,
              intelItem: {
                id: 'intel-1',
                title: 'Court blocks policy',
                summary: 'Summary',
                canonicalUrl: 'https://example.test/court',
                publishedAt: '2026-04-14T08:00:00.000Z',
                imageUrl: null,
                sourceName: 'SCOTUSblog',
                sourceSlug: 'scotusblog',
                sourceFamily: 'general',
                deskLane: 'osint',
                provenanceClass: 'SPECIALIST',
              },
              briefingExplain: {
                origin: 'promoted',
                selectionPhase: 'primary',
                weightedLaneScore: 92,
                homepageBriefingScore: 92,
              },
            },
          ],
          explain: {},
        })),
      };
    });

    vi.doMock('@/lib/feeds/liveIntel.service', () => ({
      getLiveIntelDesk: vi.fn(async (lane: string) => ({
        configured: true,
        items:
          lane === 'watchdogs'
            ? [
                {
                  id: 'watch-1',
                  title: 'FOIA suit filed',
                  summary: 'Suit summary',
                  canonicalUrl: 'https://example.test/foia',
                  publishedAt: '2026-04-13T14:00:00.000Z',
                  imageUrl: null,
                  sourceName: 'American Oversight',
                  sourceSlug: 'american-oversight',
                  sourceFamily: 'watchdog_global',
                  deskLane: 'watchdogs',
                  provenanceClass: 'PRIMARY',
                  displayPriority: 63,
                },
              ]
            : [],
      })),
    }));

    vi.doMock('@/lib/newswire', async () => {
      const actual = await vi.importActual<typeof import('@/lib/newswire')>('@/lib/newswire');
      return {
        ...actual,
        getNewswireStories: vi.fn(async () => [
          {
            id: 'nw-1',
            title: 'Independent newsroom scoop',
            url: 'https://example.test/newswire',
            publishedAt: '2026-04-12T16:00:00.000Z',
            excerpt: 'Newswire summary',
            image: null,
            source: 'Example News',
            sourceSlug: 'example-news',
            isCurated: false,
          },
        ]),
      };
    });

    vi.doMock('@/lib/feeds/homepageIntel.service', () => ({
      getHomepageIntelFeed: vi.fn(async () => [
        {
          id: 'voice-1',
          title: 'Commentary episode',
          url: 'https://example.test/commentary',
          publishedAt: '2026-04-11T12:00:00.000Z',
          description: 'Commentary summary',
          sourceType: 'voices',
          homepageMissionScore: 7,
          voice: { title: 'Creator One', slug: 'creator-one' },
        },
      ]),
    }));

    const { getWeeklyBriefCandidates } = await import('@/lib/feeds/weeklyBriefCandidates.service');
    const payload = await getWeeklyBriefCandidates({
      windowStart: '2026-04-08T00:00:00.000Z',
      windowEnd: '2026-04-15T00:00:00.000Z',
      now: '2026-04-15T00:00:00.000Z',
    });

    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items[0]?.sourceSystem).toBe('homepage-briefing');
    expect(payload.explain.pool.homepageBriefing).toBe(1);
    expect(payload.explain.pool.liveIntelDesk.watchdogs).toBe(1);
    expect(payload.explain.pool.newswire).toBe(1);
    expect(payload.explain.pool.homepageIntelFeed).toBe(1);
    expect(payload.items[0]?.explain?.scoringModel).toBeTruthy();
  });
});
