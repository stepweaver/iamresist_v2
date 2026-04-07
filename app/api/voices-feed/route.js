import { NextResponse } from 'next/server';
import { getHomepageVoicesFeed } from '@/lib/voices';
import { rateLimitedResponse } from '@/lib/server/rateLimit';

export async function GET(request) {
  const limited = rateLimitedResponse('voices-feed', request);
  if (limited) return limited;

  try {
    const items = await getHomepageVoicesFeed();
    return NextResponse.json(
      { items },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error(err);
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
