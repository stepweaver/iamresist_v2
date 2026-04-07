/**
 * GET /api/cron/keep-alive
 * Vercel Cron: ping Supabase + warm homepage / intel / archive caches.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { ping } from '@/lib/db';
import { env } from '@/lib/env';
import { getHomepageVoicesFeed } from '@/lib/voices';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getUnifiedArchivePage } from '@/lib/feeds/unifiedArchive.service';
import { getNewswireStories } from '@/lib/newswire';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const secret = env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ping();
  } catch (error) {
    console.error('Keep-alive ping failed:', error);
    return NextResponse.json({ error: 'Database ping failed' }, { status: 500 });
  }

  await Promise.allSettled([
    getHomepageVoicesFeed(),
    getHomepageIntelFeed(),
    getUnifiedArchivePage(1, 20, {}),
    getNewswireStories(),
  ]);

  return NextResponse.json({ ok: true });
}
