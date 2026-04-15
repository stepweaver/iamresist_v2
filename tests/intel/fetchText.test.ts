import { describe, expect, it, vi } from 'vitest';
import { fetchTextNoStore } from '@/lib/intel/fetchText';

describe('fetchTextNoStore', () => {
  it('fails fast on redirect loops (tracking params stripped for loop check)', async () => {
    const fetchMock = vi.fn();
    // A -> B -> A with different tracking query should still trip loop detector.
    fetchMock
      .mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: { location: 'https://example.com/b?utm_source=x' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: { location: 'https://example.com/a?utm_medium=y' },
        }),
      );

    const oldFetch = globalThis.fetch;
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;
    try {
      await expect(fetchTextNoStore('https://example.com/a')).rejects.toThrow(/redirect loop/i);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it('includes redirect chain on redirect-loop errors', async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response('', {
          status: 301,
          headers: { location: 'https://example.com/b?utm_source=x' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('', {
          status: 301,
          headers: { location: 'https://example.com/a?utm_medium=y' },
        }),
      );

    const oldFetch = globalThis.fetch;
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;
    try {
      try {
        await fetchTextNoStore('https://example.com/a');
        throw new Error('Expected redirect loop');
      } catch (e) {
        const redirects =
          e && typeof e === 'object' && 'redirects' in e && Array.isArray((e as { redirects?: unknown }).redirects)
            ? (e as { redirects: unknown[] }).redirects
            : null;
        expect(Array.isArray(redirects)).toBe(true);
        expect((redirects || []).length).toBeGreaterThanOrEqual(1);
        expect(String(((redirects || [])[0] || {}).from || '')).toContain('example.com');
      }
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it('stops after maxRedirects', async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/b' } }))
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/c' } }))
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/d' } }));

    const oldFetch = globalThis.fetch;
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;
    try {
      await expect(fetchTextNoStore('https://example.com/a', { maxRedirects: 2 })).rejects.toThrow(
        /redirect count exceeded/i,
      );
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

