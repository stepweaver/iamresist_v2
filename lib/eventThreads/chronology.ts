import type { EventThreadTimeProvenance } from '@/lib/eventThreads/constants';
import { extractDateTokens, haystackContains } from '@/lib/eventThreads/grounding';
import type { EventThreadNoteContext, EventThreadSourceMeta, ProposedEventThread, ResolvedThreadEntry } from '@/lib/eventThreads/types';

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

function parseExplicitDate(token: string, fallbackYear: number | null): string | null {
  const iso = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`;

  const named = token.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i,
  );
  if (!named) return null;
  const month = MONTHS[named[1].toLowerCase()];
  const day = named[2].padStart(2, '0');
  const year = named[3] || (fallbackYear != null ? String(fallbackYear) : null);
  if (!month || !year) return null;
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function yearFrom(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).getUTCFullYear();
}

export function assignEntryTime(input: {
  context: EventThreadNoteContext;
  entry: ResolvedThreadEntry;
  source: EventThreadSourceMeta;
}): { occurredAt: string | null; timeProvenance: EventThreadTimeProvenance } {
  const haystack = [input.context.note.text, input.context.evidenceWindow, input.entry.resolvedText].join('\n');
  const sourceYear = yearFrom(input.source.publishedAt);
  for (const token of extractDateTokens(haystack)) {
    if (!haystackContains(`${input.context.note.text}\n${input.context.evidenceWindow}`, token)) continue;
    const parsed = parseExplicitDate(token, sourceYear);
    if (parsed) {
      return { occurredAt: parsed, timeProvenance: 'explicit_event_time' };
    }
  }

  if (input.source.publishedAt && Number.isFinite(Date.parse(input.source.publishedAt))) {
    return { occurredAt: new Date(input.source.publishedAt).toISOString(), timeProvenance: 'source_publication_time' };
  }

  return { occurredAt: null, timeProvenance: 'unknown' };
}

function occurredMs(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function applyChronology(
  threads: ProposedEventThread[],
  source: EventThreadSourceMeta,
): ProposedEventThread[] {
  return threads.map((thread) => {
    const entries = [...thread.entries]
      .sort((a, b) => {
        const byTime = occurredMs(a.occurredAt) - occurredMs(b.occurredAt);
        if (byTime !== 0) return byTime;
        const byAnchor = (a.listenAnchorSeconds ?? Number.POSITIVE_INFINITY) - (b.listenAnchorSeconds ?? Number.POSITIVE_INFINITY);
        if (byAnchor !== 0) return byAnchor;
        return String(a.atomicNoteId || a.id).localeCompare(String(b.atomicNoteId || b.id));
      })
      .map((entry, index) => ({ ...entry, sortOrder: index }));

    const times = entries.map((entry) => occurredMs(entry.occurredAt)).filter((value) => Number.isFinite(value));
    const startedAt = times.length ? new Date(Math.min(...times)).toISOString() : source.publishedAt;
    const lastActivityAt = times.length ? new Date(Math.max(...times)).toISOString() : source.publishedAt;

    return {
      ...thread,
      entries,
      startedAt: startedAt || null,
      lastActivityAt: lastActivityAt || null,
    };
  });
}
