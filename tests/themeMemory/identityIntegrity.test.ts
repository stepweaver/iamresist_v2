import { describe, expect, it } from 'vitest';

import { shouldAcceptAIMembership } from '@/lib/themeMemory/ai/accept';
import { isDeterministicThemeMatch, isPlausibleThemeCandidate, scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import { extractThemeFingerprint } from '@/lib/themeMemory/features';
import {
  alignedFeaturesFromMember,
  buildThemeCoreFingerprint,
  compareCandidateToThemeCore,
} from '@/lib/themeMemory/identity';
import { processThemeMemory } from '@/lib/themeMemory/process';
import { createMemoryThemeStore } from '@/lib/themeMemory/store';
import type { ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';
import { createTestThemeAIProvider, newswireCandidate, voiceCandidate } from './helpers';

const NOW = '2026-09-15T16:00:00.000Z';

function themeRecord(over: Partial<ThemeRecord> & Pick<ThemeRecord, 'id' | 'canonical_label'>): ThemeRecord {
  return {
    slug: over.id,
    display_headline: over.canonical_label,
    summary: over.canonical_label,
    first_seen_at: NOW,
    last_seen_at: NOW,
    lifecycle_status: 'new',
    metadata: {
      seededItemKey: over.metadata?.seededItemKey,
      creatorSeedStrength: 'single',
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
    source_system: 'voice',
    source_slug: over.source_slug || over.id,
    source_name: over.source_name || over.source_slug || over.id,
    identity_key: `url:${over.id}`,
    canonical_url: `https://example.test/${over.id}`,
    summary: over.summary ?? null,
    published_at: NOW,
    item_observed_at: NOW,
    membership_confidence: 1,
    membership_method: 'deterministic',
    membership_reasons: over.membership_reasons || ['seeded_creator_led_theme'],
    content_hash: over.id,
    classification_version: 'tm-classify-v3',
    membership_prompt_version: null,
    provenance_class: null,
    desk_lane: null,
    source_family: 'general',
    first_assigned_at: NOW,
    last_confirmed_at: NOW,
    metadata: over.metadata || { identityClass: 'core', identityReason: 'seed' },
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function matchTitles(itemTitle: string, themeTitle: string, label = 't') {
  return scoreThemeCandidate({
    item: extractThemeFingerprint({ title: itemTitle, summary: itemTitle }),
    theme: extractThemeFingerprint({ title: themeTitle, summary: themeTitle }),
    themeRecord: themeRecord({ id: `theme-${label}`, canonical_label: label }),
    itemObservedAt: NOW,
  });
}

describe('Theme Memory identity integrity', () => {
  it('A: Massie/Hegseth reporting attaches with event-level anchors', async () => {
    const store = createMemoryThemeStore();
    const seed = voiceCandidate({
      slug: 'meidastouch',
      name: 'MeidasTouch',
      title: 'BREAKING: Rep. Massie moves to IMPEACH Hegseth',
      publishedAt: NOW,
      id: 'massie-seed',
    });
    const reporting = newswireCandidate({
      slug: 'al-jazeera',
      source: 'Al Jazeera',
      title: 'Republican congressman calls to impeach US Defence Secretary Pete Hegseth',
      url: 'https://aljazeera.test/massie-hegseth',
      publishedAt: NOW,
    });
    const result = await processThemeMemory({
      items: [seed, reporting],
      store,
      ai: createTestThemeAIProvider(),
      now: NOW,
    });
    const themes = await store.listThemes();
    const members = await store.listMemberships();
    expect(themes).toHaveLength(1);
    expect(members).toHaveLength(2);
    const attached = members.find((row) => row.source_slug === 'al-jazeera');
    expect(attached).toBeTruthy();
    expect(attached?.membership_confidence).toBeGreaterThanOrEqual(0.8);
    const scored = matchTitles(
      reporting.title,
      seed.title,
      'massie',
    );
    expect(scored.sharedDistinctive).toEqual(expect.arrayContaining(['impeach', 'hegseth']));
    expect(scored.distinctiveAnchor).toBe(true);
    expect(result.diagnostics.newswireMembersAttached).toBe(1);
  });

  it('B: Spaceballs does not attach after a mixed-topic member mentions space weapons', async () => {
    const seed = membershipRecord({
      id: 'massie-seed',
      theme_id: 'theme-massie',
      source_slug: 'meidastouch',
      source_name: 'MeidasTouch',
      title: 'BREAKING: Rep. Massie moves to IMPEACH Hegseth',
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed' },
    });
    const mixed = membershipRecord({
      id: 'mixed-impeachments',
      theme_id: 'theme-massie',
      source_slug: 'creator-roundup',
      source_name: 'Creator Roundup',
      title: 'Space Weapons, Impeachments, and... Animality? #latestnews',
      member_role: 'creator',
      membership_reasons: ['ai_overlap'],
      metadata: { identityClass: 'contextual', identityReason: 'contextual' },
    });
    const theme = themeRecord({
      id: 'theme-massie',
      canonical_label: 'Massie Moves to Impeach Hegseth',
      metadata: { seededItemKey: 'voice:meidastouch:url:massie-seed' },
    });
    const core = buildThemeCoreFingerprint(theme, [seed, mixed]);
    expect(core.distinctiveTokens).toEqual(expect.arrayContaining(['massie', 'impeach', 'hegseth']));
    expect(core.distinctiveTokens.join(' ')).not.toMatch(/space|weapon/);
    expect(core.phrases.join(' ')).not.toMatch(/space weapon/);

    const store = createMemoryThemeStore({ themes: [theme], memberships: [seed, mixed] });
    const spaceballs = voiceCandidate({
      slug: 'ken-klippenstein',
      name: 'Ken Klippenstein',
      title: 'Spaceballs',
      summary: 'Pentagon announces space weapons 💫',
      publishedAt: NOW,
      id: 'spaceballs',
    });
    await processThemeMemory({
      items: [spaceballs],
      store,
      ai: createTestThemeAIProvider({ mode: 'overlap' }),
      now: NOW,
    });
    const attached = (await store.listMemberships()).filter((row) => row.theme_id === 'theme-massie');
    expect(attached.some((row) => /spaceballs/i.test(row.title))).toBe(false);
    const spaceballsMember = (await store.listMemberships()).find((row) => row.source_slug === 'ken-klippenstein');
    expect(spaceballsMember?.theme_id === 'theme-massie').toBeFalsy();
  });

  it('C: Republican Senate generic descriptors do not attach the Mike Rogers opioid article', async () => {
    const store = createMemoryThemeStore();
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'brian-tyler-cohen',
          name: 'Brian Tyler Cohen',
          title: 'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
          publishedAt: NOW,
          id: 'cheat-seed',
        }),
        newswireCandidate({
          slug: 'drop-site-news',
          source: 'Drop Site News',
          title: "Got Oxy? How Michigan’s Mike Rogers Helped Fuel the Opioid Crisis",
          url: 'https://dropsitenews.test/mike-rogers-opioid',
          publishedAt: NOW,
        }),
      ],
      store,
      ai: createTestThemeAIProvider({
        classify: async () => ({
          belongs: true,
          confidence: 0.9,
          reasons: ['both concern a Republican Senate candidate'],
        }),
      }),
      now: NOW,
    });
    const members = await store.listMemberships();
    expect(members.some((row) => /opioid|mike rogers/i.test(row.title))).toBe(false);
    const scored = matchTitles(
      "Got Oxy? How Michigan’s Mike Rogers Helped Fuel the Opioid Crisis",
      'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
    );
    expect(isDeterministicThemeMatch(scored)).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
  });

  it('D: Kash Patel Senate hearing does not attach to the debate-cheating theme', async () => {
    const store = createMemoryThemeStore();
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'brian-tyler-cohen',
          name: 'Brian Tyler Cohen',
          title: 'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
          publishedAt: NOW,
          id: 'cheat-seed',
        }),
        voiceCandidate({
          slug: 'meidastouch',
          name: 'MeidasTouch',
          title: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
          publishedAt: NOW,
          id: 'kash-hearing',
        }),
      ],
      store,
      ai: createTestThemeAIProvider({
        classify: async () => ({
          belongs: true,
          confidence: 0.91,
          reasons: ["The source discusses a bizarre defense related to a 'cheat' during a Senate hearing."],
        }),
      }),
      now: NOW,
    });
    const themes = await store.listThemes();
    const cheatTheme = themes.find((row) => /cheat|debate/i.test(row.canonical_label) || /cheat/i.test(row.summary || ''));
    const members = await store.listMemberships();
    const kash = members.find((row) => /kash patel/i.test(row.title));
    expect(kash?.theme_id === cheatTheme?.id).toBeFalsy();
    expect(themes.length).toBeGreaterThanOrEqual(2);
  });

  it('E: contextual Kash Patel vocabulary does not pull in a later Kash Patel item', async () => {
    const seed = membershipRecord({
      id: 'cheat-seed',
      theme_id: 'theme-cheat',
      source_slug: 'brian-tyler-cohen',
      title: 'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
      member_role: 'creator',
    });
    const contextual = membershipRecord({
      id: 'kash-context',
      theme_id: 'theme-cheat',
      source_slug: 'meidastouch',
      title: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
      member_role: 'creator',
      membership_reasons: ['ai_false_positive'],
      metadata: { identityClass: 'contextual', identityReason: 'contextual' },
    });
    const theme = themeRecord({
      id: 'theme-cheat',
      canonical_label: 'Republican Senate candidate cheating',
      metadata: { seededItemKey: 'voice:brian-tyler-cohen:url:cheat-seed' },
    });
    const core = buildThemeCoreFingerprint(theme, [seed, contextual]);
    expect(core.distinctiveTokens.join(' ')).not.toMatch(/patel|kash|beast/);

    const store = createMemoryThemeStore({ themes: [theme], memberships: [seed, contextual] });
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'brian-tyler-cohen',
          name: 'Brian Tyler Cohen',
          title: 'OMG: Kash Patel HUMILIATED by his OWN PARTY | Another Day',
          publishedAt: NOW,
          id: 'kash-humiliated',
        }),
      ],
      store,
      ai: createTestThemeAIProvider({ mode: 'overlap' }),
      now: NOW,
    });
    const later = (await store.listMemberships()).find((row) => /humiliated/i.test(row.title));
    expect(later?.theme_id === 'theme-cheat').toBeFalsy();
  });

  it('F: generic Supreme Court overlap does not merge unrelated cases', async () => {
    const scored = compareCandidateToThemeCore({
      item: extractThemeFingerprint({
        title: 'Supreme Court issues major ruling in unrelated emergency tariff dispute',
        summary: 'Justices handed down a bombshell decision.',
      }),
      theme: themeRecord({
        id: 'theme-missouri',
        canonical_label: 'Supreme Court blocks Missouri congressional map',
      }),
      memberships: [
        membershipRecord({
          id: 'missouri-seed',
          theme_id: 'theme-missouri',
          source_slug: 'democracy-docket',
          title: 'Supreme Court blocks Missouri congressional map',
          member_role: 'creator',
        }),
      ],
      itemObservedAt: NOW,
    });
    expect(scored.distinctiveAnchor).toBe(false);
    expect(isPlausibleThemeCandidate(scored)).toBe(false);
    expect(isDeterministicThemeMatch(scored)).toBe(false);
  });

  it('G: the same Missouri congressional-map Supreme Court case still attaches', async () => {
    const store = createMemoryThemeStore();
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'democracy-docket',
          name: 'Democracy Docket',
          title: 'Supreme Court blocks Missouri congressional map',
          publishedAt: NOW,
          id: 'missouri-seed',
        }),
        newswireCandidate({
          slug: 'ap',
          source: 'AP',
          title: "Justices halt Missouri's congressional map ahead of elections",
          url: 'https://ap.test/missouri-map',
          publishedAt: NOW,
        }),
      ],
      store,
      ai: createTestThemeAIProvider(),
      now: NOW,
    });
    const members = await store.listMemberships();
    expect(members).toHaveLength(2);
    expect(members.some((row) => row.source_slug === 'ap')).toBe(true);
    const scored = matchTitles(
      "Justices halt Missouri's congressional map ahead of elections",
      'Supreme Court blocks Missouri congressional map',
    );
    expect(scored.sharedDistinctive).toEqual(expect.arrayContaining(['missouri', 'congressional']));
    expect(isPlausibleThemeCandidate(scored)).toBe(true);
  });

  it('does not copy mixed-topic vocabulary into the core fingerprint', () => {
    const seedFp = extractThemeFingerprint({ title: 'BREAKING: Rep. Massie moves to IMPEACH Hegseth' });
    const mixedFp = extractThemeFingerprint({
      title: 'Space Weapons, Impeachments, and... Animality? #latestnews',
    });
    const aligned = alignedFeaturesFromMember(mixedFp, seedFp);
    expect(aligned.distinctiveTokens).not.toEqual(expect.arrayContaining(['space', 'weapon']));
    expect(aligned.phrases.join(' ')).not.toMatch(/space weapon/);
    expect(aligned.distinctiveTokens).toEqual(expect.arrayContaining(['impeach']));
  });

  it('rejects AI membership that invents a cheat bridge without shared core anchors', () => {
    const match = scoreThemeCandidate({
      item: extractThemeFingerprint({
        title: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
      }),
      theme: extractThemeFingerprint({
        title: 'Republican Senate candidate CHEATS OFF Democratic opponent during debate',
      }),
      themeRecord: themeRecord({ id: 'theme-cheat', canonical_label: 'senate cheating' }),
      itemObservedAt: NOW,
    });
    const accepted = shouldAcceptAIMembership({
      decision: {
        belongs: true,
        confidence: 0.92,
        reasons: ["The source discusses a bizarre defense related to a 'cheat' during a Senate hearing."],
      },
      match,
      classifyInput: {
        itemTitle: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
        itemSummary: null,
        itemRole: 'creator',
        itemSourceSystem: 'voice',
        itemSourceName: 'MeidasTouch',
        themeLabel: 'Republican Senate candidate cheating',
        themeHeadline: null,
        themeMemberTitles: ['Republican Senate candidate CHEATS OFF Democratic opponent during debate'],
        themeCoreAnchors: [],
        fingerprintOverlap: {
          sharedDistinctive: match.sharedDistinctive,
          sharedPhrases: match.sharedPhrases,
          reasons: match.reasons,
        },
        itemFingerprint: extractThemeFingerprint({
          title: "Kash Patel's Bizarre Beastiality Defense During Senate Hearing",
        }),
      },
    });
    expect(accepted.accept).toBe(false);
  });
});
