import { THEME_MEMBERSHIP_IS_NOT_CORROBORATION } from '@/lib/themeMemory/constants';
import { isRankingCoreMembership } from '@/lib/themeMemory/identity';
import { themeItemKey, type ThemeStore } from '@/lib/themeMemory/store';
import type {
  ThemeDailySignalRecord,
  ThemeLifecycle,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';
import type { ThemeSourceSystem } from '@/lib/themeMemory/types';
import { utcDateString } from '@/lib/themeMemory/signals';

export type ThemeAttentionMomentum = 'rising' | 'steady' | 'falling';

export type ThemeAttentionItemRef = {
  sourceSystem: string;
  sourceSlug: string;
  identityKey: string;
};

/**
 * Inspectable Theme Memory context for a rankable item.
 * This is NOT a ranking score. Creator counts are editorial attention, not corroboration.
 */
export type ThemeAttentionForItem = {
  matchedThemeId: string | null;
  creatorCount7d: number;
  creatorItemCount7d: number;
  activeDays7d: number;
  lifecycle: ThemeLifecycle;
  momentum: ThemeAttentionMomentum;
  primarySourceCount: number;
  specialistSourceCount: number;
  reportingSourceCount: number;
  creatorSeedStrength: 'single' | 'converged' | null;
  themeEvidenceDepth: number;
  reasons: string[];
  membershipIsNotCorroboration: true;
};

export type ThemeReadModel = {
  id: string;
  slug: string;
  canonicalLabel: string;
  displayHeadline: string | null;
  summary: string | null;
  lifecycle: ThemeLifecycle;
  firstSeenAt: string;
  lastSeenAt: string;
  creatorSeedStrength: 'single' | 'converged' | null;
  attention: {
    creatorCount: number;
    creatorItemCount: number;
    creatorBreadth7d: number;
    activeDays7: number;
    activeDays14: number;
    creatorMomentum: number;
  };
  evidence: {
    newswireItemCount: number;
    newswireSourceCount: number;
    intelItemCount: number;
    primarySourceCount: number;
    specialistSourceCount: number;
    evidenceDepth: number;
    membershipIsNotCorroboration: true;
  };
};

export type ThemeMemberReadModel = {
  id: string;
  sourceSystem: string;
  sourceSlug: string;
  sourceName: string;
  title: string;
  canonicalUrl: string;
  publishedAt: string | null;
  role: string;
  method: string;
  confidence: number;
  reasons: string[];
  identityClass: 'core' | 'contextual' | null;
  membershipIsNotCorroboration: true;
};

export type ThemeTimelineEntry = {
  observedAt: string;
  title: string;
  sourceName: string;
  role: string;
  canonicalUrl: string;
};

function latestSignal(signals: ThemeDailySignalRecord[]): ThemeDailySignalRecord | null {
  return [...signals].sort((a, b) => b.signal_date.localeCompare(a.signal_date))[0] ?? null;
}

function seedStrength(metadata: Record<string, unknown>): 'single' | 'converged' | null {
  const value = metadata.creatorSeedStrength;
  return value === 'single' || value === 'converged' ? value : null;
}

function momentumLabel(value: number): ThemeAttentionMomentum {
  if (value >= 1.15) return 'rising';
  if (value <= 0.7) return 'falling';
  return 'steady';
}

function attentionMapKey(item: ThemeAttentionItemRef): string {
  return themeItemKey({
    source_system: item.sourceSystem,
    source_slug: item.sourceSlug,
    identity_key: item.identityKey,
  });
}

function creatorItemCount7d(members: ThemeMembershipRecord[], now: Date): number {
  const cutoff = new Date(now.getTime() - 7 * 86400000).toISOString();
  return members.filter(
    (row) =>
      row.source_system === 'voice' &&
      row.member_role === 'creator' &&
      row.item_observed_at >= cutoff,
  ).length;
}

function attentionContextReasons(input: {
  lifecycle: ThemeLifecycle;
  creatorCount7d: number;
  activeDays7d: number;
  momentum: ThemeAttentionMomentum;
  creatorSeedStrength: 'single' | 'converged' | null;
  reportingSourceCount: number;
  primarySourceCount: number;
}): string[] {
  const reasons = ['theme:matched_membership', `theme:lifecycle:${input.lifecycle}`];
  if (input.creatorSeedStrength) reasons.push(`theme:creator_seed:${input.creatorSeedStrength}`);
  if (input.creatorCount7d >= 2) reasons.push('theme:creator_breadth');
  if (input.activeDays7d >= 2) reasons.push('theme:active_days');
  if (input.momentum === 'rising') reasons.push('theme:momentum_rising');
  if (input.reportingSourceCount > 0) reasons.push('theme:has_reporting_context');
  if (input.primarySourceCount > 0) reasons.push('theme:has_primary_context');
  reasons.push('theme:membership_is_not_corroboration');
  return reasons;
}

function toAttention(input: {
  theme: ThemeRecord;
  signal: ThemeDailySignalRecord | null;
  members: ThemeMembershipRecord[];
  now: Date;
}): ThemeAttentionForItem {
  const creatorCount7d = input.signal?.creator_breadth ?? 0;
  const activeDays7d = input.signal?.active_days_7 ?? 0;
  const momentum = momentumLabel(input.signal?.creator_momentum ?? 0);
  const primarySourceCount = input.signal?.primary_source_count ?? 0;
  const specialistSourceCount = input.signal?.specialist_source_count ?? 0;
  const reportingSourceCount = input.signal?.newswire_source_count ?? 0;
  const creatorSeed = seedStrength(input.theme.metadata);
  return {
    matchedThemeId: input.theme.id,
    creatorCount7d,
    creatorItemCount7d: creatorItemCount7d(input.members, input.now),
    activeDays7d,
    lifecycle: input.theme.lifecycle_status,
    momentum,
    primarySourceCount,
    specialistSourceCount,
    reportingSourceCount,
    creatorSeedStrength: creatorSeed,
    themeEvidenceDepth: input.signal?.evidence_depth ?? 0,
    reasons: attentionContextReasons({
      lifecycle: input.theme.lifecycle_status,
      creatorCount7d,
      activeDays7d,
      momentum,
      creatorSeedStrength: creatorSeed,
      reportingSourceCount,
      primarySourceCount,
    }),
    membershipIsNotCorroboration: THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
  };
}

function toReadModel(
  theme: ThemeRecord,
  signal: ThemeDailySignalRecord | null,
  members: ThemeMembershipRecord[] = [],
): ThemeReadModel {
  const rankingMembers = members.filter((row) => isRankingCoreMembership(row, theme));
  const voiceCreators = rankingMembers.filter((row) => row.source_system === 'voice' && row.member_role === 'creator');
  const newswire = rankingMembers.filter((row) => row.source_system === 'newswire');
  const intel = rankingMembers.filter((row) => row.source_system === 'intel');
  const primary = rankingMembers.filter((row) => row.member_role === 'primary');
  const specialist = rankingMembers.filter((row) => row.member_role === 'specialist');
  return {
    id: theme.id,
    slug: theme.slug,
    canonicalLabel: theme.canonical_label,
    displayHeadline: theme.display_headline,
    summary: theme.summary,
    lifecycle: theme.lifecycle_status,
    firstSeenAt: theme.first_seen_at,
    lastSeenAt: theme.last_seen_at,
    creatorSeedStrength: seedStrength(theme.metadata),
    attention: {
      creatorCount: new Set(voiceCreators.map((row) => row.source_slug)).size,
      creatorItemCount: voiceCreators.length,
      creatorBreadth7d: signal?.creator_breadth ?? 0,
      activeDays7: signal?.active_days_7 ?? 0,
      activeDays14: signal?.active_days_14 ?? 0,
      creatorMomentum: signal?.creator_momentum ?? 0,
    },
    evidence: {
      newswireItemCount: newswire.length,
      newswireSourceCount: signal?.newswire_source_count ?? new Set(newswire.map((row) => row.source_slug)).size,
      intelItemCount: intel.length,
      primarySourceCount: new Set(primary.map((row) => row.source_slug)).size,
      specialistSourceCount: new Set(specialist.map((row) => row.source_slug)).size,
      evidenceDepth: signal?.evidence_depth ?? 0,
      membershipIsNotCorroboration: THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
    },
  };
}

export async function getActiveThemes(
  store: ThemeStore,
  opts: { windowDays?: number; now?: Date | string } = {},
): Promise<ThemeReadModel[]> {
  const windowDays = Math.max(1, opts.windowDays ?? 7);
  const now = opts.now ? new Date(opts.now) : new Date();
  const cutoff = new Date(now.getTime() - windowDays * 86400000).toISOString();
  const themes = await store.listThemes();
  const signals = await store.listSignals();
  const memberships = await store.listMemberships();
  const byTheme = new Map<string, ThemeDailySignalRecord[]>();
  for (const signal of signals) {
    const list = byTheme.get(signal.theme_id) || [];
    list.push(signal);
    byTheme.set(signal.theme_id, list);
  }
  const membersByTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of memberships) {
    const list = membersByTheme.get(row.theme_id) || [];
    list.push(row);
    membersByTheme.set(row.theme_id, list);
  }

  return themes
    .filter((theme) => theme.last_seen_at >= cutoff && theme.lifecycle_status !== 'dormant')
    .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
    .map((theme) => toReadModel(theme, latestSignal(byTheme.get(theme.id) || []), membersByTheme.get(theme.id) || []));
}

export async function getThemeById(store: ThemeStore, themeId: string): Promise<ThemeReadModel | null> {
  const themes = await store.listThemes();
  const theme = themes.find((row) => row.id === themeId || row.slug === themeId);
  if (!theme) return null;
  const signals = await store.listSignals(theme.id);
  const members = await store.listMemberships([theme.id]);
  return toReadModel(theme, latestSignal(signals), members);
}

export async function getThemeMembers(store: ThemeStore, themeId: string): Promise<ThemeMemberReadModel[]> {
  const members = await store.listMemberships([themeId]);
  return members
    .sort((a, b) => b.item_observed_at.localeCompare(a.item_observed_at))
    .map((row) => ({
      id: row.id,
      sourceSystem: row.source_system,
      sourceSlug: row.source_slug,
      sourceName: row.source_name,
      title: row.title,
      canonicalUrl: row.canonical_url,
      publishedAt: row.published_at,
      role: row.member_role,
      method: row.membership_method,
      confidence: row.membership_confidence,
      reasons: row.membership_reasons,
      identityClass:
        row.metadata?.identityClass === 'core' || row.metadata?.identityClass === 'contextual'
          ? row.metadata.identityClass
          : null,
      membershipIsNotCorroboration: THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
    }));
}

export async function getThemeTimeline(
  store: ThemeStore,
  themeId: string,
): Promise<{ members: ThemeTimelineEntry[]; signals: ThemeDailySignalRecord[] }> {
  const members = await store.listMemberships([themeId]);
  const signals = await store.listSignals(themeId);
  return {
    members: members
      .slice()
      .sort((a, b) => a.item_observed_at.localeCompare(b.item_observed_at))
      .map((row) => ({
        observedAt: row.item_observed_at,
        title: row.title,
        sourceName: row.source_name,
        role: row.member_role,
        canonicalUrl: row.canonical_url,
      })),
    signals: signals.slice().sort((a, b) => a.signal_date.localeCompare(b.signal_date)),
  };
}

/**
 * Inspectable ranking *context* from persisted membership.
 * Not a ranking score. Does not call AI.
 */
export async function getThemeAttentionForItem(
  store: ThemeStore,
  item: ThemeAttentionItemRef,
): Promise<ThemeAttentionForItem | null> {
  const map = await getThemeAttentionForItems(store, [item]);
  return map.get(attentionMapKey(item)) ?? null;
}

/**
 * Batch-load persisted theme attention for ranking.
 * Uses a bounded number of store queries, never one query per comparator.
 * Does not call AI or re-run semantic matching.
 */
export async function getThemeAttentionForItems(
  store: ThemeStore,
  items: ThemeAttentionItemRef[],
  opts: { now?: Date | string } = {},
): Promise<Map<string, ThemeAttentionForItem | null>> {
  const now = opts.now ? new Date(opts.now) : new Date();
  const out = new Map<string, ThemeAttentionForItem | null>();
  if (items.length === 0) return out;

  const refs = items.map((item) => ({
    source_system: item.sourceSystem as ThemeSourceSystem,
    source_slug: item.sourceSlug,
    identity_key: item.identityKey,
  }));
  for (const item of items) out.set(attentionMapKey(item), null);

  const memberships = await store.getMembershipsByItems(refs);
  const themeIds = [...new Set(memberships.map((row) => row.theme_id))];
  if (themeIds.length === 0) return out;

  const [themes, signals, themeMembers] = await Promise.all([
    store.listThemesByIds(themeIds),
    store.listSignalsByThemeIds(themeIds),
    store.listMemberships(themeIds),
  ]);
  const themeById = new Map(themes.map((theme) => [theme.id, theme]));
  const signalsByTheme = new Map<string, ThemeDailySignalRecord[]>();
  for (const signal of signals) {
    const list = signalsByTheme.get(signal.theme_id) || [];
    list.push(signal);
    signalsByTheme.set(signal.theme_id, list);
  }
  const membersByTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of themeMembers) {
    const list = membersByTheme.get(row.theme_id) || [];
    list.push(row);
    membersByTheme.set(row.theme_id, list);
  }

  for (const membership of memberships) {
    const theme = themeById.get(membership.theme_id);
    if (!theme) continue;
    if (!isRankingCoreMembership(membership, theme)) continue;
    const key = themeItemKey(membership);
    const themeMembers = (membersByTheme.get(theme.id) || []).filter((row) => isRankingCoreMembership(row, theme));
    out.set(
      key,
      toAttention({
        theme,
        signal: latestSignal(signalsByTheme.get(theme.id) || []),
        members: themeMembers,
        now,
      }),
    );
  }
  return out;
}

export function themeAttentionKey(item: ThemeAttentionItemRef): string {
  return attentionMapKey(item);
}

export function themeSignalDate(now?: Date | string): string {
  return utcDateString(now ? new Date(now).toISOString() : new Date().toISOString());
}
