/**
 * GET /api/cron/intel-rescore
 * Recomputes relevance_* fields on intel.source_items (bounded batch). Secured by CRON_SECRET.
 * Query: maxRows (default 200, max 2000), cursor (uuid — start after this id).
 */

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { intelDbConfigured } from '@/lib/intel/db';
import { INTEL_RELEVANCE_RULE_VERSION } from '@/lib/intel/relevanceVersion';
import { rescoreIntelSourceItems } from '@/lib/intel/rescoreSourceItems';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  if (!intelDbConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const maxRowsRaw = url.searchParams.get('maxRows');
  const maxRows = maxRowsRaw ? parseInt(maxRowsRaw, 10) : 200;
  const cursor = url.searchParams.get('cursor') || null;

  try {
    const result = await rescoreIntelSourceItems({
      maxRows: Number.isFinite(maxRows) ? maxRows : 200,
      startAfterId: cursor,
    });

    try {
      revalidateTag('intel-live');
      revalidateTag('intel-sources');
    } catch (e) {
      console.warn('[intel-rescore] revalidateTag:', e);
    }

    return NextResponse.json({
      ok: true,
      ruleVersion: INTEL_RELEVANCE_RULE_VERSION,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[intel-rescore]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
