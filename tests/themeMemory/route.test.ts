import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('GET /api/cron/theme-memory-ingest', () => {
  it('rejects unauthenticated requests', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ops/cronAuth', () => ({
      assertCronAuthorized: vi.fn(() => ({
        ok: false,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      })),
    }));
    const ingestThemeMemorySources = vi.fn();
    vi.doMock('@/lib/themeMemory/ingest', () => ({ ingestThemeMemorySources }));

    const { GET } = await import('@/app/api/cron/theme-memory-ingest/route');
    const response = await GET(new Request('https://example.test/api/cron/theme-memory-ingest'));
    if (!response) throw new Error('Expected theme-memory-ingest route to return a response');
    expect(response.status).toBe(401);
    expect(ingestThemeMemorySources).not.toHaveBeenCalled();
  });

  it('runs ingest when cron auth succeeds', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ops/cronAuth', () => ({
      assertCronAuthorized: vi.fn(() => ({ ok: true })),
    }));
    const ingestThemeMemorySources = vi.fn(async () => ({
      ok: true,
      overallStatus: 'success',
      finishedAt: '2026-09-15T16:00:00.000Z',
      voices: { sourcesAttempted: 2, sourcesSucceeded: 2, itemsSeen: 9, observationsTouched: 9 },
      newswire: { sourcesRepresented: 2, itemsSeen: 3, observationsTouched: 2 },
      perVoiceLimit: 25,
    }));
    vi.doMock('@/lib/themeMemory/ingest', () => ({ ingestThemeMemorySources }));

    const { GET } = await import('@/app/api/cron/theme-memory-ingest/route');
    const response = await GET(new Request('https://example.test/api/cron/theme-memory-ingest'));
    if (!response) throw new Error('Expected theme-memory-ingest route to return a response');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.overallStatus).toBe('success');
    expect(ingestThemeMemorySources).toHaveBeenCalledTimes(1);
  });
});
