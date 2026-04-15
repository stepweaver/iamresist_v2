/**
 * GET /api/cron/ingest-signal
 * Fetches configured intel sources when due, upserts intel.source_items.
 * Revalidates intel caches only when ingest changed normalized content.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { runIntelIngest } from '@/lib/intel/ingest';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  let outcome;
  try {
    outcome = await runIntelIngest();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ingest-signal] runIntelIngest threw:', e);
    return NextResponse.json({ error: msg, overallStatus: 'failed' }, { status: 500 });
  }

  if (outcome.skipped === 'Supabase not configured') {
    return NextResponse.json(outcome, { status: 500 });
  }

  if (outcome.revalidateIntelCaches) {
    try {
      revalidateTag('intel-live');
      revalidateTag('intel-sources');
    } catch (e) {
      console.warn('[ingest-signal] revalidateTag:', e);
    }
  }

  return NextResponse.json(outcome, { status: 200 });
}
