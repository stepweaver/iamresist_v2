import { describe, it, expect } from 'vitest';

/**
 * Optional integration smoke: set SMOKE_BASE_URL to a running origin (local or preview).
 * Skipped by default so `npm test` does not require network or a dev server.
 *
 * Example:
 *   SMOKE_BASE_URL=http://127.0.0.1:3000 npm run test -- tests/smokeRoutes.test.js
 */
const base = (process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');

describe.skipIf(!base)('public route smoke (SMOKE_BASE_URL)', () => {
  it('main pages and read APIs return < 500', async () => {
    const paths = [
      '/',
      '/voices',
      '/shop',
      '/api/voices-feed',
      '/api/voices-archive?page=1&limit=1',
      '/api/voices-more?bucket=curated',
    ];
    for (const path of paths) {
      const res = await fetch(`${base}${path}`, { redirect: 'follow' });
      expect(res.status, path).toBeLessThan(500);
    }
  });
});
