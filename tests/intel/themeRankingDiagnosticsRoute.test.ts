import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildThemeRankingDiagnostics } = vi.hoisted(() => ({
  buildThemeRankingDiagnostics: vi.fn(async (opts: { lane?: string }) => ({
    currentMode: 'off',
    deskLane: opts.lane || 'osint',
    summary: { itemCount: 0 },
  })),
}));

vi.mock('@/lib/intel/themeRankingDiagnostics', () => ({
  buildThemeRankingDiagnostics,
}));

describe('internal theme ranking diagnostics route', () => {
  const originalDesk = process.env.INTERNAL_INTEL_DESK_DEBUG;
  const originalTheme = process.env.INTERNAL_THEME_RANKING_DEBUG;

  beforeEach(() => {
    vi.clearAllMocks();
    if (originalDesk == null) delete process.env.INTERNAL_INTEL_DESK_DEBUG;
    else process.env.INTERNAL_INTEL_DESK_DEBUG = originalDesk;
    if (originalTheme == null) delete process.env.INTERNAL_THEME_RANKING_DEBUG;
    else process.env.INTERNAL_THEME_RANKING_DEBUG = originalTheme;
  });

  it('returns 404 when not enabled', async () => {
    delete process.env.INTERNAL_INTEL_DESK_DEBUG;
    delete process.env.INTERNAL_THEME_RANKING_DEBUG;
    const { GET } = await import('@/app/api/internal/theme-ranking-diagnostics/route');
    const response = await GET(new Request('http://localhost/api/internal/theme-ranking-diagnostics') as never);
    expect(response.status).toBe(404);
    expect(buildThemeRankingDiagnostics).not.toHaveBeenCalled();
  });

  it('serves diagnostics when the debug flag is set', async () => {
    process.env.INTERNAL_THEME_RANKING_DEBUG = '1';
    const { GET } = await import('@/app/api/internal/theme-ranking-diagnostics/route');
    const response = await GET(
      new Request('http://localhost/api/internal/theme-ranking-diagnostics?lane=watchdogs') as never,
    );
    expect(response.status).toBe(200);
    expect(buildThemeRankingDiagnostics).toHaveBeenCalledWith({ lane: 'watchdogs', limit: 40 });
  });
});
