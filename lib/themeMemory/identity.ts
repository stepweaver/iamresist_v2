/**
 * Stable theme core identity.
 *
 * Membership can be core (identity-bearing) or contextual.
 * Matching compares candidates to the CORE fingerprint, not the bag of all members.
 * Contextual / mixed-topic members may belong without redefining theme vocabulary.
 */

import { scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import { featureStrength, phraseStrength } from '@/lib/themeMemory/featureStrength';
import {
  extractThemeFingerprint,
  fingerprintFromCandidate,
  fingerprintFromMembership,
  mergeFingerprints,
} from '@/lib/themeMemory/features';
import { themeItemKey } from '@/lib/themeMemory/store';
import type { ThemeCandidateItem } from '@/lib/themeMemory/types';
import type {
  ThemeCandidateMatch,
  ThemeFingerprint,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';

export type ThemeIdentityClass = 'core' | 'contextual';

const CORE_EXPAND_ROLES = new Set(['creator', 'reporting', 'primary']);
const CORE_IDENTITY_ROLES = new Set(['creator', 'reporting', 'primary', 'specialist']);

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return unique(a.filter((x) => setB.has(x)));
}

function memberItemKey(row: Pick<ThemeMembershipRecord, 'source_system' | 'source_slug' | 'identity_key'>): string {
  return themeItemKey(row);
}

export function isSeedMembership(
  member: Pick<ThemeMembershipRecord, 'source_system' | 'source_slug' | 'identity_key' | 'membership_reasons' | 'metadata'>,
  theme: Pick<ThemeRecord, 'metadata'>,
): boolean {
  const seededKey = theme.metadata?.seededItemKey;
  if (typeof seededKey === 'string' && seededKey === memberItemKey(member)) return true;
  if (member.membership_reasons.includes('seeded_creator_led_theme')) return true;
  if (member.metadata?.identityReason === 'seed') return true;
  return false;
}

export function seedMembers(theme: ThemeRecord, memberships: ThemeMembershipRecord[]): ThemeMembershipRecord[] {
  const marked = memberships.filter((row) => isSeedMembership(row, theme));
  if (marked.length > 0) return marked;
  const creators = memberships
    .filter((row) => row.member_role === 'creator')
    .sort((a, b) => {
      const ta = Date.parse(a.first_assigned_at);
      const tb = Date.parse(b.first_assigned_at);
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  return creators.slice(0, 1);
}

/**
 * A member may strengthen core identity only with a strong event-level match
 * against the current core, and only in identity-bearing roles.
 *
 * Generic words, boilerplate, the same person, or a shared institution are
 * not enough. Require overlapping event/story anchors.
 */
export function eventSpecificCoreAnchors(match: ThemeCandidateMatch): {
  tokens: string[];
  phrases: string[];
  clusterKeys: string[];
} {
  const tokens = unique(match.sharedDistinctive.filter((token) => featureStrength(token) === 'strong'));
  const phrases = unique(
    match.sharedPhrases.filter((phrase) => {
      if (phraseStrength(phrase) !== 'strong') return false;
      return phrase.split(' ').some((part) => featureStrength(part) === 'strong');
    }),
  );
  return {
    tokens,
    phrases,
    clusterKeys: unique(match.sharedClusterKeys),
  };
}

export function hasEventSpecificCoreIdentity(match: ThemeCandidateMatch): boolean {
  if (!match.distinctiveAnchor) return false;
  const { tokens, phrases, clusterKeys } = eventSpecificCoreAnchors(match);
  if (clusterKeys.length > 0) return true;
  if (tokens.length >= 2) return true;
  if (tokens.length >= 1 && phrases.length >= 1) return true;
  return phrases.some(
    (phrase) => phrase.split(' ').filter((part) => featureStrength(part) === 'strong').length >= 2,
  );
}

export function canExpandThemeCore(
  member: { member_role: string },
  match: ThemeCandidateMatch,
): boolean {
  if (!CORE_EXPAND_ROLES.has(member.member_role)) return false;
  return hasEventSpecificCoreIdentity(match);
}

export function isCoreIdentityMember(
  member: Pick<
    ThemeMembershipRecord,
    'member_role' | 'membership_reasons' | 'metadata' | 'source_system' | 'source_slug' | 'identity_key'
  >,
  theme: ThemeRecord,
  match?: ThemeCandidateMatch,
): boolean {
  if (isSeedMembership(member, theme)) return true;
  if (member.metadata?.identityClass === 'core') return true;
  if (member.metadata?.identityClass === 'contextual') return false;
  if (match) return canExpandThemeCore(member, match);
  return false;
}

export function identityClassForAttachment(input: {
  item: { role: string };
  match: ThemeCandidateMatch | null;
  seeded: boolean;
}): ThemeIdentityClass {
  if (input.seeded) return 'core';
  if (!input.match) return 'contextual';
  if (!CORE_IDENTITY_ROLES.has(input.item.role)) return 'contextual';
  if (hasEventSpecificCoreIdentity(input.match)) return 'core';
  return 'contextual';
}

/**
 * Ranking/attention may use a membership only when it is known core, or a
 * deterministic seed. Legacy rows with a missing identityClass fail closed.
 */
export function isRankingCoreMembership(
  member: Pick<
    ThemeMembershipRecord,
    'source_system' | 'source_slug' | 'identity_key' | 'membership_reasons' | 'metadata'
  >,
  theme?: Pick<ThemeRecord, 'metadata'> | null,
): boolean {
  const identityClass = member.metadata?.identityClass;
  if (identityClass === 'core') return true;
  if (identityClass === 'contextual') return false;
  if (theme) return isSeedMembership(member, theme);
  return (
    member.membership_reasons.includes('seeded_creator_led_theme') || member.metadata?.identityReason === 'seed'
  );
}

/**
 * Features a member may add to core: overlap with the current core, plus
 * distinctive tokens that co-occur in a member phrase with an existing core token.
 * Unrelated subtopics from a mixed-topic title are dropped.
 */
export function alignedFeaturesFromMember(memberFp: ThemeFingerprint, coreFp: ThemeFingerprint): ThemeFingerprint {
  const coreDistinctive = new Set(coreFp.distinctiveTokens);
  const sharedDistinctive = intersect(memberFp.distinctiveTokens, coreFp.distinctiveTokens);
  const extraDistinctive: string[] = [];
  const alignedPhrases: string[] = [];

  for (const phrase of memberFp.phrases) {
    const parts = phrase.split(' ').filter(Boolean);
    if (!parts.some((part) => coreDistinctive.has(part))) continue;
    alignedPhrases.push(phrase);
    for (const part of parts) {
      if (featureStrength(part) === 'strong') extraDistinctive.push(part);
    }
  }

  const clusterKeys: Record<string, string> = {};
  for (const [key, value] of Object.entries(memberFp.clusterKeys)) {
    if (coreFp.clusterKeys[key] === value) clusterKeys[key] = value;
  }

  return {
    distinctiveTokens: unique([...sharedDistinctive, ...extraDistinctive]).slice(0, 24),
    supportingTokens: intersect(memberFp.supportingTokens || [], coreFp.supportingTokens || []),
    phrases: unique([...intersect(memberFp.phrases, coreFp.phrases), ...alignedPhrases]).slice(0, 12),
    weakEntities: intersect(memberFp.weakEntities, coreFp.weakEntities),
    clusterKeys,
    actionHints: intersect(memberFp.actionHints, coreFp.actionHints),
    eventType: coreFp.eventType && memberFp.eventType === coreFp.eventType ? memberFp.eventType : coreFp.eventType,
  };
}

export function buildCandidateFingerprint(item: ThemeCandidateItem): ThemeFingerprint {
  return fingerprintFromCandidate(item);
}

export function buildThemeCoreFingerprint(theme: ThemeRecord, memberships: ThemeMembershipRecord[]): ThemeFingerprint {
  const seeds = seedMembers(theme, memberships);
  const seedParts = [
    extractThemeFingerprint({ title: theme.canonical_label }),
    ...seeds.map((row) => fingerprintFromMembership(row)),
  ];
  let core = mergeFingerprints(seedParts);

  const remaining = memberships
    .filter((row) => !seeds.some((seed) => seed.id === row.id))
    .sort((a, b) => {
      const ta = Date.parse(a.first_assigned_at);
      const tb = Date.parse(b.first_assigned_at);
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

  for (const member of remaining) {
    if (member.metadata?.identityClass === 'contextual') continue;
    const memberFp = fingerprintFromMembership(member);
    const match = scoreThemeCandidate({
      item: memberFp,
      theme: core,
      themeRecord: theme,
      itemObservedAt: member.item_observed_at,
    });
    const expand =
      member.metadata?.identityClass === 'core' || canExpandThemeCore(member, match);
    if (!expand) continue;
    core = mergeFingerprints([core, alignedFeaturesFromMember(memberFp, core)]);
  }

  return core;
}

export function compareCandidateToThemeCore(input: {
  item: ThemeFingerprint;
  theme: ThemeRecord;
  memberships: ThemeMembershipRecord[];
  itemObservedAt?: string | null;
}): ThemeCandidateMatch {
  return scoreThemeCandidate({
    item: input.item,
    theme: buildThemeCoreFingerprint(input.theme, input.memberships),
    themeRecord: input.theme,
    itemObservedAt: input.itemObservedAt,
  });
}

export function coreMembersForLabel(theme: ThemeRecord, memberships: ThemeMembershipRecord[]): ThemeMembershipRecord[] {
  const seeds = seedMembers(theme, memberships);
  const core = memberships.filter(
    (row) => isSeedMembership(row, theme) || row.metadata?.identityClass === 'core',
  );
  const source = core.length > 0 ? core : seeds;
  return source.slice(0, 10);
}
