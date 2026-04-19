/**
 * GET /api/cron/warm-home
 * Vercel Cron: lightweight homepage warmer only.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from 'next/server';
import { getHomepagePayload } from '@/lib/feeds/homepagePayload.service';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WARMED_TARGETS = ['homepagePayload'];

export async function GET(req) {
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  // The homepage payload already warms the cached landing-page dependencies we need.
  await Promise.allSettled([getHomepagePayload()]);

  return NextResponse.json({ ok: true, warmedTargets: WARMED_TARGETS });
}
