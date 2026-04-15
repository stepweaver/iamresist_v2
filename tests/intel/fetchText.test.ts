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

