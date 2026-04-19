import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getLiveIntelDeskDebug } = vi.hoisted(() => ({
  getLiveIntelDeskDebug: vi.fn(async (lane: string) => ({
    deskLane: lane,
    items: { visible: [], suppressed: [], duplicates: [], metadataOnly: [] },
  })),
}));

vi.mock('@/lib/feeds/liveIntel.service', () => ({
  getLiveIntelDeskDebug,
}));

describe('internal intel desk route', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.INTERNAL_INTEL_DESK_DEBUG;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag == null) delete process.env.INTERNAL_INTEL_DESK_DEBUG;
    else process.env.INTERNAL_INTEL_DESK_DEBUG = originalFlag;
  });

  it('returns 404 when not enabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INTERNAL_INTEL_DESK_DEBUG;

    const { GET } = await import('@/app/api/internal/intel-desk/route');
    const response = await GET(new Request('http://localhost/api/internal/intel-desk') as any);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    expect(getLiveIntelDeskDebug).not.toHaveBeenCalled();
  });

  it('uses osint as the safe default lane in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.INTERNAL_INTEL_DESK_DEBUG;

    const { GET } = await import('@/app/api/internal/intel-desk/route');
    const response = await GET(new Request('http://localhost/api/internal/intel-desk') as any);

    expect(response.status).toBe(200);
    expect(getLiveIntelDeskDebug).toHaveBeenCalledWith('osint');
    expect(await response.json()).toMatchObject({ deskLane: 'osint' });
  });

  it('allows explicit lane selection behind the env flag', async () => {
    process.env.NODE_ENV = 'production';
    process.env.INTERNAL_INTEL_DESK_DEBUG = '1';

    const { GET } = await import('@/app/api/internal/intel-desk/route');
    const response = await GET(
      new Request('http://localhost/api/internal/intel-desk?lane=watchdogs') as any,
    );

    expect(response.status).toBe(200);
    expect(getLiveIntelDeskDebug).toHaveBeenCalledWith('watchdogs');
    expect(await response.json()).toMatchObject({ deskLane: 'watchdogs' });
  });
});
