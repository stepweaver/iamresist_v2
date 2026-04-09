import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRateLimitClientKey,
  rateLimitedResponse,
  resetRateLimitForTests,
} from '@/lib/server/rateLimit';

describe('rateLimitedResponse', () => {
  beforeEach(() => {
    resetRateLimitForTests();
  });

  it('allows traffic under the cap', () => {
    const req = new Request('http://localhost/api/voices-feed', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(rateLimitedResponse('voices-feed', req)).toBeNull();
    expect(rateLimitedResponse('voices-feed', req)).toBeNull();
  });

  it('returns 429 after exceeding the cap', () => {
    const req = new Request('http://localhost/api/voices-feed', {
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    for (let i = 0; i < 120; i += 1) {
      const blocked = rateLimitedResponse('voices-feed', req);
      expect(blocked, `iteration ${i}`).toBeNull();
    }
    const blocked = rateLimitedResponse('voices-feed', req);
    expect(blocked?.status).toBe(429);
  });

  it('isolates clients by forwarded IP', () => {
    const a = new Request('http://localhost/api/voices-feed', {
      headers: { 'x-forwarded-for': '10.0.1.1' },
    });
    const b = new Request('http://localhost/api/voices-feed', {
      headers: { 'x-forwarded-for': '10.0.1.2' },
    });
    for (let i = 0; i < 120; i += 1) {
      expect(rateLimitedResponse('voices-feed', a)).toBeNull();
    }
    expect(rateLimitedResponse('voices-feed', a)?.status).toBe(429);
    expect(rateLimitedResponse('voices-feed', b)).toBeNull();
  });
});

describe('getRateLimitClientKey', () => {
  it('uses first x-forwarded-for hop', () => {
    const req = new Request('http://localhost/x', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    });
    expect(getRateLimitClientKey(req)).toBe('203.0.113.1');
  });
});
