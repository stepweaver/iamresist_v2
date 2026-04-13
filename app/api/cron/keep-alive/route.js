/**
 * GET /api/cron/keep-alive
 * Vercel Cron: lightweight Supabase connectivity check only.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { ping } from '@/lib/db';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request) {
  const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ping();
  } catch (error) {
    console.error('Keep-alive ping failed:', error);
    return NextResponse.json({ error: 'Database ping failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
