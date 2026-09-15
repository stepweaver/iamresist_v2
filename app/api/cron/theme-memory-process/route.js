/**
 * GET /api/cron/theme-memory-process
 * Builds persistent creator-led themes from Theme Memory observations + Intel adapters.
 * Does not change public ranking or homepage display.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 *
 * Not scheduled yet. Invoke manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "$ORIGIN/api/cron/theme-memory-process"
 * Optional: ?ingest=1 to persist observations first, ?refreshLabels=1 to force label refresh.
 */

import { NextResponse } from 'next/server';
import { runThemeMemoryProcess } from '@/lib/themeMemory/processRunner';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const ingestFirst = url.searchParams.get('ingest') === '1';
  const refreshLabels = url.searchParams.get('refreshLabels') === '1';

  let outcome;
  try {
    outcome = await runThemeMemoryProcess({ ingestFirst, refreshLabels });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[theme-memory-process] threw:', e);
    return NextResponse.json({ error: msg, overallStatus: 'failed' }, { status: 500 });
  }

  if (outcome.skipped === 'Supabase not configured') {
    return NextResponse.json(outcome, { status: 500 });
  }

  const status = outcome.overallStatus === 'failed' ? 500 : 200;
  return NextResponse.json(outcome, { status });
}

export async function POST(req) {
  return GET(req);
}
