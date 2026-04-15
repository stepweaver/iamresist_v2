import { NextResponse } from 'next/server';
import { getHomeLiveBriefingWithExplain } from '@/lib/feeds/homepageBriefing.service';

/**
 * Internal JSON view of homepage briefing selection + explanation metadata.
 * Enabled in development or when INTERNAL_BRIEFING_DEBUG=1.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development' && process.env.INTERNAL_BRIEFING_DEBUG !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const payload = await getHomeLiveBriefingWithExplain();
  return NextResponse.json(payload);
}
