/**
 * GET /api/cron/warm-home
 * Vercel Cron: lightweight homepage warmer only.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 *
 * Warms the three homepage section caches directly. The combined payload cache
 * was removed so one section's invalidation does not rebuild the others.
 * Run this after tag invalidation (ingest / revalidate) to close the cold window.
 * A required warm that throws returns 500. Empty successful payloads are not failures.
 */

import { NextResponse } from 'next/server';
import { getHomepageIntelFeed } from '@/lib/feeds/homepageIntel.service';
import { getHomeLiveBriefing } from '@/lib/feeds/homepageBriefing.service';
import { getRecentProtestMusicItems } from '@/lib/feeds/protestMusicFeed.service';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';
import { timeAsync } from '@/lib/ops/perfTiming';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WARM_TARGETS = [
  { id: 'homepage-intel', run: () => getHomepageIntelFeed() },
  { id: 'live-briefing', run: () => getHomeLiveBriefing() },
  { id: 'protest-music', run: () => getRecentProtestMusicItems() },
];

function safeErrorMessage(err) {
  const message = err instanceof Error ? err.message : 'warm_failed';
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 180);
}

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  const settled = await Promise.allSettled(
    WARM_TARGETS.map(({ id, run }) => timeAsync(`warm:${id}`, run, { target: id }).then(() => id)),
  );

  const warmedTargets = [];
  const failedTargets = [];

  settled.forEach((result, index) => {
    const id = WARM_TARGETS[index].id;
    if (result.status === 'fulfilled') {
      warmedTargets.push(id);
      return;
    }
    failedTargets.push({ target: id, error: safeErrorMessage(result.reason) });
  });

  const ok = failedTargets.length === 0;
  return NextResponse.json({ ok, warmedTargets, failedTargets }, { status: ok ? 200 : 500 });
}
