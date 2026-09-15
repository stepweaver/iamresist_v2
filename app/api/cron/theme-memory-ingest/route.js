/**
 * GET /api/cron/theme-memory-ingest
 * Persists favorite Voices + Newswire feed items into intel.theme_observations.
 * Does not change public ranking or homepage display.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 *
 * Not scheduled yet. Invoke manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" "$ORIGIN/api/cron/theme-memory-ingest"
 */

import { NextResponse } from 'next/server';
import { ingestThemeMemorySources } from '@/lib/themeMemory/ingest';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  let outcome;
  try {
    outcome = await ingestThemeMemorySources({ includeDiagnostics: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[theme-memory-ingest] threw:', e);
    return NextResponse.json({ error: msg, overallStatus: 'failed' }, { status: 500 });
  }

  if (outcome.skipped === 'Supabase not configured') {
    return NextResponse.json(outcome, { status: 500 });
  }

  const status = outcome.overallStatus === 'failed' ? 500 : 200;
  return NextResponse.json(outcome, { status });
}
