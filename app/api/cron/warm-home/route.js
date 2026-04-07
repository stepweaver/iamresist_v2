/**
 * GET /api/cron/warm-home
 * Vercel Cron: prime homepage, voices, intel, archive, and newswire caches.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getHomepageVoicesFeed } from '@/lib/voices';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getUnifiedArchivePage } from '@/lib/feeds/unifiedArchive.service';
import { getNewswireStories } from '@/lib/newswire';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await Promise.allSettled([
    getHomepageVoicesFeed(),
    getHomepageIntelFeed(),
    getUnifiedArchivePage(1, 20, {}),
    getNewswireStories(),
  ]);

  return NextResponse.json({ ok: true });
}
