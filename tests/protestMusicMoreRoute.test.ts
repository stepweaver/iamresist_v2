import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const BILLY = 'UCQX_TeJhu67KX8LTLS6hztg';

async function loadRoute(payload: unknown) {
  vi.resetModules();
  const loadProtestArtistMore = vi.fn(async () => payload);
  vi.doMock('@/lib/protestMusic/loadArtistMore', () => ({ loadProtestArtistMore }));
  const { GET } = await import('@/app/api/voices-more/route');
  return { GET, loadProtestArtistMore };
}

describe('GET /api/voices-more protest music', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolves the artist on the server and ignores a client-supplied channel URL', async () => {
    const { GET, loadProtestArtistMore } = await loadRoute({
      recent: [{ id: 'recent-1', title: 'New upload', voice: { slug: 'billy-simons-jr' } }],
      featured: [{ id: 'song-2', title: 'Grandpa Ice', voice: { slug: 'billy-simons-jr' } }],
      feedFailed: false,
      channelId: BILLY,
    });
    const response = await GET(
      new Request(
        `https://example.test/api/voices-more?bucket=protest-music&artist=billy-simons-jr&url=https://evil.test/feed&channel_id=${BILLY}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(loadProtestArtistMore).toHaveBeenCalledTimes(1);
    expect(loadProtestArtistMore).toHaveBeenCalledWith('billy-simons-jr');
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=1800, stale-while-revalidate=1800');
    expect(body.recent).toHaveLength(1);
    expect(body.featured.map((item: { title: string }) => item.title)).toEqual(['Grandpa Ice']);
    expect(body.items).toEqual(body.featured);
  });

  it('does not cache a failed feed and still returns curated tracks', async () => {
    const { GET } = await loadRoute({
      recent: [],
      featured: [{ id: 'song-2', title: 'Grandpa Ice' }],
      feedFailed: true,
      channelId: BILLY,
    });
    const response = await GET(
      new Request('https://example.test/api/voices-more?bucket=protest-music&artist=billy-simons-jr'),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.recent).toEqual([]);
    expect(body.featured).toHaveLength(1);
  });

  it('rejects an invalid artist slug before any lookup', async () => {
    const { GET, loadProtestArtistMore } = await loadRoute({
      recent: [],
      featured: [],
      feedFailed: false,
      channelId: null,
    });
    const response = await GET(
      new Request('https://example.test/api/voices-more?bucket=protest-music&artist=../billy&channel_id=UCNOTOURS'),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recent: [], featured: [], items: [] });
    expect(loadProtestArtistMore).not.toHaveBeenCalled();
  });
});
