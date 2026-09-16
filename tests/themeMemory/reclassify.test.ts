import { describe, expect, it } from 'vitest';

import { hasEventSpecificCoreIdentity, identityClassForAttachment } from '@/lib/themeMemory/identity';
import { extractThemeFingerprint } from '@/lib/themeMemory/features';
import { scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import {
  formatThemeReclassifyReport,
  overlayProposedCoreMemberships,
  previewRankingSignals,
  reclassifyLegacyCoreMemberships,
  reclassifyThemeMemberships,
  THEME_RECLASSIFY_BOTH_MODES,
  THEME_RECLASSIFY_CANARIES,
  THEME_RECLASSIFY_DRY_RUN_REQUIRED,
  THEME_RECLASSIFY_EXPECTED_DOWNGRADES_REQUIRED,
  THEME_RECLASSIFY_SHADOW_REQUIRED,
  THEME_RECLASSIFY_VERSION,
  THEME_RECLASSIFY_WRITE_BLOCKED,
  themeReclassifyExpectedMismatch,
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

  it('same-person Pete/Hegseth overlap does not KEEP_CORE or expand reconstructed core', () => {
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
    const samePerson = membershipRecord({
      id: 'pete-hegseth-only',
      theme_id: MASSIE_CANARY,
      source_system: 'newswire',
      source_slug: 'wire',
      title: 'Pete Hegseth visits troops overseas',
      member_role: 'reporting',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
      first_assigned_at: LATEST,
      item_observed_at: LATEST,
    });

    const { decisions } = reclassifyThemeMemberships(theme, [seed, reporting, samePerson]);
    expect(decisions.find((row) => row.membershipId === 'al-jazeera')?.proposedClass).toBe('KEEP_CORE');
    expect(decisions.find((row) => row.membershipId === 'al-jazeera')?.contributedToReconstructedCore).toBe(true);
    const rejected = decisions.find((row) => row.membershipId === 'pete-hegseth-only');
    expect(rejected?.proposedClass).toBe('DOWNGRADE_CONTEXTUAL');
    expect(rejected?.contributedToReconstructedCore).toBe(false);
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
    expect(parseThemeReclassifyArgs(['--dry-run'])).toEqual({
      dryRun: true,
      apply: false,
      expectedDowngrades: null,
    });
    await expect(runThemeMembershipReclassify({ apply: true, dryRun: true })).rejects.toThrow(
      THEME_RECLASSIFY_BOTH_MODES,
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
    expect(report.plannedWrites).toBe(0);
    expect(report.successfulWrites).toBe(0);
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

const APPLY_AT = '2026-09-16T23:00:00.000Z';

function applyKeepReporting() {
  return membershipRecord({
    id: 'al-jazeera',
    theme_id: MASSIE_CANARY,
    source_system: 'newswire',
    source_slug: 'al-jazeera',
    source_name: 'Al Jazeera',
    title: 'Republican congressman calls to impeach US Defence Secretary Pete Hegseth',
    member_role: 'reporting',
    metadata: { identityClass: 'core', identityReason: 'core_identity', keepFlag: 'keep-core' },
    first_assigned_at: LATER,
    item_observed_at: LATER,
  });
}

function applyDowngrade(over: Partial<ThemeMembershipRecord> & Pick<ThemeMembershipRecord, 'id' | 'title'>) {
  return membershipRecord({
    theme_id: MASSIE_CANARY,
    source_slug: over.id,
    member_role: over.member_role || 'creator',
    metadata: {
      identityClass: 'core',
      identityReason: 'core_identity',
      membershipIsNotCorroboration: true,
      customFlag: 'keep-me',
      ...over.metadata,
    },
    first_assigned_at: LATER,
    item_observed_at: LATER,
    ...over,
  });
}

function applyReviewTheme() {
  return themeRecord({
    id: SENATE_CANARY,
    canonical_label: 'Republican Senate candidate cheating',
  });
}

function applyReviewMembers() {
  return [
    membershipRecord({
      id: 'cheat-seed',
      theme_id: SENATE_CANARY,
      source_slug: 'brian-tyler-cohen',
      title: 'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed', reviewFlag: 'leave-review' },
    }),
    membershipRecord({
      id: 'kash-hearing',
      theme_id: SENATE_CANARY,
      source_slug: 'meidastouch',
      title: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed', reviewFlag: 'leave-review' },
    }),
  ];
}

function applyCorpus(extraDowngrades: ThemeMembershipRecord[] = []) {
  const themes = [massieTheme(), applyReviewTheme()];
  const memberships = [
    massieSeed(),
    applyKeepReporting(),
    applyDowngrade({
      id: 'spaceballs',
      source_slug: 'ken-klippenstein',
      source_name: 'Ken Klippenstein',
      title: 'Spaceballs',
      summary: 'Pentagon announces space weapons 💫',
    }),
    ...extraDowngrades,
    ...applyReviewMembers(),
  ];
  return { themes, memberships, store: createMemoryThemeStore({ themes, memberships }) };
}

function frozenIdentity(row: ThemeMembershipRecord) {
  return {
    theme_id: row.theme_id,
    source_system: row.source_system,
    source_slug: row.source_slug,
    source_name: row.source_name,
    identity_key: row.identity_key,
    canonical_url: row.canonical_url,
    title: row.title,
    summary: row.summary,
    membership_confidence: row.membership_confidence,
    membership_method: row.membership_method,
    membership_reasons: row.membership_reasons,
    first_assigned_at: row.first_assigned_at,
  };
}

describe('Theme Memory guarded reclassification apply', () => {
  it('1: --apply without --expected-downgrades refuses', async () => {
    expect(parseThemeReclassifyArgs(['--apply'])).toEqual({
      dryRun: false,
      apply: true,
      expectedDowngrades: null,
    });
    expect(parseThemeReclassifyArgs(['--apply', '--expected-downgrades=19'])).toEqual({
      dryRun: false,
      apply: true,
      expectedDowngrades: 19,
    });
    await expect(runThemeMembershipReclassify({ apply: true })).rejects.toThrow(
      THEME_RECLASSIFY_EXPECTED_DOWNGRADES_REQUIRED,
    );
  });

  it('2: mismatch in expected count performs zero writes', async () => {
    const { store, memberships } = applyCorpus();
    let persistCalls = 0;
    await expect(
      runThemeMembershipReclassify({
        apply: true,
        expectedDowngrades: 19,
        rankingMode: 'shadow',
        now: APPLY_AT,
        deps: {
          store,
          persistMembership: async (row) => {
            persistCalls += 1;
            return store.upsertMembership(row);
          },
        },
      }),
    ).rejects.toThrow(themeReclassifyExpectedMismatch(19, 1));
    expect(persistCalls).toBe(0);
    const still = await store.listMemberships();
    expect(still).toHaveLength(memberships.length);
    expect(still.every((row) => row.metadata.identityClass === 'core')).toBe(true);
  });

  it('3: apply while ranking mode is not shadow refuses', async () => {
    const { store } = applyCorpus();
    let persistCalls = 0;
    await expect(
      runThemeMembershipReclassify({
        apply: true,
        expectedDowngrades: 1,
        rankingMode: 'active',
        now: APPLY_AT,
        deps: {
          store,
          persistMembership: async (row) => {
            persistCalls += 1;
            return store.upsertMembership(row);
          },
        },
      }),
    ).rejects.toThrow(THEME_RECLASSIFY_SHADOW_REQUIRED);
    expect(persistCalls).toBe(0);
    expect((await store.listMemberships()).every((row) => row.metadata.identityClass === 'core')).toBe(true);

    await expect(
      runThemeMembershipReclassify({
        apply: true,
        expectedDowngrades: 1,
        rankingMode: 'off',
        now: APPLY_AT,
        deps: { store },
      }),
    ).rejects.toThrow(THEME_RECLASSIFY_SHADOW_REQUIRED);
  });

  it('4-9: only DOWNGRADE_CONTEXTUAL rows mutate; KEEP_CORE, REVIEW, seed, and unrelated metadata stay', async () => {
    const { store } = applyCorpus();
    const before = new Map((await store.listMemberships()).map((row) => [row.id, row]));
    const report = await runThemeMembershipReclassify({
      apply: true,
      expectedDowngrades: 1,
      rankingMode: 'shadow',
      now: APPLY_AT,
      deps: { store },
    });

    expect(report.mode).toBe('apply');
    expect(report.plannedWrites).toBe(1);
    expect(report.successfulWrites).toBe(1);
    expect(report.failedWrites).toBe(0);
    expect(report.databaseWrites).toBe(1);
    expect(report.persisted).toBe(true);
    expect(report.reviewUntouchedCount).toBe(2);
    expect(report.keepCoreUntouchedCount).toBe(2);
    expect(report.rankingMode).toBe('shadow');
    expect(report.reclassificationVersion).toBe(THEME_RECLASSIFY_VERSION);
    expect(report.writes).toEqual([
      expect.objectContaining({
        membershipId: 'spaceballs',
        themeId: MASSIE_CANARY,
        status: 'success',
      }),
    ]);

    const after = new Map((await store.listMemberships()).map((row) => [row.id, row]));
    const mutated = after.get('spaceballs');
    expect(mutated?.metadata).toEqual({
      identityClass: 'contextual',
      identityReason: 'legacy_reclassified_contextual',
      membershipIsNotCorroboration: true,
      customFlag: 'keep-me',
      previousIdentityClass: 'core',
      reclassifiedAt: APPLY_AT,
      reclassificationVersion: THEME_RECLASSIFY_VERSION,
      reclassificationReasons: expect.arrayContaining(['fails_event_specific_core_admission']),
    });
    expect(frozenIdentity(mutated!)).toEqual(frozenIdentity(before.get('spaceballs')!));
    expect(mutated?.updated_at).toBe(APPLY_AT);

    for (const id of ['massie-seed', 'al-jazeera', 'cheat-seed', 'kash-hearing']) {
      const prior = before.get(id)!;
      const next = after.get(id)!;
      expect(next.metadata).toEqual(prior.metadata);
      expect(frozenIdentity(next)).toEqual(frozenIdentity(prior));
      expect(next.updated_at).toBe(prior.updated_at);
    }
    expect(after.get('massie-seed')?.metadata.identityReason).toBe('seed');
    expect(after.get('al-jazeera')?.metadata.identityClass).toBe('core');
    expect(after.get('cheat-seed')?.metadata.identityClass).toBe('core');
    expect(after.get('kash-hearing')?.metadata.reviewFlag).toBe('leave-review');
  });

  it('10: idempotent second run proposes/writes zero', async () => {
    const { store } = applyCorpus();
    const first = await runThemeMembershipReclassify({
      apply: true,
      expectedDowngrades: 1,
      rankingMode: 'shadow',
      now: APPLY_AT,
      deps: { store },
    });
    expect(first.successfulWrites).toBe(1);

    const dry = await runThemeMembershipReclassify({
      dryRun: true,
      rankingMode: 'shadow',
      deps: { store },
    });
    expect(dry.downgradeContextualCount).toBe(0);
    expect(dry.databaseWrites).toBe(0);
    expect(dry.plannedWrites).toBe(0);

    let persistCalls = 0;
    const second = await runThemeMembershipReclassify({
      apply: true,
      expectedDowngrades: 0,
      rankingMode: 'shadow',
      now: '2026-09-16T23:30:00.000Z',
      deps: {
        store,
        persistMembership: async (row) => {
          persistCalls += 1;
          return store.upsertMembership(row);
        },
      },
    });
    expect(second.plannedWrites).toBe(0);
    expect(second.successfulWrites).toBe(0);
    expect(second.failedWrites).toBe(0);
    expect(second.databaseWrites).toBe(0);
    expect(persistCalls).toBe(0);

    await expect(
      runThemeMembershipReclassify({
        apply: true,
        expectedDowngrades: 1,
        rankingMode: 'shadow',
        deps: { store },
      }),
    ).rejects.toThrow(themeReclassifyExpectedMismatch(1, 0));
  });

  it('11: dry-run still performs zero writes', async () => {
    const { store } = applyCorpus();
    let persistCalls = 0;
    const report = await runThemeMembershipReclassify({
      dryRun: true,
      rankingMode: 'shadow',
      deps: {
        store,
        persistMembership: async (row) => {
          persistCalls += 1;
          return store.upsertMembership(row);
        },
      },
    });
    expect(report.mode).toBe('dry-run');
    expect(report.downgradeContextualCount).toBe(1);
    expect(report.databaseWrites).toBe(0);
    expect(report.persisted).toBe(false);
    expect(persistCalls).toBe(0);
    expect((await store.listMemberships()).find((row) => row.id === 'spaceballs')?.metadata.identityClass).toBe(
      'core',
    );
  });

  it('12: apply result clearly reports partial failure if persistence fails', async () => {
    const extra = applyDowngrade({
      id: 'hegseth-troops',
      source_system: 'newswire',
      source_slug: 'wire',
      title: 'Pete Hegseth visits troops overseas',
      member_role: 'reporting',
    });
    const { store } = applyCorpus([extra]);
    const report = await runThemeMembershipReclassify({
      apply: true,
      expectedDowngrades: 2,
      rankingMode: 'shadow',
      now: APPLY_AT,
      deps: {
        store,
        persistMembership: async (row) => {
          if (row.id === 'hegseth-troops') throw new Error('persist failed');
          return store.upsertMembership(row);
        },
      },
    });

    expect(report.mode).toBe('apply');
    expect(report.plannedWrites).toBe(2);
    expect(report.successfulWrites).toBe(1);
    expect(report.failedWrites).toBe(1);
    expect(report.databaseWrites).toBe(1);
    expect(report.persisted).toBe(false);
    expect(report.writes.find((row) => row.membershipId === 'spaceballs')?.status).toBe('success');
    expect(report.writes.find((row) => row.membershipId === 'hegseth-troops')).toEqual(
      expect.objectContaining({ status: 'failed', error: 'persist failed' }),
    );

    const printed = formatThemeReclassifyReport(report);
    expect(printed).toContain('core -> contextual');
    expect(printed).toContain('persist: success');
    expect(printed).toMatch(/persist: failed \(persist failed\)/);
    expect(printed).toContain('Successful writes: 1');
    expect(printed).toContain('Failed writes: 1');
    expect(printed).toContain(`Reclassification version: ${THEME_RECLASSIFY_VERSION}`);

    const after = await store.listMemberships();
    expect(after.find((row) => row.id === 'spaceballs')?.metadata.identityClass).toBe('contextual');
    expect(after.find((row) => row.id === 'hegseth-troops')?.metadata.identityClass).toBe('core');
    expect(after.find((row) => row.id === 'massie-seed')?.metadata.identityClass).toBe('core');
  });
});

