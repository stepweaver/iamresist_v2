import { NextResponse } from 'next/server';
import { getWeeklyBriefCandidates } from '@/lib/feeds/weeklyBriefCandidates.service';

/**
 * Internal JSON view of deterministic Weekly Brief candidates.
 * Enabled in development or when INTERNAL_BRIEFING_DEBUG=1.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development' && process.env.INTERNAL_BRIEFING_DEBUG !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const windowDaysRaw = url.searchParams.get('windowDays');
  const windowStart = url.searchParams.get('windowStart') || undefined;
  const windowEnd = url.searchParams.get('windowEnd') || undefined;
  const windowDays = windowDaysRaw ? parseInt(windowDaysRaw, 10) : undefined;

  const payload = await getWeeklyBriefCandidates({
    ...(windowStart ? { windowStart } : {}),
    ...(windowEnd ? { windowEnd } : {}),
    ...(Number.isFinite(windowDays) ? { windowDays } : {}),
  });

  return NextResponse.json(payload);
}
