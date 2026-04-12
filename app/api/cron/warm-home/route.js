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
import { getLatestProtestMusicItem } from '@/lib/feeds/protestMusicFeed.service';
import { getCurrentBook } from '@/lib/bookclub/service';
import { getRecentJournalEntries } from '@/lib/journal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await Promise.allSettled([
    getHomepageVoicesFeed(),
    getHomepageIntelFeed(),
    getUnifiedArchivePage(1, 20, {}),
    getNewswireStories(),
    getLatestProtestMusicItem(),
    getCurrentBook(),
    getRecentJournalEntries(1),
  ]);

  return NextResponse.json({ ok: true });
}
