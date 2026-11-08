import { afterEach, describe, expect, it, vi } from 'vitest';

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const EXPIRED =
  'https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/essay.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=old';
const FRESH =
  'https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/essay.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=new';

const state = vi.hoisted(() => ({
  resolved: { entry: null, availability: 'missing' },
  cachedPage: null,
  freshPage: null,
  freshError: null,
}));

const noStore = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_noStore: (...args) => noStore(...args),
}));
vi.mock('@/lib/journal', () => ({
  resolvePublishedJournalEntry: async () => state.resolved,
  getCachedJournalPage: async () => state.cachedPage,
}));
vi.mock('@/lib/notion/journal.repo', () => ({
  getJournalPage: async () => {
    if (state.freshError) throw state.freshError;
    return state.freshPage;
  },
}));
vi.mock('@/lib/notion-blocks', () => ({
  getPageBlocks: async () => [],
  loadCachedPageBlocks: async () => [],
}));

function pageWith(url) {
  return {
    properties: {
      Image: {
        type: 'files',
        files: [{ type: 'file', name: 'Oversight chart.png', file: { url } }],
      },
    },
    cover: null,
  };
}

function imageResponse(bytes, { type = 'image/png', status = 200 } = {}) {
  return new Response(bytes, {
    status,
    headers: { 'Content-Type': type },
  });
}

const entry = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  slug: 'older-essay',
  title: 'Older Essay',
  propertyImage: null,
  coverImage: null,
};

afterEach(() => {
  state.resolved = { entry: null, availability: 'missing' };
  state.cachedPage = null;
  state.freshPage = null;
  state.freshError = null;
  noStore.mockClear();
  vi.unstubAllGlobals();
});

describe('journal image route', () => {
  it('refreshes an expired signed URL and serves the new file', async () => {
    state.resolved = { entry, availability: 'available' };
    state.cachedPage = pageWith(EXPIRED);
    state.freshPage = pageWith(FRESH);
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('Signature=old')) return imageResponse(PNG, { status: 403 });
      return imageResponse(PNG);
    });
    vi.stubGlobal('fetch', fetchImpl);

    const { GET } = await import('@/app/(site)/journal/[slug]/image/route');
    const response = await GET(new Request('https://www.iamresist.org/journal/older-essay/image'), {
      params: Promise.resolve({ slug: 'older-essay' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toContain('Signature=new');
    expect(String(fetchImpl.mock.calls[1][0])).not.toContain('Signature=old');
  });

  it('returns an uncached 503 when the refreshed file is still unavailable', async () => {
    state.resolved = { entry, availability: 'available' };
    state.cachedPage = pageWith(EXPIRED);
    state.freshPage = pageWith(FRESH);
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(PNG, { status: 403 })));

    const { GET } = await import('@/app/(site)/journal/[slug]/image/route');
    const response = await GET(new Request('https://www.iamresist.org/journal/older-essay/image'), {
      params: Promise.resolve({ slug: 'older-essay' }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-journal-image-result')).toBe('unavailable');
    expect(noStore).toHaveBeenCalled();
  });

  it('does not turn an unknown catalog into a missing image', async () => {
    state.resolved = { entry: null, availability: 'unavailable' };
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);

    const { GET } = await import('@/app/(site)/journal/[slug]/image/route');
    const response = await GET(new Request('https://www.iamresist.org/journal/older-essay/image'), {
      params: Promise.resolve({ slug: 'older-essay' }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps a confirmed missing essay as a 404', async () => {
    state.resolved = { entry: null, availability: 'missing' };
    const { GET } = await import('@/app/(site)/journal/[slug]/image/route');
    const response = await GET(new Request('https://www.iamresist.org/journal/missing-essay/image'), {
      params: Promise.resolve({ slug: 'missing-essay' }),
    });
    expect(response.status).toBe(404);
  });
});
