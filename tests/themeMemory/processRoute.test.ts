import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('GET /api/cron/theme-memory-process', () => {
  it('rejects unauthenticated requests', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ops/cronAuth', () => ({
      assertCronAuthorized: vi.fn(() => ({
        ok: false,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      })),
    }));
    const runThemeMemoryProcess = vi.fn();
    vi.doMock('@/lib/themeMemory/processRunner', () => ({ runThemeMemoryProcess }));

    const { GET } = await import('@/app/api/cron/theme-memory-process/route');
    const response = await GET(new Request('https://example.test/api/cron/theme-memory-process'));
    if (!response) throw new Error('Expected theme-memory-process route to return a response');
    expect(response.status).toBe(401);
    expect(runThemeMemoryProcess).not.toHaveBeenCalled();
  });

  it('runs processing when cron auth succeeds', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ops/cronAuth', () => ({
      assertCronAuthorized: vi.fn(() => ({ ok: true })),
    }));
    const runThemeMemoryProcess = vi.fn(async () => ({
      ok: true,
      overallStatus: 'success',
      finishedAt: '2026-09-15T16:00:00.000Z',
      window: { start: '2026-09-01T16:00:00.000Z', end: '2026-09-15T16:00:00.000Z' },
      diagnostics: { themesCreated: 1, themesByLifecycle: { new: 1 } },
    }));
    vi.doMock('@/lib/themeMemory/processRunner', () => ({ runThemeMemoryProcess }));

    const { GET } = await import('@/app/api/cron/theme-memory-process/route');
    const response = await GET(new Request('https://example.test/api/cron/theme-memory-process'));
    if (!response) throw new Error('Expected theme-memory-process route to return a response');
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.overallStatus).toBe('success');
    expect(runThemeMemoryProcess).toHaveBeenCalledTimes(1);
  });
});
