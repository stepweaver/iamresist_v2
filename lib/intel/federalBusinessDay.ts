/**
 * U.S. federal business-day clock for Federal Register Public Inspection.
 * The public list is posted on business mornings and taken down at midnight Eastern.
 * Observed-holiday rules follow the common OPM Friday/Monday shift.
 */

const EASTERN = 'America/New_York';

export type ZonedClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 Sunday … 6 Saturday, in the given time zone. */
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedParts(date: Date, timeZone: string): ZonedClock {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  return asUtc - date.getTime();
}

/** Calendar date in Eastern Time, evaluated at local noon so the weekday does not drift. */
function easternNoon(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
  const offset = timeZoneOffsetMs(guess, EASTERN);
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0) - offset);
  return utc;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function observedFixedHoliday(year: number, month: number, day: number): string {
  const weekday = zonedParts(easternNoon(year, month, day), EASTERN).weekday;
  if (weekday === 6) {
    const prev = addDays(year, month, day, -1);
    return ymd(prev.year, prev.month, prev.day);
  }
  if (weekday === 0) {
    const next = addDays(year, month, day, 1);
    return ymd(next.year, next.month, next.day);
  }
  return ymd(year, month, day);
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = zonedParts(easternNoon(year, month, 1), EASTERN).weekday;
  const delta = (weekday - first + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  return ymd(year, month, day);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = zonedParts(easternNoon(year, month, lastDate), EASTERN).weekday;
  const delta = (lastDow - weekday + 7) % 7;
  return ymd(year, month, lastDate - delta);
}

/** OPM holiday dates for one calendar year, as Eastern `YYYY-MM-DD`. */
export function usFederalHolidayDates(year: number): Set<string> {
  return new Set([
    observedFixedHoliday(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    lastWeekday(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 10, 1, 2),
    observedFixedHoliday(year, 11, 11),
    nthWeekday(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
  ]);
}

export function easternClock(now = new Date()): ZonedClock {
  return zonedParts(now, EASTERN);
}

export function isUsFederalHoliday(now = new Date()): boolean {
  const clock = easternClock(now);
  return usFederalHolidayDates(clock.year).has(ymd(clock.year, clock.month, clock.day));
}

export function isUsFederalBusinessDay(now = new Date()): boolean {
  const clock = easternClock(now);
  if (clock.weekday === 0 || clock.weekday === 6) return false;
  return !isUsFederalHoliday(now);
}

/**
 * Public Inspection filings are posted around 8:45 a.m. Eastern on federal
 * business days and the list is unavailable after midnight until that posting.
 */
export function publicInspectionDeskClosed(now = new Date()): { closed: boolean; reason: string | null } {
  const clock = easternClock(now);
  if (clock.weekday === 0 || clock.weekday === 6) {
    return { closed: true, reason: 'Public Inspection is closed over the weekend.' };
  }
  if (isUsFederalHoliday(now)) {
    return { closed: true, reason: 'Public Inspection is closed on this federal holiday.' };
  }
  const minutes = clock.hour * 60 + clock.minute;
  if (minutes < 8 * 60 + 45) {
    return {
      closed: true,
      reason: 'Public Inspection has not posted yet (list returns at 8:45 a.m. Eastern on business days).',
    };
  }
  return { closed: false, reason: null };
}
