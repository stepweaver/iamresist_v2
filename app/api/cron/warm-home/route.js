/**
 * GET /api/cron/warm-home
 * Vercel Cron: prime homepage, voices, intel, archive, and newswire caches.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { getHomepagePayload } from '@/lib/feeds/homepagePayload.service';
import { getHomepageVoicesFeed } from '@/lib/voices';
import { getUnifiedArchivePage } from '@/lib/feeds/unifiedArchive.service';
import { getNewswireStories } from '@/lib/newswire';
import { getCurrentBook } from '@/lib/bookclub/service';
import { getRecentJournalEntries } from '@/lib/journal';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  await Promise.allSettled([
    getHomepagePayload(),
    getHomepageVoicesFeed(),
    getUnifiedArchivePage(1, 20, {}),
    getNewswireStories(),
    getCurrentBook(),
    getRecentJournalEntries(1),
  ]);

  return NextResponse.json({ ok: true });
}