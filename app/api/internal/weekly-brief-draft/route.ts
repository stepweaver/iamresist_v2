import { NextResponse } from 'next/server';
import { generateWeeklyBriefDraft, WeeklyBriefDraftValidationError } from '@/lib/weeklyBrief/aiDraft.service';

/**
 * Internal JSON route to generate a Weekly Brief draft from row metadata,
 * Notion page body notes, and selected candidate items.
 * Enabled in development or when INTERNAL_BRIEFING_DEBUG=1.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development' && process.env.INTERNAL_BRIEFING_DEBUG !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const briefId = typeof body.briefId === 'string' ? body.briefId.trim() : '';
  const selectedCandidateIds = Array.isArray(body.selectedCandidateIds) ? body.selectedCandidateIds : [];
  const windowStart = typeof body.windowStart === 'string' ? body.windowStart : undefined;
  const windowEnd = typeof body.windowEnd === 'string' ? body.windowEnd : undefined;
  const windowDays =
    typeof body.windowDays === 'number'
      ? body.windowDays
      : typeof body.windowDays === 'string'
        ? parseInt(body.windowDays, 10)
        : undefined;

  if (!briefId) {
    return NextResponse.json({ error: 'briefId is required' }, { status: 400 });
  }

  try {
    const payload = await generateWeeklyBriefDraft({
      briefId,
      selectedCandidateIds,
      ...(windowStart ? { windowStart } : {}),
      ...(windowEnd ? { windowEnd } : {}),
      ...(Number.isFinite(windowDays) ? { windowDays } : {}),
    });

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof WeeklyBriefDraftValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: message,
          validation: {
            ...(error.details ?? {}),
            failed: true,
          },
        },
        { status: error.status ?? 400 }
      );
    }

    const status = message === 'Weekly Brief not found' ? 404 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: message,
        validation: {
          failed: true,
        },
      },
      { status }
    );
  }
}
