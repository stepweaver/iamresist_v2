import { storyTokenJaccard, storyTextTokens } from '@/lib/intel/storyCoherence';
import { THEME_MEMBERSHIP_IS_NOT_CORROBORATION, THEME_SIGNAL_FORMULAS } from '@/lib/themeMemory/constants';
import type { ThemeDailySignalRecord, ThemeMembershipRecord } from '@/lib/themeMemory/themeTypes';

export function utcDateString(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  return iso.slice(0, 10);
}

function addUtcDays(dateStr: string, days: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00.000Z`);
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

function reportingSourceKey(row: ThemeMembershipRecord): string {
  const url = String(row.canonical_url || '').trim();
  if (url) {
    try {
      const normalized = new URL(url);
      normalized.hash = '';
      return `url:${normalized.href.replace(/\/$/, '').toLowerCase()}`;
    } catch {
      return `url:${url.toLowerCase()}`;
    }
  }
  const family = String(row.source_family || '').trim().toLowerCase();
  if (family && family !== 'general') return `family:${family}`;
  return `slug:${row.source_slug}`;
}

function titleFingerprint(title: string): string[] {
  return storyTextTokens(title).map((token) => token.toLowerCase());
}

/**
 * Distinct reporting sources after collapsing syndicated duplicates.
 * Same canonical URL counts once. Near-duplicate titles on the same day count once.
 */
export function distinctReportingSources(rows: ThemeMembershipRecord[]): number {
  const remaining: ThemeMembershipRecord[] = [];
  const seenUrl = new Set<string>();
  for (const row of rows) {
    const key = reportingSourceKey(row);
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    remaining.push(row);
  }

  const kept: ThemeMembershipRecord[] = [];
  for (const row of remaining) {
    const tokens = titleFingerprint(row.title);
    const duplicate = kept.some((other) => {
      if (other.source_slug === row.source_slug) return true;
      const otherTokens = titleFingerprint(other.title);
      return storyTokenJaccard(tokens, otherTokens) >= THEME_SIGNAL_FORMULAS.SYNDICATION_TITLE_JACCARD;
    });
    if (!duplicate) kept.push(row);
  }
  return kept.length;
}

function countActiveDays(dates: string[], endDate: string, windowDays: number): number {
  const start = addUtcDays(endDate, -(windowDays - 1));
  const inWindow = dates.filter((date) => date >= start && date <= endDate);
  return new Set(inWindow).size;
}

function creatorMomentum(todayCount: number, priorCounts: number[]): number {
  if (priorCounts.length === 0) return todayCount > 0 ? 1 : 0;
  const avg = priorCounts.reduce((sum, n) => sum + n, 0) / priorCounts.length;
  const denom = Math.max(1, avg);
  return Math.round((todayCount / denom) * 100) / 100;
}

export type ThemeSignalComputation = Omit<
  ThemeDailySignalRecord,
  'created_at' | 'updated_at' | 'metadata'
> & {
  lastCreatorActivityAt: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Deterministic daily theme statistics. No AI.
 *
 * Day-scoped: creator_count, creator_item_count, newswire_*, intel_* count items
 * observed on signal_date.
 *
 * Cumulative as of signal_date: primary_source_count, specialist_source_count,
 * evidence_depth (related context/evidence presence, not claim verification).
 *
 * Rolling: active_days_*, creator_breadth (distinct creators in last 7 days),
 * creator_momentum (today creator items / mean of prior 6 days).
 */
export function computeThemeDailySignal(input: {
  themeId: string;
  signalDate: string;
  memberships: ThemeMembershipRecord[];
  nowIso: string;
}): ThemeSignalComputation {
  const signalDate = input.signalDate;
  const asOf = `${signalDate}T23:59:59.999Z`;
  const members = input.memberships.filter((row) => row.item_observed_at <= asOf);

  const onDay = members.filter((row) => utcDateString(row.item_observed_at) === signalDate);
  const isVoiceCreator = (row: ThemeMembershipRecord) =>
    row.source_system === 'voice' && row.member_role === 'creator';
  const creatorsOnDay = onDay.filter(isVoiceCreator);
  const newswireOnDay = onDay.filter((row) => row.source_system === 'newswire');
  const intelOnDay = onDay.filter((row) => row.source_system === 'intel');

  const creatorDates = members.filter(isVoiceCreator).map((row) => utcDateString(row.item_observed_at));
  const anyDates = members.map((row) => utcDateString(row.item_observed_at));

  const priorCounts: number[] = [];
  for (let i = THEME_SIGNAL_FORMULAS.CREATOR_MOMENTUM_PRIOR_DAYS; i >= 1; i -= 1) {
    const date = addUtcDays(signalDate, -i);
    priorCounts.push(members.filter((row) => isVoiceCreator(row) && utcDateString(row.item_observed_at) === date).length);
  }

  const primaryRows = members.filter((row) => row.member_role === 'primary');
  const specialistRows = members.filter((row) => row.member_role === 'specialist');
  const reportingRows = members.filter((row) => row.member_role === 'reporting' || row.source_system === 'newswire');

  const primarySourceCount = new Set(primaryRows.map((row) => row.source_slug)).size;
  const specialistSourceCount = new Set(specialistRows.map((row) => row.source_slug)).size;
  const reportingSourceCount = distinctReportingSources(reportingRows);

  const evidenceDepth =
    primarySourceCount * THEME_SIGNAL_FORMULAS.EVIDENCE_PRIMARY_WEIGHT +
    specialistSourceCount * THEME_SIGNAL_FORMULAS.EVIDENCE_SPECIALIST_WEIGHT +
    reportingSourceCount * THEME_SIGNAL_FORMULAS.EVIDENCE_REPORTING_WEIGHT;

  const creatorLast = members
    .filter(isVoiceCreator)
    .map((row) => row.item_observed_at)
    .sort()
    .at(-1) ?? null;

  const breadthStart = addUtcDays(signalDate, -6);
  const creatorBreadth = new Set(
    members
      .filter((row) => isVoiceCreator(row) && utcDateString(row.item_observed_at) >= breadthStart)
      .map((row) => row.source_slug),
  ).size;

  return {
    theme_id: input.themeId,
    signal_date: signalDate,
    creator_count: new Set(creatorsOnDay.map((row) => row.source_slug)).size,
    creator_item_count: creatorsOnDay.length,
    newswire_source_count: distinctReportingSources(newswireOnDay),
    newswire_item_count: newswireOnDay.length,
    intel_source_count: new Set(intelOnDay.map((row) => row.source_slug)).size,
    intel_item_count: intelOnDay.length,
    primary_source_count: primarySourceCount,
    specialist_source_count: specialistSourceCount,
    creator_breadth: creatorBreadth,
    active_days_7: countActiveDays(creatorDates.length ? creatorDates : anyDates, signalDate, 7),
    active_days_14: countActiveDays(creatorDates.length ? creatorDates : anyDates, signalDate, 14),
    active_days_30: countActiveDays(creatorDates.length ? creatorDates : anyDates, signalDate, 30),
    creator_momentum: creatorMomentum(creatorsOnDay.length, priorCounts),
    evidence_depth: evidenceDepth,
    lastCreatorActivityAt: creatorLast,
    metadata: {
      membershipIsNotCorroboration: THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
      evidenceDepthMeans: 'related_primary_specialist_reporting_context_not_claim_verification',
      computedAt: input.nowIso,
      lastCreatorActivityAt: creatorLast,
    },
  };
}

const DAILY_SIGNAL_COLUMNS = [
  'theme_id',
  'signal_date',
  'creator_count',
  'creator_item_count',
  'newswire_source_count',
  'newswire_item_count',
  'intel_source_count',
  'intel_item_count',
  'primary_source_count',
  'specialist_source_count',
  'creator_breadth',
  'active_days_7',
  'active_days_14',
  'active_days_30',
  'creator_momentum',
  'evidence_depth',
  'metadata',
  'created_at',
  'updated_at',
] as const;

/**
 * Persistable daily-signal row. `lastCreatorActivityAt` is a lifecycle helper,
 * not a `intel.theme_daily_signals` column.
 */
export function toThemeDailySignalRecord(
  computed: ThemeSignalComputation,
  timestamps: { created_at: string; updated_at: string },
): ThemeDailySignalRecord {
  const { lastCreatorActivityAt: _lastCreatorActivityAt, ...row } = computed;
  const persistable: ThemeDailySignalRecord = {
    ...row,
    created_at: timestamps.created_at,
    updated_at: timestamps.updated_at,
  };
  for (const key of Object.keys(persistable) as Array<keyof ThemeDailySignalRecord | string>) {
    if (!DAILY_SIGNAL_COLUMNS.includes(key as (typeof DAILY_SIGNAL_COLUMNS)[number])) {
      delete (persistable as Record<string, unknown>)[key];
    }
  }
  return persistable;
}
