import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertThemeObservations = vi.fn(async (items: unknown[]) => items.length);
const getThemeMemoryDiagnostics = vi.fn(async () => ({
  observations: { total: 0, oldestObservedAt: null, newestObservedAt: null, bySourceSystem: {}, bySource: [] },
  windows: {},
  generatedAt: '2026-09-15T16:00:00.000Z',
}));
const intelDbConfigured = vi.fn(() => true);

const getAllVoices = vi.fn();
const fetchFeedItemsWithMeta = vi.fn();
const getNewswireStoriesUncached = vi.fn();

vi.mock('@/lib/themeMemory/db', () => ({
  upsertThemeObservations,
}));

vi.mock('@/lib/themeMemory/diagnostics', () => ({
  getThemeMemoryDiagnostics,
}));

vi.mock('@/lib/intel/db', () => ({
  intelDbConfigured,
}));

vi.mock('@/lib/notion/voices.repo', () => ({
  getAllVoices,
}));

vi.mock('@/lib/feeds/rss', () => ({
  fetchFeedItemsWithMeta,
}));

vi.mock('@/lib/newswire', async () => {
  const actual = await vi.importActual<typeof import('@/lib/newswire')>('@/lib/newswire');
  return {
    ...actual,
    getNewswireStoriesUncached,
  };
});

function voice(slug: string, title: string) {
  return {
    id: `voice-${slug}`,
    slug,
    title,
    feedUrl: `https://${slug}.test/feed`,
    homeUrl: `https://${slug}.test`,
    platform: 'YouTube',
    enabled: true,
  };
}

function feedItem(id: string, title: string, url: string, publishedAt: string) {
  return {
    id,
    sourceId: id,
    title,
    url,
    publishedAt,
    description: title,
  };
}

describe('Theme Memory ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intelDbConfigured.mockReturnValue(true);
    upsertThemeObservations.mockImplementation(async (items: unknown[]) => items.length);
    getAllVoices.mockResolvedValue([
      voice('david-pakman', 'David Pakman'),
      voice('meidastouch', 'MeidasTouch'),
    ]);
    fetchFeedItemsWithMeta.mockImplementation(async (feedUrl: string) => {
      if (String(feedUrl).includes('david-pakman')) {
        return {
          ok: true,
          reason: null,
          items: [
            feedItem('pakman-1', 'Pakman Monday', 'https://youtube.com/watch?v=pakman11111', '2026-09-14T12:00:00.000Z'),
            feedItem('pakman-2', 'Pakman Tuesday', 'https://youtube.com/watch?v=pakman22222', '2026-09-13T12:00:00.000Z'),
            feedItem('pakman-3', 'Pakman Wednesday', 'https://youtube.com/watch?v=pakman33333', '2026-09-12T12:00:00.000Z'),
            feedItem('pakman-4', 'Pakman Thursday', 'https://youtube.com/watch?v=pakman44444', '2026-09-11T12:00:00.000Z'),
          ],
        };
      }
      if (String(feedUrl).includes('meidastouch')) {
        return {
          ok: true,
          reason: null,
          items: [
            feedItem('meidas-1', 'Meidas one', 'https://youtube.com/watch?v=meidas11111', '2026-09-14T11:00:00.000Z'),
            feedItem('meidas-2', 'Meidas two', 'https://youtube.com/watch?v=meidas22222', '2026-09-13T11:00:00.000Z'),
            feedItem('meidas-3', 'Meidas three', 'https://youtube.com/watch?v=meidas33333', '2026-09-12T11:00:00.000Z'),
            feedItem('meidas-4', 'Meidas four', 'https://youtube.com/watch?v=meidas44444', '2026-09-11T11:00:00.000Z'),
            feedItem('meidas-5', 'Meidas five', 'https://youtube.com/watch?v=meidas55555', '2026-09-10T11:00:00.000Z'),
          ],
        };
      }
      return { ok: false, reason: 'missing', items: [] };
    });
    getNewswireStoriesUncached.mockResolvedValue([
      {
        id: 'nw-1',
        source: 'The Intercept',
        sourceSlug: 'the-intercept',
        title: 'Surveillance bill',
        url: 'https://theintercept.test/story',
        publishedAt: '2026-09-14T10:00:00.000Z',
        excerpt: 'A surveillance bill advances.',
        isCurated: false,
      },
      {
        id: 'nw-1-tracked',
        source: 'The Intercept',
        sourceSlug: 'the-intercept',
        title: 'Surveillance bill',
        url: 'https://theintercept.test/story?utm_source=rss',
        publishedAt: '2026-09-14T10:00:00.000Z',
        excerpt: 'A surveillance bill advances.',
        isCurated: false,
      },
      {
        id: 'nw-2',
        source: '404 Media',
        sourceSlug: '404-media',
        title: 'A different story',
        url: 'https://404media.test/other',
        publishedAt: '2026-09-14T09:00:00.000Z',
        excerpt: 'Other reporting.',
        isCurated: false,
      },
    ]);
  });

  it('persists multiple items per creator and is not limited to homepage one-item-per-creator', async () => {
    const { collectVoiceThemeCandidates } = await import('@/lib/themeMemory/collect');
    const collected = await collectVoiceThemeCandidates({ now: '2026-09-15T16:00:00.000Z' });

    const pakman = collected.candidates.filter((item) => item.sourceSlug === 'david-pakman');
    const meidas = collected.candidates.filter((item) => item.sourceSlug === 'meidastouch');

    expect(pakman).toHaveLength(4);
    expect(meidas).toHaveLength(5);
    expect(collected.candidates).toHaveLength(9);
    expect(collected.candidates.every((item) => item.role === 'creator')).toBe(true);
    expect(pakman.every((item) => item.canonicalUrl.includes('youtube.com'))).toBe(true);
  });

  it('keeps different creators covering related material as separate observations', async () => {
    fetchFeedItemsWithMeta.mockImplementation(async (feedUrl: string) => ({
      ok: true,
      reason: null,
      items: [
        feedItem(
          `${feedUrl}-ep`,
          'The surveillance fight',
          feedUrl.includes('pakman')
            ? 'https://youtube.com/watch?v=pakmanrel01'
            : 'https://youtube.com/watch?v=meidasrel01',
          '2026-09-14T12:00:00.000Z',
        ),
      ],
    }));

    const { collectVoiceThemeCandidates } = await import('@/lib/themeMemory/collect');
    const collected = await collectVoiceThemeCandidates();
    expect(collected.candidates).toHaveLength(2);
    expect(new Set(collected.candidates.map((item) => item.sourceSlug))).toEqual(
      new Set(['david-pakman', 'meidastouch']),
    );
  });

  it('re-ingesting the same creator and Newswire items is idempotent', async () => {
    const { ingestThemeMemorySources } = await import('@/lib/themeMemory/ingest');

    const first = await ingestThemeMemorySources({ includeDiagnostics: false, now: '2026-09-15T16:00:00.000Z' });
    const second = await ingestThemeMemorySources({ includeDiagnostics: false, now: '2026-09-15T16:00:00.000Z' });

    const voiceKeys = (callIndex: number) => {
      const items = upsertThemeObservations.mock.calls[callIndex]?.[0] as Array<{
        sourceSystem: string;
        sourceSlug: string;
        identityKey: string;
      }>;
      return items
        .filter((item) => item.sourceSystem === 'voice')
        .map((item) => `${item.sourceSlug}:${item.identityKey}`)
        .sort();
    };
    const newsKeys = (callIndex: number) => {
      const items = upsertThemeObservations.mock.calls[callIndex]?.[0] as Array<{
        sourceSystem: string;
        identityKey: string;
      }>;
      return items
        .filter((item) => item.sourceSystem === 'newswire')
        .map((item) => item.identityKey)
        .sort();
    };

    expect(first.voices.observationsTouched).toBe(9);
    expect(second.voices.observationsTouched).toBe(9);
    expect(voiceKeys(0)).toEqual(voiceKeys(2));
    expect(first.newswire.observationsTouched).toBe(2);
    expect(second.newswire.observationsTouched).toBe(2);
    expect(newsKeys(1)).toEqual(newsKeys(3));
    expect(new Set(newsKeys(1)).size).toBe(2);
  });

  it('does not discard other creator feeds when one feed fails', async () => {
    fetchFeedItemsWithMeta.mockImplementation(async (feedUrl: string) => {
      if (String(feedUrl).includes('meidastouch')) {
        return { ok: false, reason: 'http_500', items: [] };
      }
      return {
        ok: true,
        reason: null,
        items: [
          feedItem('pakman-1', 'Pakman Monday', 'https://youtube.com/watch?v=pakman11111', '2026-09-14T12:00:00.000Z'),
        ],
      };
    });

    const { ingestThemeMemorySources } = await import('@/lib/themeMemory/ingest');
    const out = await ingestThemeMemorySources({ includeDiagnostics: false });

    expect(out.ok).toBe(true);
    expect(out.voices.sourcesAttempted).toBe(2);
    expect(out.voices.sourcesSucceeded).toBe(1);
    expect(out.voices.sourcesFailed).toBe(1);
    expect(out.voices.observationsTouched).toBe(1);
    expect(out.voices.failures?.[0]?.slug).toBe('meidastouch');
  });

  it('requests more than the homepage per-voice display cap from RSS', async () => {
    const { collectVoiceThemeCandidates } = await import('@/lib/themeMemory/collect');
    await collectVoiceThemeCandidates({ perVoiceLimit: 25 });

    expect(fetchFeedItemsWithMeta).toHaveBeenCalled();
    for (const [, args] of fetchFeedItemsWithMeta.mock.calls.entries()) {
      expect(args[1].limit).toBe(25);
    }
  });
});
