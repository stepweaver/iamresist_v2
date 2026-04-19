import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('GET /api/cron/warm-home', () => {
  it('warms only the homepage payload cache', async () => {
    vi.resetModules();

    const getHomepagePayload = vi.fn(async () => ({ ok: true }));
    const getHomepageVoicesFeed = vi.fn(async () => []);
    const getUnifiedArchivePage = vi.fn(async () => ({ items: [] }));
    const getNewswireStories = vi.fn(async () => []);
    const getCurrentBook = vi.fn(async () => null);
    const getRecentJournalEntries = vi.fn(async () => []);

    vi.doMock('@/lib/feeds/homepagePayload.service', () => ({
      getHomepagePayload,
    }));
    vi.doMock('@/lib/ops/cronAuth', () => ({
      assertCronAuthorized: vi.fn(() => ({ ok: true })),
    }));
    vi.doMock('@/lib/voices', () => ({
      getHomepageVoicesFeed,
    }));
    vi.doMock('@/lib/feeds/unifiedArchive.service', () => ({
      getUnifiedArchivePage,
    }));
    vi.doMock('@/lib/newswire', () => ({
      getNewswireStories,
    }));
    vi.doMock('@/lib/bookclub/service', () => ({
      getCurrentBook,
    }));
    vi.doMock('@/lib/journal', () => ({
      getRecentJournalEntries,
    }));

    const { GET } = await import('@/app/api/cron/warm-home/route');
    const response = /** @type {Response} */ (await GET(new Request('https://example.test/api/cron/warm-home')));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      warmedTargets: ['homepagePayload'],
    });
    expect(getHomepagePayload).toHaveBeenCalledTimes(1);
    expect(getHomepageVoicesFeed).not.toHaveBeenCalled();
    expect(getUnifiedArchivePage).not.toHaveBeenCalled();
    expect(getNewswireStories).not.toHaveBeenCalled();
    expect(getCurrentBook).not.toHaveBeenCalled();
    expect(getRecentJournalEntries).not.toHaveBeenCalled();
  });
});
