import { describe, expect, it, vi } from 'vitest';
import {
  createJournalImageResponse,
  planJournalImageDelivery,
  proxyNotionEditorialFile,
} from '@/lib/journal/journalImageResponse';

const NOTION_FILE =
  'https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/essay.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc';

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

function imageResponse(bytes, { type = 'image/png', status = 200, contentLength } = {}) {
  return new Response(bytes, {
    status,
    headers: {
      'Content-Type': type,
      ...(contentLength ? { 'Content-Length': String(contentLength) } : {}),
    },
  });
}

describe('journal image endpoint', () => {
  it('proxies only an allowlisted Notion file and ignores every other target', async () => {
    const fetchImpl = vi.fn(async () => imageResponse(PNG));
    const response = await createJournalImageResponse({
      editorial: {
        hosting: 'notion-file',
        url: NOTION_FILE,
        alt: 'Essay image',
      },
      requestUrl: 'https://www.iamresist.org/journal/essay/image?url=https://evil.example/steal.png',
      fetchImpl,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(NOTION_FILE);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(fetchImpl.mock.calls[0][0]).not.toContain('evil.example');
  });

  it('does not fetch external, private, or non-image URLs', async () => {
    const fetchImpl = vi.fn();
    const cases = [
      { hosting: 'external', url: 'https://cdn.example/essay.jpg' },
      { hosting: 'notion-file', url: 'https://evil.example/image.png' },
      { hosting: 'notion-file', url: 'http://169.254.169.254/latest/meta-data' },
      { hosting: 'notion-file', url: 'https://user:pass@prod-files-secure.s3.us-west-2.amazonaws.com/a.png' },
      null,
    ];

    for (const editorial of cases) {
      const response = await createJournalImageResponse({
        editorial,
        requestUrl: 'https://www.iamresist.org/journal/essay/image',
        fetchImpl,
      });
      expect(response.status).toBe(404);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(planJournalImageDelivery({ hosting: 'external', url: 'https://cdn.example/essay.jpg' })).toEqual({
      action: 'none',
    });
  });

  it('redirects a same-origin editorial file without fetching it', async () => {
    const fetchImpl = vi.fn();
    const response = await createJournalImageResponse({
      editorial: {
        hosting: 'site',
        url: '/editorial/trump-putin-leash.webp',
      },
      requestUrl: 'https://www.iamresist.org/journal/essay/image',
      fetchImpl,
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://www.iamresist.org/editorial/trump-putin-leash.webp',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects expired responses, non-images, and oversized payloads', async () => {
    const expired = await proxyNotionEditorialFile(NOTION_FILE, async () => imageResponse(PNG, { status: 403 }));
    expect(expired).toBeNull();

    const html = await proxyNotionEditorialFile(
      NOTION_FILE,
      async () => imageResponse(new TextEncoder().encode('<html></html>'), { type: 'text/html' }),
    );
    expect(html).toBeNull();

    const svg = await proxyNotionEditorialFile(
      NOTION_FILE,
      async () => imageResponse(PNG, { type: 'image/svg+xml' }),
    );
    expect(svg).toBeNull();

    const scripted = await proxyNotionEditorialFile(
      NOTION_FILE,
      async () =>
        imageResponse(
          new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
          { type: 'image/svg+xml' },
        ),
    );
    expect(scripted).toBeNull();

    const remote = await proxyNotionEditorialFile(
      NOTION_FILE,
      async () =>
        imageResponse(
          new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'),
          { type: 'image/svg+xml' },
        ),
    );
    expect(remote).toBeNull();

    const mismatch = await proxyNotionEditorialFile(
      NOTION_FILE,
      async () => imageResponse(new TextEncoder().encode('not-an-image!!'), { type: 'image/png' }),
    );
    expect(mismatch).toBeNull();

    const oversized = await proxyNotionEditorialFile(
      NOTION_FILE,
      async () => imageResponse(PNG, { contentLength: 9 * 1024 * 1024 }),
    );
    expect(oversized).toBeNull();
  });

  it('serves a script-free Notion SVG with a locked content policy', async () => {
    const chart = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1820"><rect width="10" height="10" fill="url(#bg)"/></svg>',
    );
    const response = await createJournalImageResponse({
      editorial: { hosting: 'notion-file', url: NOTION_FILE },
      requestUrl: 'https://www.iamresist.org/journal/essay/image',
      fetchImpl: async () => imageResponse(chart, { type: 'image/svg+xml' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await response.text()).toContain('<svg');
  });
});
