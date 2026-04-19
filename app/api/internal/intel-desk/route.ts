import { NextRequest, NextResponse } from 'next/server';
import { getLiveIntelDeskDebug } from '@/lib/feeds/liveIntel.service';

/**
 * Internal JSON view of intel desk selection + suppression metadata.
 * Enabled in development or when INTERNAL_INTEL_DESK_DEBUG=1.
 */
export async function GET(request: NextRequest) {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.INTERNAL_INTEL_DESK_DEBUG !== '1'
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const searchParams =
    request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
  const lane = searchParams.get('lane') || 'osint';
  const payload = await getLiveIntelDeskDebug(lane);
  return NextResponse.json(payload);
}
