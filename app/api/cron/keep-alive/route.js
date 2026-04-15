/**
 * GET /api/cron/keep-alive
 * Vercel Cron: lightweight Supabase connectivity check only.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { ping } from '@/lib/db';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request) {
  const gate = assertCronAuthorized(request);
  if (!gate.ok) return gate.response;

  try {
    await ping();
  } catch (error) {
    console.error('Keep-alive ping failed:', error);
    return NextResponse.json({ error: 'Database ping failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
