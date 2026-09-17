import { describe, expect, it } from 'vitest';

import { shouldAcceptAIMembership } from '@/lib/themeMemory/ai/accept';
import { isDeterministicThemeMatch, isPlausibleThemeCandidate, scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import { extractThemeFingerprint } from '@/lib/themeMemory/features';
import {
  alignedFeaturesFromMember,
  buildThemeCoreFingerprint,
  compareCandidateToThemeCore,
  hasEventSpecificCoreIdentity,
  hasHardEventEvidence,
  identityClassForAttachment,
} from '@/lib/themeMemory/identity';
import { groupNamedEntityAnchors, independentEventAnchors, isPersonNamePair } from '@/lib/themeMemory/entityAnchors';
import { featureStrength, isGenericInstitutionalEventType, phraseStrength } from '@/lib/themeMemory/featureStrength';
import { processThemeMemory } from '@/lib/themeMemory/process';
import { createMemoryThemeStore } from '@/lib/themeMemory/store';
import type { ThemeFingerprint, ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';
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

function coreAdmission(itemTitle: string, themeTitle: string, role: 'creator' | 'reporting' | 'specialist' = 'reporting') {
  const match = matchTitles(itemTitle, themeTitle);
  return {
    match,
    identityClass: identityClassForAttachment({ item: { role }, match, seeded: false }),
  };
}

function fingerprint(over: Partial<ThemeFingerprint>): ThemeFingerprint {
  return {
    distinctiveTokens: [],
    supportingTokens: [],
    phrases: [],
    weakEntities: [],
    clusterKeys: {},
    actionHints: [],
    eventType: null,
    entitySpans: [],
    ...over,
  };
}

function matchFingerprints(item: ThemeFingerprint, themeFp: ThemeFingerprint, label = 't') {
  const match = scoreThemeCandidate({
    item,
    theme: themeFp,
    themeRecord: themeRecord({ id: `theme-${label}`, canonical_label: label }),
    itemObservedAt: NOW,
  });
  return {
    match,
    identityClass: identityClassForAttachment({ item: { role: 'reporting' }, match, seeded: false }),
  };
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

  it('classifies social boilerplate and generic event words as weak/supporting', () => {
    for (const token of ['year', 'today', 'just', 'goes', 'trying', 'make', 'again', 'short', 'shorts', 'feared', 'brutal']) {
      expect(featureStrength(token)).toBe('weak');
    }
    for (const token of ['attack', 'return', 'camera', 'fighter', 'shot', 'public', 'chance', '2028']) {
      expect(featureStrength(token)).not.toBe('strong');
    }
    expect(phraseStrength('shot down')).not.toBe('strong');
    expect(phraseStrength('year today')).toBe('weak');
    expect(phraseStrength('trump goes')).toBe('weak');
    expect(phraseStrength('could lose')).not.toBe('strong');
    expect(featureStrength('flock')).toBe('strong');
    expect(featureStrength('massie')).toBe('strong');
    expect(featureStrength('hegseth')).toBe('strong');
    expect(featureStrength('impeach')).toBe('strong');
  });

  it('1: 9/11 theme does not admit Iran crackdown via year today', () => {
    const { match, identityClass } = coreAdmission(
      'Iran launches a brutal crackdown year today',
      '9/11 Widow Blasts U.S. Cover-Up of Saudi Role in Attacks',
    );
    expect(match.sharedDistinctive).not.toEqual(expect.arrayContaining(['year', 'today']));
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('2: Lithuania/NATO drone theme does not admit Saudi fighter story via shot down', () => {
    const { match, identityClass } = coreAdmission(
      'Saudi fighter jet shot down by Houthis',
      'NATO Drone Shootdown in Lithuania',
    );
    expect(match.sharedPhrases.join(' ')).not.toMatch(/shot down/);
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('3: census theme does not admit victim commentary via trying make', () => {
    const { match, identityClass } = coreAdmission(
      'Conservative Christians are always trying to make themselves the victim.',
      'republican trying alter censu',
    );
    expect(match.sharedDistinctive).not.toEqual(expect.arrayContaining(['trying', 'make']));
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('4: data-center theme does not admit Trump GOES DARK via trump goes', () => {
    const { match, identityClass } = coreAdmission(
      'Trump GOES DARK…',
      "Trump's Data Center Rant",
    );
    expect(match.sharedPhrases.join(' ')).not.toMatch(/trump goes/);
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('5: sleep theme does not admit Melania JUST DID IT AGAIN via just again', () => {
    const { match, identityClass } = coreAdmission(
      'Melania JUST DID IT AGAIN…',
      "Trump’s Sleep Incident",
    );
    expect(match.sharedDistinctive).not.toEqual(expect.arrayContaining(['just', 'again']));
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('6: 2028 theme does not admit unrelated #shorts item', () => {
    const { match, identityClass } = coreAdmission(
      "They'll blame Biden until 2028 at this rate #shorts",
      'nobody ready 2028 seem',
    );
    expect(match.sharedDistinctive).not.toEqual(expect.arrayContaining(['short', 'shorts', '2028']));
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('7: Trump-risk theme does not admit unrelated could-lose story', () => {
    const { match, identityClass } = coreAdmission(
      'Yemen says Saudi Arabia could lose territory',
      'Trump Risk',
    );
    expect(match.sharedPhrases.join(' ')).not.toMatch(/could lose/);
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('8: Flock camera theme does not admit iPhone camera review', () => {
    const { match, identityClass } = coreAdmission(
      'iPhone camera review: the best smartphone camera yet',
      'Flock Camera Surveillance Network',
    );
    expect(match.sharedDistinctive).not.toEqual(expect.arrayContaining(['camera']));
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('Hegseth alone is not enough for Massie impeachment core', () => {
    const { match, identityClass } = coreAdmission(
      'Pete Hegseth visits troops overseas',
      'Massie moves to impeach Hegseth',
    );
    expect(match.sharedDistinctive).toEqual(['hegseth']);
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('groups Pete + Hegseth as one named entity, not two event anchors', () => {
    expect(isPersonNamePair('pete', 'hegseth')).toBe(true);
    expect(isPersonNamePair('donald', 'trump')).toBe(true);
    expect(isPersonNamePair('mitch', 'mcconnell')).toBe(true);
    expect(isPersonNamePair('colin', 'kaepernick')).toBe(true);
    expect(isPersonNamePair('massie', 'hegseth')).toBe(false);
    expect(isPersonNamePair('impeach', 'hegseth')).toBe(false);
    const grouped = groupNamedEntityAnchors(['pete', 'hegseth'], [['pete', 'hegseth']]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toEqual(['hegseth', 'pete']);
    const anchors = independentEventAnchors({
      sharedTokens: ['pete', 'hegseth'],
      sharedPhrases: ['pete hegseth'],
      entitySpans: [['pete', 'hegseth']],
    });
    expect(anchors).toHaveLength(1);
  });

  it('Massie/Hegseth theme + unrelated Hegseth story is not core', () => {
    const { match, identityClass } = coreAdmission(
      'Pete Hegseth visits troops overseas',
      'Republican congressman calls to impeach US Defence Secretary Pete Hegseth',
    );
    expect(match.sharedDistinctive).toEqual(expect.arrayContaining(['pete', 'hegseth']));
    expect(match.independentEventAnchors.length).toBeLessThan(2);
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('same Trump entity on an unrelated event is not core', () => {
    const { match, identityClass } = coreAdmission(
      'Donald Trump plays golf at Bedminster',
      'Donald Trump classified documents indictment unsealed',
    );
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('same McConnell entity on an unrelated event is not core', () => {
    const { match, identityClass } = coreAdmission(
      'Mitch McConnell attends Kentucky fundraiser',
      'Mitch McConnell announces Senate retirement',
    );
    expect(hasEventSpecificCoreIdentity(match)).toBe(false);
    expect(identityClass).toBe('contextual');
  });

  it('two lexical tokens from one full name are not enough for core', () => {
    const pete = coreAdmission(
      'Pete Hegseth visits troops overseas',
      'Pete Hegseth holds a Pentagon briefing',
    );
    expect(pete.match.sharedDistinctive).toEqual(expect.arrayContaining(['pete', 'hegseth']));
    expect(pete.match.independentEventAnchors).toHaveLength(1);
    expect(hasEventSpecificCoreIdentity(pete.match)).toBe(false);
    expect(pete.identityClass).toBe('contextual');

    const colin = coreAdmission(
      'Colin Kaepernick signs a new endorsement deal',
      'Colin Kaepernick takes a knee during the anthem',
    );
    expect(colin.match.sharedDistinctive).toEqual(expect.arrayContaining(['colin', 'kaepernick']));
    expect(hasEventSpecificCoreIdentity(colin.match)).toBe(false);
    expect(colin.identityClass).toBe('contextual');
  });

  it('9: Flock Camera + Hackers Got Inside a Flock Camera is core', async () => {
    const scored = coreAdmission(
      'Hackers Got Inside a Flock Camera',
      'Flock Camera Surveillance Network',
    );
    expect(scored.match.sharedDistinctive).toContain('flock');
    expect(scored.identityClass).toBe('core');

    const store = createMemoryThemeStore();
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'ken-klippenstein',
          name: 'Ken Klippenstein',
          title: 'Flock Camera Surveillance Network',
          publishedAt: NOW,
          id: 'flock-seed',
        }),
        newswireCandidate({
          slug: '404media',
          source: '404 Media',
          title: 'Hackers Got Inside a Flock Camera',
          url: 'https://404media.test/flock-camera',
          publishedAt: NOW,
        }),
      ],
      store,
      ai: createTestThemeAIProvider(),
      now: NOW,
    });
    const attached = (await store.listMemberships()).find((row) => row.source_slug === '404media');
    expect(attached?.metadata.identityClass).toBe('core');
  });

  it('10: Fed/rates creator seed + US Fed raises interest rates is core', async () => {
    const scored = coreAdmission(
      'US Fed raises interest rates',
      'The Fed is raising interest rates — here is what it means',
    );
    expect(scored.identityClass).toBe('core');

    const store = createMemoryThemeStore();
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'david-pakman',
          name: 'David Pakman',
          title: 'The Fed is raising interest rates — here is what it means',
          publishedAt: NOW,
          id: 'fed-seed',
        }),
        newswireCandidate({
          slug: 'reuters',
          source: 'Reuters',
          title: 'US Fed raises interest rates',
          url: 'https://reuters.test/fed-rates',
          publishedAt: NOW,
        }),
      ],
      store,
      ai: createTestThemeAIProvider(),
      now: NOW,
    });
    const attached = (await store.listMemberships()).find((row) => row.source_slug === 'reuters');
    expect(attached?.metadata.identityClass).toBe('core');
  });

  it('11: Russian oligarch/Trump Jr wedding reporting is core', async () => {
    const scored = coreAdmission(
      'Reporting on Trump Jr wedding with Russian oligarch',
      "Russian oligarch attends Trump Jr's wedding",
    );
    expect(scored.identityClass).toBe('core');

    const store = createMemoryThemeStore();
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'meidastouch',
          name: 'MeidasTouch',
          title: "Russian oligarch attends Trump Jr's wedding",
          publishedAt: NOW,
          id: 'wedding-seed',
        }),
        newswireCandidate({
          slug: 'ap',
          source: 'AP',
          title: 'Reporting on Trump Jr wedding with Russian oligarch',
          url: 'https://ap.test/trump-jr-wedding',
          publishedAt: NOW,
        }),
      ],
      store,
      ai: createTestThemeAIProvider(),
      now: NOW,
    });
    const attached = (await store.listMemberships()).find((row) => row.source_slug === 'ap');
    expect(attached?.metadata.identityClass).toBe('core');
  });

  it('12: Massie/Hegseth impeachment coverage with event anchors is core', () => {
    const scored = coreAdmission(
      'Republican congressman calls to impeach US Defence Secretary Pete Hegseth',
      'BREAKING: Rep. Massie moves to IMPEACH Hegseth',
    );
    expect(scored.match.sharedDistinctive).toEqual(expect.arrayContaining(['impeach', 'hegseth']));
    expect(scored.identityClass).toBe('core');
  });

  it('13: Hegseth + impeachment coverage is core', () => {
    const scored = coreAdmission(
      'House files articles of impeachment against Hegseth',
      'Massie moves to impeach Hegseth',
    );
    expect(scored.match.sharedDistinctive).toEqual(expect.arrayContaining(['impeach', 'hegseth']));
    expect(hasEventSpecificCoreIdentity(scored.match)).toBe(true);
    expect(scored.identityClass).toBe('core');
  });

  it('14: same concrete event with different wording remains core', () => {
    const scored = coreAdmission(
      'Coverage of the Hegseth impeachment resolution in the House',
      'Rep. Massie moves to IMPEACH Hegseth',
    );
    expect(hasEventSpecificCoreIdentity(scored.match)).toBe(true);
    expect(scored.identityClass).toBe('core');
  });

  it('CE1: Trump Pushing AI theme does not admit an unrelated money/push economic item as core', () => {
    const scored = coreAdmission(
      'Syrian fuel-price protests as money dries up and officials push new fees',
      'Why Is Trump Pushing AI? Follow the Money.',
    );
    expect(scored.match.sharedDistinctive).toEqual(expect.arrayContaining(['money', 'push']));
    expect(scored.match.sharedPhrases).toHaveLength(0);
    expect(scored.match.reasons.join(' ')).toMatch(/aligned_event_anchors/);
    expect(hasHardEventEvidence(scored.match)).toBe(false);
    expect(hasEventSpecificCoreIdentity(scored.match)).toBe(false);
    expect(isPlausibleThemeCandidate(scored.match)).toBe(true);
    expect(scored.identityClass).toBe('contextual');
  });

  it('CE2: two standalone strong lexical tokens with no phrase/action/cluster are not core', () => {
    const scored = matchFingerprints(
      fingerprint({ distinctiveTokens: ['reason', 'want'] }),
      fingerprint({ distinctiveTokens: ['reason', 'want'] }),
      'lexical-pair',
    );
    expect(scored.match.sharedDistinctive).toEqual(['reason', 'want']);
    expect(scored.match.sharedPhrases).toHaveLength(0);
    expect(scored.match.sharedClusterKeys).toHaveLength(0);
    expect(scored.match.independentEventAnchors.length).toBeGreaterThanOrEqual(2);
    expect(hasHardEventEvidence(scored.match)).toBe(false);
    expect(hasEventSpecificCoreIdentity(scored.match)).toBe(false);
    expect(scored.identityClass).toBe('contextual');
  });

  it('CE3: same person only remains contextual', () => {
    for (const [item, theme] of [
      ['Pete Hegseth visits troops overseas', 'Pete Hegseth holds a Pentagon briefing'],
      ['Donald Trump plays golf at Bedminster', 'Donald Trump classified documents indictment unsealed'],
      ['Mitch McConnell attends Kentucky fundraiser', 'Mitch McConnell announces Senate retirement'],
    ] as const) {
      const scored = coreAdmission(item, theme);
      expect(hasHardEventEvidence(scored.match)).toBe(false);
      expect(hasEventSpecificCoreIdentity(scored.match)).toBe(false);
      expect(scored.identityClass).toBe('contextual');
    }
  });

  it('CE4: broad abstract lexical overlap is not core', () => {
    const pairs = [
      ['they want to destroy everything', 'everything they destroy is gone'],
      ['price problem in local markets', 'price problem hits households'],
      ['everything they want is a reason to wait', 'reason people want change now'],
    ] as const;
    for (const [item, theme] of pairs) {
      const scored = coreAdmission(item, theme);
      expect(hasHardEventEvidence(scored.match)).toBe(false);
      expect(hasEventSpecificCoreIdentity(scored.match)).toBe(false);
      expect(scored.identityClass).toBe('contextual');
    }
  });

  it('CE5: Massie/Hegseth impeachment coverage with impeachment event anchor is core', () => {
    const scored = coreAdmission(
      'Republican congressman calls to impeach US Defence Secretary Pete Hegseth',
      'BREAKING: Rep. Massie moves to IMPEACH Hegseth',
    );
    expect(hasHardEventEvidence(scored.match)).toBe(true);
    expect(scored.match.sharedDistinctive).toEqual(expect.arrayContaining(['impeach', 'hegseth']));
    expect(scored.identityClass).toBe('core');
  });

  it('CE6: Flock-camera hacking coverage sharing a strong event/object phrase is core', () => {
    const scored = coreAdmission('Hackers Got Inside a Flock Camera', 'Flock Camera Surveillance Network');
    expect(scored.match.sharedPhrases.join(' ')).toMatch(/flock camera/);
    expect(hasHardEventEvidence(scored.match)).toBe(true);
    expect(scored.identityClass).toBe('core');
  });

  it('CE7: Federal Reserve interest-rate coverage is core', () => {
    const scored = coreAdmission(
      'US Fed raises interest rates',
      'The Fed is raising interest rates — here is what it means',
    );
    expect(hasHardEventEvidence(scored.match)).toBe(true);
    expect(scored.identityClass).toBe('core');
  });

  it('CE8: same concrete event with differing wording but a shared cluster key is core', () => {
    const scored = matchFingerprints(
      extractThemeFingerprint({
        title: 'Congressional Research Service summary of the new bill',
        canonicalUrl: 'https://congress.gov/bill/details/BILLS-119hr1234',
      }),
      extractThemeFingerprint({
        title: 'House files the same bill text',
        canonicalUrl: 'https://congress.gov/bill/details/BILLS-119hr1234',
      }),
      'bill-cluster',
    );
    expect(scored.match.sharedClusterKeys).toEqual(['bill:119-hr-1234']);
    expect(scored.match.sharedDistinctive).toHaveLength(0);
    expect(hasHardEventEvidence(scored.match)).toBe(true);
    expect(hasEventSpecificCoreIdentity(scored.match)).toBe(true);
    expect(scored.identityClass).toBe('core');
  });

  it('generic institutional document types are supporting, not hard-event identity', () => {
    expect(featureStrength('executive')).toBe('supporting');
    expect(isGenericInstitutionalEventType('executive order')).toBe(true);
    expect(isGenericInstitutionalEventType('court ruling')).toBe(true);
    expect(isGenericInstitutionalEventType('supreme court ruling')).toBe(true);
    expect(isGenericInstitutionalEventType('court order')).toBe(true);
    expect(isGenericInstitutionalEventType('federal rule')).toBe(true);
    expect(isGenericInstitutionalEventType('federal regulation')).toBe(true);
    expect(isGenericInstitutionalEventType('congressional hearing')).toBe(true);
    expect(isGenericInstitutionalEventType('senate hearing')).toBe(true);
    expect(isGenericInstitutionalEventType('house hearing')).toBe(true);
    expect(isGenericInstitutionalEventType('federal lawsuit')).toBe(true);
    expect(isGenericInstitutionalEventType('presidential memorandum')).toBe(true);
    expect(phraseStrength('executive order')).toBe('supporting');
    expect(phraseStrength('congressional hearing')).toBe('supporting');
    expect(isGenericInstitutionalEventType('congressional map')).toBe(false);
    expect(isGenericInstitutionalEventType('birthright citizenship')).toBe(false);
  });

  it('executive order alone does not make unrelated orders CORE', () => {
    const themeTitle = "Supreme Court Blocks Trump’s Executive Order";
    const unrelated = [
      'White House issues executive order on electrical grid reliability',
      'New executive order targets voting procedures in several states',
      'President signs executive order on federal contracting rules',
      'Executive order directs agencies to rewrite environmental reviews',
      'Administration executive order on student loan servicing',
    ];
    for (const itemTitle of unrelated) {
      const scored = coreAdmission(itemTitle, themeTitle);
      expect(scored.match.sharedPhrases.join(' ')).not.toMatch(/executive order/);
      expect(hasEventSpecificCoreIdentity(scored.match)).toBe(false);
      expect(isDeterministicThemeMatch(scored.match)).toBe(false);
      expect(scored.identityClass).toBe('contextual');
    }
  });

  it('executive order plus the same specific policy object can still be CORE', () => {
    const scored = coreAdmission(
      'Appeals court reviews the birthright citizenship policy',
      'Supreme Court fight over the birthright citizenship policy',
    );
    expect(scored.match.sharedPhrases.join(' ')).toMatch(/birthright citizenship/);
    expect(hasHardEventEvidence(scored.match)).toBe(true);
    expect(hasEventSpecificCoreIdentity(scored.match)).toBe(true);
    expect(scored.identityClass).toBe('core');
  });

  it('Supreme Court ruling alone is not CORE', () => {
    const generic = coreAdmission(
      'Analysts debate a new Supreme Court ruling',
      'Supreme Court issues a major ruling today',
    );
    expect(hasEventSpecificCoreIdentity(generic.match)).toBe(false);
    expect(isDeterministicThemeMatch(generic.match)).toBe(false);
    expect(generic.identityClass).toBe('contextual');
  });
});
