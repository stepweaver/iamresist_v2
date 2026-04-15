/**
 * GET /api/cron/warm-home
 * Vercel Cron: prime homepage, voices, intel, archive, and newswire caches.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { getHomepageVoicesFeed } from '@/lib/voices';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getUnifiedArchivePage } from '@/lib/feeds/unifiedArchive.service';
import { getNewswireStories } from '@/lib/newswire';
import { getLatestProtestMusicItem } from '@/lib/feeds/protestMusicFeed.service';
import { getCurrentBook } from '@/lib/bookclub/service';
import { getRecentJournalEntries } from '@/lib/journal';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

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
