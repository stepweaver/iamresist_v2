import { describe, expect, it } from 'vitest';

import { hasEventSpecificCoreIdentity, identityClassForAttachment } from '@/lib/themeMemory/identity';
import { extractThemeFingerprint } from '@/lib/themeMemory/features';
import { scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import {
  overlayProposedCoreMemberships,
  previewRankingSignals,
  reclassifyLegacyCoreMemberships,
  reclassifyThemeMemberships,
  THEME_RECLASSIFY_APPLY_UNIMPLEMENTED,
  THEME_RECLASSIFY_CANARIES,
  THEME_RECLASSIFY_DRY_RUN_REQUIRED,
  THEME_RECLASSIFY_WRITE_BLOCKED,
} from '@/lib/themeMemory/reclassify';
import {
  createWriteBlockedThemeStore,
  parseThemeReclassifyArgs,
  runThemeMembershipReclassify,
} from '@/lib/themeMemory/reclassifyRun';
import { createMemoryThemeStore } from '@/lib/themeMemory/store';
import type { ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';

const NOW = '2026-09-15T16:00:00.000Z';
const LATER = '2026-09-15T17:00:00.000Z';
const LATEST = '2026-09-15T18:00:00.000Z';

const MASSIE_CANARY = THEME_RECLASSIFY_CANARIES[0].id;
const SENATE_CANARY = THEME_RECLASSIFY_CANARIES[1].id;
const COURT_CANARY = THEME_RECLASSIFY_CANARIES[2].id;

function themeRecord(over: Partial<ThemeRecord> & Pick<ThemeRecord, 'id' | 'canonical_label'>): ThemeRecord {
  return {
    slug: over.slug || over.id,
    display_headline: over.canonical_label,
    summary: over.summary ?? over.canonical_label,
    first_seen_at: NOW,
    last_seen_at: NOW,
    lifecycle_status: over.lifecycle_status || 'new',
    metadata: {
      seededItemKey: over.metadata?.seededItemKey,
      creatorSeedStrength: 'single',
      ...over.metadata,
    },
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function membershipRecord(
  over: Partial<ThemeMembershipRecord> & Pick<ThemeMembershipRecord, 'id' | 'theme_id' | 'title' | 'member_role'>,
): ThemeMembershipRecord {
  return {
    source_system: over.source_system || 'voice',
    source_slug: over.source_slug || over.id,
    source_name: over.source_name || over.source_slug || over.id,
    identity_key: over.identity_key || `url:${over.id}`,
    canonical_url: over.canonical_url || `https://example.test/${over.id}`,
    summary: over.summary ?? null,
    published_at: over.published_at || NOW,
    item_observed_at: over.item_observed_at || NOW,
    membership_confidence: 1,
    membership_method: 'deterministic',
    membership_reasons: over.membership_reasons || ['attached'],
    content_hash: over.content_hash || over.id,
    classification_version: 'tm-classify-v3',
    membership_prompt_version: null,
    provenance_class: null,
    desk_lane: null,
    source_family: 'general',
    first_assigned_at: over.first_assigned_at || NOW,
    last_confirmed_at: over.last_confirmed_at || NOW,
    metadata: over.metadata || { identityClass: 'core', identityReason: 'core_identity' },
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function massieTheme() {
  return themeRecord({
    id: MASSIE_CANARY,
    canonical_label: 'Massie Moves to Impeach Hegseth',
    metadata: { seededItemKey: 'voice:meidastouch:url:massie-seed' },
  });
}

function massieSeed() {
  return membershipRecord({
    id: 'massie-seed',
    theme_id: MASSIE_CANARY,
    source_slug: 'meidastouch',
    source_name: 'MeidasTouch',
    title: 'BREAKING: Rep. Massie moves to IMPEACH Hegseth',
    member_role: 'creator',
    membership_reasons: ['seeded_creator_led_theme'],
    metadata: { identityClass: 'core', identityReason: 'seed' },
    first_assigned_at: NOW,
    item_observed_at: NOW,
  });
}

describe('Theme Memory legacy core reclassification', () => {
  it('1: poisoned member cannot validate itself', () => {
    const theme = massieTheme();
    const seed = massieSeed();
    const poison = membershipRecord({
      id: 'spaceballs',
      theme_id: MASSIE_CANARY,
      source_slug: 'ken-klippenstein',
      source_name: 'Ken Klippenstein',
      title: 'Spaceballs',
      summary: 'Pentagon announces space weapons 💫',
      member_role: 'creator',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });

    const selfMatch = scoreThemeCandidate({
      item: extractThemeFingerprint({ title: poison.title, summary: poison.summary }),
      theme: extractThemeFingerprint({ title: poison.title, summary: poison.summary }),
      themeRecord: theme,
      itemObservedAt: poison.item_observed_at,
    });
    expect(hasEventSpecificCoreIdentity(selfMatch)).toBe(true);
    expect(
      identityClassForAttachment({ item: { role: 'creator' }, match: selfMatch, seeded: false }),
    ).toBe('core');

    const { decisions } = reclassifyThemeMemberships(theme, [seed, poison]);
    const poisonDecision = decisions.find((row) => row.membershipId === 'spaceballs');
    expect(poisonDecision?.proposedClass).toBe('DOWNGRADE_CONTEXTUAL');
    expect(poisonDecision?.contributedToReconstructedCore).toBe(false);
    expect(poisonDecision?.calibrationNotes.join(' ')).toMatch(/Spaceballs/i);

    const report = reclassifyLegacyCoreMemberships({
      themes: [theme],
      memberships: [seed, poison],
      rankingMode: 'shadow',
    });
    expect(
      report.canaries[0]?.storedMembers.some((row) => /spaceballs/i.test(row.title) && row.calibrationNotes.length > 0),
    ).toBe(true);
  });

  it('2: rejected legacy core does not expand fingerprint for later members', () => {
    const theme = massieTheme();
    const seed = massieSeed();
    const mixed = membershipRecord({
      id: 'mixed-impeachments',
      theme_id: MASSIE_CANARY,
      source_slug: 'creator-roundup',
      title: 'Space Weapons, Impeachments, and... Animality? #latestnews',
      member_role: 'creator',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });
    const later = membershipRecord({
      id: 'spaceballs-later',
      theme_id: MASSIE_CANARY,
      source_slug: 'ken-klippenstein',
      title: 'Spaceballs',
      summary: 'Pentagon announces space weapons 💫',
      member_role: 'creator',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATEST,
      item_observed_at: LATEST,
    });

    const { decisions } = reclassifyThemeMemberships(theme, [seed, mixed, later]);
    expect(decisions.find((row) => row.membershipId === 'mixed-impeachments')?.proposedClass).toBe(
      'DOWNGRADE_CONTEXTUAL',
    );
    expect(decisions.find((row) => row.membershipId === 'mixed-impeachments')?.contributedToReconstructedCore).toBe(
      false,
    );
    expect(decisions.find((row) => row.membershipId === 'spaceballs-later')?.proposedClass).toBe(
      'DOWNGRADE_CONTEXTUAL',
    );
    expect(decisions.find((row) => row.membershipId === 'spaceballs-later')?.contributedToReconstructedCore).toBe(
      false,
    );
  });

  it('3: valid corroborating core remains KEEP_CORE', () => {
    const theme = massieTheme();
    const seed = massieSeed();
    const reporting = membershipRecord({
      id: 'al-jazeera',
      theme_id: MASSIE_CANARY,
      source_system: 'newswire',
      source_slug: 'al-jazeera',
      source_name: 'Al Jazeera',
      title: 'Republican congressman calls to impeach US Defence Secretary Pete Hegseth',
      member_role: 'reporting',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });

    const { decisions } = reclassifyThemeMemberships(theme, [seed, reporting]);
    expect(decisions.find((row) => row.membershipId === 'al-jazeera')?.proposedClass).toBe('KEEP_CORE');
    expect(decisions.find((row) => row.membershipId === 'al-jazeera')?.contributedToReconstructedCore).toBe(true);
  });

  it('4: weak same-person overlap downgrades', () => {
    const theme = massieTheme();
    const seed = massieSeed();
    const weak = membershipRecord({
      id: 'hegseth-troops',
      theme_id: MASSIE_CANARY,
      source_system: 'newswire',
      source_slug: 'wire',
      title: 'Pete Hegseth visits troops overseas',
      member_role: 'reporting',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });

    const { decisions } = reclassifyThemeMemberships(theme, [seed, weak]);
    expect(decisions.find((row) => row.membershipId === 'hegseth-troops')?.proposedClass).toBe(
      'DOWNGRADE_CONTEXTUAL',
    );
  });

  it('5: generic phrase overlap downgrades', () => {
    const theme = themeRecord({
      id: COURT_CANARY,
      canonical_label: 'Supreme Court blocks Missouri congressional map',
      metadata: { seededItemKey: 'voice:democracy-docket:url:missouri-seed' },
    });
    const seed = membershipRecord({
      id: 'missouri-seed',
      theme_id: COURT_CANARY,
      source_slug: 'democracy-docket',
      title: 'Supreme Court blocks Missouri congressional map',
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed' },
    });
    const generic = membershipRecord({
      id: 'tariff-ruling',
      theme_id: COURT_CANARY,
      source_system: 'newswire',
      source_slug: 'ap',
      title: 'Supreme Court issues major ruling in unrelated emergency tariff dispute',
      member_role: 'reporting',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });

    const { decisions } = reclassifyThemeMemberships(theme, [seed, generic]);
    expect(decisions.find((row) => row.membershipId === 'tariff-ruling')?.proposedClass).toBe(
      'DOWNGRADE_CONTEXTUAL',
    );
    expect(decisions.find((row) => row.membershipId === 'missouri-seed')?.proposedClass).toBe('KEEP_CORE');
  });

  it('6: original seed is preserved', () => {
    const theme = massieTheme();
    const seed = massieSeed();
    const poison = membershipRecord({
      id: 'spaceballs',
      theme_id: MASSIE_CANARY,
      source_slug: 'ken-klippenstein',
      title: 'Spaceballs',
      summary: 'Pentagon announces space weapons 💫',
      member_role: 'creator',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });

    const { decisions } = reclassifyThemeMemberships(theme, [seed, poison]);
    const seedDecision = decisions.find((row) => row.membershipId === 'massie-seed');
    expect(seedDecision?.proposedClass).toBe('KEEP_CORE');
    expect(seedDecision?.isSeed).toBe(true);
    expect(seedDecision?.contributedToReconstructedCore).toBe(true);
    expect(decisions.some((row) => row.isSeed && row.proposedClass === 'DOWNGRADE_CONTEXTUAL')).toBe(false);
  });

  it('7: ambiguous seed becomes REVIEW', () => {
    const theme = themeRecord({
      id: SENATE_CANARY,
      canonical_label: 'Republican Senate candidate cheating',
    });
    const first = membershipRecord({
      id: 'cheat-seed',
      theme_id: SENATE_CANARY,
      source_slug: 'brian-tyler-cohen',
      title: 'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed' },
    });
    const second = membershipRecord({
      id: 'kash-hearing',
      theme_id: SENATE_CANARY,
      source_slug: 'meidastouch',
      title: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed' },
    });

    const { seedResolution, decisions } = reclassifyThemeMemberships(theme, [first, second]);
    expect(seedResolution.status).toBe('ambiguous');
    expect(decisions.every((row) => row.proposedClass === 'REVIEW')).toBe(true);
    expect(decisions.some((row) => row.proposedClass === 'DOWNGRADE_CONTEXTUAL')).toBe(false);

    const missing = reclassifyThemeMemberships(
      themeRecord({ id: 'theme-no-seed', canonical_label: 'Unknown subject' }),
      [
        membershipRecord({
          id: 'orphan-core',
          theme_id: 'theme-no-seed',
          source_slug: 'voice-a',
          title: 'An item with no seed markers',
          member_role: 'creator',
          membership_reasons: ['ai_overlap'],
          metadata: { identityClass: 'core', identityReason: 'core_identity' },
        }),
      ],
    );
    expect(missing.seedResolution.status).toBe('missing');
    expect(missing.decisions[0]?.proposedClass).toBe('REVIEW');
  });

  it('marks a uniquely marked seed REVIEW when it does not share event identity with the theme label', () => {
    const theme = themeRecord({
      id: 'theme-911',
      canonical_label: '9/11 Widow Blasts U.S. Cover-Up of Saudi Role in Attacks',
      metadata: { seededItemKey: 'voice:voice-a:url:podcaster-seed' },
    });
    const seed = membershipRecord({
      id: 'podcaster-seed',
      theme_id: 'theme-911',
      source_slug: 'voice-a',
      title: 'ICYMI Been one year since a podcaster died and y’all compared that man to Jesus-',
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed' },
    });
    const other = membershipRecord({
      id: 'saudi-coverup',
      theme_id: 'theme-911',
      source_slug: 'democracy-now',
      source_system: 'newswire',
      title: '"One Betrayal After Another": 9/11 Widow Blasts U.S. Cover-Up of Saudi Role in Attacks',
      member_role: 'reporting',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });
    const { decisions } = reclassifyThemeMemberships(theme, [seed, other]);
    expect(decisions.every((row) => row.proposedClass === 'REVIEW')).toBe(true);
    expect(decisions[0]?.reasons).toEqual(expect.arrayContaining(['seed_label_mismatch']));
  });

  it('8: dry-run performs zero writes', async () => {
    expect(parseThemeReclassifyArgs(['--dry-run'])).toEqual({ dryRun: true, apply: false });
    await expect(runThemeMembershipReclassify({ apply: true, dryRun: true })).rejects.toThrow(
      THEME_RECLASSIFY_APPLY_UNIMPLEMENTED,
    );
    await expect(runThemeMembershipReclassify({})).rejects.toThrow(THEME_RECLASSIFY_DRY_RUN_REQUIRED);

    const theme = massieTheme();
    const seed = massieSeed();
    const inner = createMemoryThemeStore({ themes: [theme], memberships: [seed] });
    const { store, writesAttempted } = createWriteBlockedThemeStore(inner);
    const report = await runThemeMembershipReclassify({
      dryRun: true,
      rankingMode: 'shadow',
      deps: { store },
    });
    expect(report.mode).toBe('dry-run');
    expect(report.persisted).toBe(false);
    expect(report.databaseWrites).toBe(0);
    expect(writesAttempted()).toBe(0);
    await expect(store.upsertMembership(seed)).rejects.toThrow(THEME_RECLASSIFY_WRITE_BLOCKED);
    await expect(store.upsertTheme(theme)).rejects.toThrow(THEME_RECLASSIFY_WRITE_BLOCKED);
    expect(writesAttempted()).toBe(2);
    const still = await inner.listMemberships();
    expect(still).toHaveLength(1);
    expect(still[0]?.metadata.identityClass).toBe('core');
  });

  it('9: preview signal calculations use proposed core set only', () => {
    const theme = themeRecord({
      id: SENATE_CANARY,
      canonical_label: 'Republican Senate candidate cheating',
      metadata: { seededItemKey: 'voice:brian-tyler-cohen:url:cheat-seed' },
    });
    const seed = membershipRecord({
      id: 'cheat-seed',
      theme_id: SENATE_CANARY,
      source_slug: 'brian-tyler-cohen',
      source_name: 'Brian Tyler Cohen',
      title: 'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed' },
    });
    const poison = membershipRecord({
      id: 'kash-hearing',
      theme_id: SENATE_CANARY,
      source_slug: 'meidastouch',
      source_name: 'MeidasTouch',
      title: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
      member_role: 'creator',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATER,
      item_observed_at: LATER,
    });
    const opioid = membershipRecord({
      id: 'mike-rogers',
      theme_id: SENATE_CANARY,
      source_system: 'newswire',
      source_slug: 'drop-site-news',
      source_name: 'Drop Site News',
      title: "Got Oxy? How Michigan’s Mike Rogers Helped Fuel the Opioid Crisis",
      member_role: 'reporting',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATEST,
      item_observed_at: LATEST,
    });

    const report = reclassifyLegacyCoreMemberships({
      themes: [theme],
      memberships: [seed, poison, opioid],
      rankingMode: 'shadow',
      databaseWrites: 0,
    });
    const result = report.themes[0];
    expect(result?.signalPreview.before.creatorBreadth).toBe(2);
    expect(result?.signalPreview.before.creatorItemCount).toBe(2);
    expect(result?.signalPreview.before.newswireSourceCount).toBe(1);
    expect(result?.signalPreview.after.creatorBreadth).toBe(1);
    expect(result?.signalPreview.after.creatorItemCount).toBe(1);
    expect(result?.signalPreview.after.newswireSourceCount).toBe(0);

    const overlay = overlayProposedCoreMemberships([seed, poison, opioid], result?.memberships || []);
    expect(previewRankingSignals(overlay)).toEqual(result?.signalPreview.after);
    expect(overlay.find((row) => row.id === 'kash-hearing')?.metadata.identityClass).toBe('contextual');
    expect(overlay.find((row) => row.id === 'cheat-seed')?.metadata.identityClass).toBe('core');
    expect(result?.memberships.find((row) => row.membershipId === 'kash-hearing')?.calibrationNotes.join(' ')).toMatch(
      /Kash Patel/i,
    );
    expect(result?.memberships.find((row) => row.membershipId === 'mike-rogers')?.calibrationNotes.join(' ')).toMatch(
      /opioid|Mike Rogers/i,
    );
  });
});
