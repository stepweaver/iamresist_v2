import { NextRequest, NextResponse } from 'next/server';
import { buildThemeRankingDiagnostics } from '@/lib/intel/themeRankingDiagnostics';

/**
 * Internal calibration view of Theme Memory ranking (baseline vs theme-aware).
 * Enabled in development or when INTERNAL_INTEL_DESK_DEBUG=1 or INTERNAL_THEME_RANKING_DEBUG=1.
 */
export async function GET(request: NextRequest) {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.INTERNAL_INTEL_DESK_DEBUG !== '1' &&
    process.env.INTERNAL_THEME_RANKING_DEBUG !== '1'
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
  const lane = searchParams.get('lane') || 'osint';
  const limit = Number(searchParams.get('limit') || 40);
  const payload = await buildThemeRankingDiagnostics({ lane, limit });
  return NextResponse.json(payload);
}
