import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

async function loadRoute(mocks: {
  authorized?: boolean;
  intel?: () => Promise<unknown>;
  briefing?: () => Promise<unknown>;
  music?: () => Promise<unknown>;
}) {
  vi.resetModules();

  const getHomepageIntelFeed = vi.fn(mocks.intel ?? (async () => []));
  const getHomeLiveBriefing = vi.fn(mocks.briefing ?? (async () => ({ items: [] })));
  const getRecentProtestMusicItems = vi.fn(mocks.music ?? (async () => []));

  vi.doMock('@/lib/feeds/homepageIntel.service', () => ({ getHomepageIntelFeed }));
  vi.doMock('@/lib/feeds/homepageBriefing.service', () => ({ getHomeLiveBriefing }));
  vi.doMock('@/lib/feeds/protestMusicFeed.service', () => ({ getRecentProtestMusicItems }));
  vi.doMock('@/lib/ops/cronAuth', () => ({
    assertCronAuthorized: vi.fn(() =>
      mocks.authorized === false
        ? { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
        : { ok: true },
    ),
  }));

  const { GET } = await import('@/app/api/cron/warm-home/route');
  return { GET, getHomepageIntelFeed, getHomeLiveBriefing, getRecentProtestMusicItems };
}

describe('GET /api/cron/warm-home', () => {
  it('warms each homepage section cache once', async () => {
    const { GET, getHomepageIntelFeed, getHomeLiveBriefing, getRecentProtestMusicItems } = await loadRoute({});
    const response = await GET(new Request('https://example.test/api/cron/warm-home'));
    if (!response) throw new Error('Expected warm-home route to return a response');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      warmedTargets: ['homepage-intel', 'live-briefing', 'protest-music'],
      failedTargets: [],
    });
    expect(getHomepageIntelFeed).toHaveBeenCalledTimes(1);
    expect(getHomeLiveBriefing).toHaveBeenCalledTimes(1);
    expect(getRecentProtestMusicItems).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when a required warm fails and reports the other successes', async () => {
    const { GET, getHomepageIntelFeed, getRecentProtestMusicItems } = await loadRoute({
      briefing: async () => {
        throw new Error('briefing down');
      },
    });
    const response = await GET(new Request('https://example.test/api/cron/warm-home'));
    if (!response) throw new Error('Expected warm-home route to return a response');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.warmedTargets).toEqual(['homepage-intel', 'protest-music']);
    expect(body.failedTargets).toEqual([{ target: 'live-briefing', error: 'briefing down' }]);
    expect(getHomepageIntelFeed).toHaveBeenCalledTimes(1);
    expect(getRecentProtestMusicItems).toHaveBeenCalledTimes(1);
  });

  it('does not warm when cron auth fails', async () => {
    const { GET, getHomepageIntelFeed, getHomeLiveBriefing, getRecentProtestMusicItems } = await loadRoute({
      authorized: false,
    });
    const response = await GET(new Request('https://example.test/api/cron/warm-home'));
    if (!response) throw new Error('Expected warm-home route to return a response');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(getHomepageIntelFeed).not.toHaveBeenCalled();
    expect(getHomeLiveBriefing).not.toHaveBeenCalled();
    expect(getRecentProtestMusicItems).not.toHaveBeenCalled();
  });
});
