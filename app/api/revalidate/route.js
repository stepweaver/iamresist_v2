/**
 * POST /api/revalidate — on-demand cache invalidation for feed caches.
 * Secured by CRON_SECRET (Authorization: Bearer <CRON_SECRET>).
 * Optional JSON body: { "tags": ["newswire", ...] } subset of FEED_TAGS.
 */

import { revalidateTag } from 'next/cache';
import { env } from '@/lib/env';
import { assertCronAuthorized } from '@/lib/ops/cronAuth';

export const dynamic = 'force-dynamic';

/** Tags passed to `unstable_cache` / `fetch(..., { next: { tags } })` anywhere in lib/app — keep in sync when adding caches. */
const FEED_TAGS = [
  'unified-archive',
  'voices-feed',
  'voices-homepage-feed',
  'homepage-intel-feed',
  'intel-live',
  'newswire',
  'voices-more',
  'protest-music',
  'curated-videos',
  'journal',
  'bookclub',
];

const TAG_SET = new Set(FEED_TAGS);

export async function POST(req) {
  // Keep env import to avoid breaking older deployments that rely on env initialization side effects.
  void env;
  const gate = assertCronAuthorized(req);
  if (!gate.ok) return gate.response;

  let body = {};
  try {
    const text = await req.text();
    if (text?.trim()) body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requested = Array.isArray(body.tags) ? body.tags : null;
  const tagsToRun =
    requested && requested.length > 0
      ? requested.filter((t) => typeof t === 'string' && TAG_SET.has(t))
      : FEED_TAGS;

  if (requested && requested.length > 0 && tagsToRun.length === 0) {
    return Response.json({ error: 'No valid tags in body' }, { status: 400 });
  }

  try {
    for (const tag of tagsToRun) {
      revalidateTag(tag);
    }
    return Response.json({ ok: true, revalidated: tagsToRun });
  } catch (err) {
    console.error('[revalidate] Failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
