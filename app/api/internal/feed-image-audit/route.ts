import { NextResponse } from 'next/server';
import { getFeedImageAudit } from '@/lib/feeds/feedImageAudit.service';

/**
 * Internal JSON audit surface for recent feed items that render without images.
 * Enabled in development or when INTERNAL_BRIEFING_DEBUG=1.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development' && process.env.INTERNAL_BRIEFING_DEBUG !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const newswireSample = parseInt(url.searchParams.get('newswireSample') || '', 10);
  const liveDeskPerLane = parseInt(url.searchParams.get('liveDeskPerLane') || '', 10);
  const voicesSample = parseInt(url.searchParams.get('voicesSample') || '', 10);

  const payload = await getFeedImageAudit({
    ...(Number.isFinite(newswireSample) ? { newswireSample } : {}),
    ...(Number.isFinite(liveDeskPerLane) ? { liveDeskPerLane } : {}),
    ...(Number.isFinite(voicesSample) ? { voicesSample } : {}),
  });

  return NextResponse.json(payload);
}
