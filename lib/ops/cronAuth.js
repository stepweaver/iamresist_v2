import 'server-only';

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

function readSecret() {
  const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  return secret || '';
}

/**
 * Vercel Cron cannot attach Authorization headers.
 * We support either:
 * - `Authorization: Bearer <CRON_SECRET>`
 * - `?cron_secret=<CRON_SECRET>` (use with care; URLs may be logged by intermediaries)
 */
export function assertCronAuthorized(req) {
  const secret = readSecret();
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 }),
    };
  }

  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return { ok: true };

  try {
    const url = new URL(req.url);
    const qs = (url.searchParams.get('cron_secret') || '').trim();
    if (qs && qs === secret) return { ok: true };
  } catch {
    // ignore
  }

  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  };
}

