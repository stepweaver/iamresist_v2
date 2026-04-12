/**
 * GET /api/cron/ingest-signal
 * Fetches configured intel sources, upserts intel.source_items, revalidates intel-live tag.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { env } from '@/lib/env';
import { runIntelIngest } from '@/lib/intel/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runIntelIngest();

  if (outcome.ok) {
    try {
      revalidateTag('intel-live');
    } catch (e) {
      console.warn('[ingest-signal] revalidateTag intel-live:', e);
    }
  }

  return NextResponse.json(outcome, {
    status: outcome.ok ? 200 : 500,
  });
}
