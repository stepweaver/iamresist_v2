import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_MEMBERSHIP_IS_NOT_CORROBORATION, themeClassificationCacheVersion } from '@/lib/themeMemory/constants';
import { processThemeMemory } from '@/lib/themeMemory/process';
import { getActiveThemes, getThemeAttentionForItem, getThemeMembers } from '@/lib/themeMemory/readModel';
import { analysisIsCurrent, createMemoryThemeStore } from '@/lib/themeMemory/store';
import { createDeterministicThemeAIProvider } from '@/lib/themeMemory/ai/deterministic';
import { ThemeAIValidationError } from '@/lib/themeMemory/ai/types';
import { createTestThemeAIProvider, intelCandidate, newswireCandidate, voiceCandidate } from './helpers';

const DAY1 = '2026-09-01T16:00:00.000Z';
const DAY2 = '2026-09-02T16:00:00.000Z';
const DAY3 = '2026-09-03T16:00:00.000Z';
const DAY4 = '2026-09-04T16:00:00.000Z';
const DAY14 = '2026-09-14T16:00:00.000Z';
const DAY15 = '2026-09-15T16:00:00.000Z';

describe('Theme Memory processing pipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('A: keeps multiple related episodes from the same creator on one theme', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        name: 'David Pakman',
        title: 'Court challenges the federal tariff plan',
        publishedAt: DAY1,
        id: 'pakman-d1',
      }),
      voiceCandidate({
        slug: 'david-pakman',
        name: 'David Pakman',
        title: 'Appeals court hears tariff authority case',
        publishedAt: DAY2,
        id: 'pakman-d2',
      }),
      voiceCandidate({
        slug: 'david-pakman',
        name: 'David Pakman',
        title: 'Administration seeks emergency review of tariff ruling',
        publishedAt: DAY3,
        id: 'pakman-d3',
      }),
    ];

    await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY3 });
    const themes = await store.listThemes();
    const members = await store.listMemberships();
    expect(themes.length).toBe(1);
    expect(members).toHaveLength(3);
    expect(new Set(members.map((row) => row.canonical_url)).size).toBe(3);
  });

  it('B: one creator-led theme from three distinct creators is not treated as corroboration', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'meidastouch',
        name: 'MeidasTouch',
        title: 'Federal troops deployment authority explained',
        publishedAt: DAY1,
        id: 'meidas-d1',
      }),
      voiceCandidate({
        slug: 'david-pakman',
        name: 'David Pakman',
        title: 'Can the president deploy federal forces domestically?',
        publishedAt: DAY2,
        id: 'pakman-d2',
      }),
      voiceCandidate({
        slug: 'brian-tyler-cohen',
        name: 'Brian Tyler Cohen',
        title: 'Legal limits on federal deployment',
        publishedAt: DAY3,
        id: 'btc-d3',
      }),
    ];
    await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY3 });
    const themes = await store.listThemes();
    const members = (await store.listMemberships()).filter((row) => row.member_role === 'creator');
    expect(themes.length).toBe(1);
    expect(new Set(members.map((row) => row.source_slug)).size).toBe(3);
    expect(members.every((row) => row.metadata.membershipIsNotCorroboration === true)).toBe(true);
    expect(THEME_MEMBERSHIP_IS_NOT_CORROBORATION).toBe(true);
  });

  it('C: same politician on unrelated issues stays on separate themes', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Trump tariff plan announced',
        publishedAt: DAY1,
        id: 'tariff',
      }),
      voiceCandidate({
        slug: 'meidastouch',
        title: 'Trump immigration raid in Chicago',
        publishedAt: DAY1,
        id: 'raid',
      }),
    ];
    await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY1 });
    const themes = await store.listThemes();
    expect(themes.length).toBe(2);
  });

  it('D: persistent identity survives title changes across days', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'meidastouch',
        title: 'Trump tariff plan challenged',
        publishedAt: DAY1,
        id: 't1',
      }),
      voiceCandidate({
        slug: 'brian-tyler-cohen',
        title: 'Appeals court hears tariff authority case',
        publishedAt: DAY2,
        id: 't2',
      }),
      voiceCandidate({
        slug: 'democracy-docket',
        title: 'Administration seeks emergency review of tariff ruling',
        publishedAt: DAY3,
        id: 't3',
      }),
    ];
    await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY3 });
    expect(await store.listThemes()).toHaveLength(1);
    expect(await store.listMemberships()).toHaveLength(3);
  });

  it('E: Newswire attaches as reporting and does not become creator signal', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Federal deployment authority dispute continues',
        publishedAt: DAY1,
        id: 'c1',
      }),
      newswireCandidate({
        slug: 'the-intercept',
        source: 'The Intercept',
        title: 'Legal fight over federal deployment authority widens',
        url: 'https://theintercept.test/deployment',
        publishedAt: DAY2,
      }),
    ];
    const result = await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY2 });
    const members = await store.listMemberships();
    expect(result.diagnostics.newswireMembersAttached).toBe(1);
    expect(members.filter((row) => row.member_role === 'reporting')).toHaveLength(1);
    expect(members.filter((row) => row.member_role === 'creator')).toHaveLength(1);
    const signals = await store.listSignals();
    expect(signals[0]?.creator_breadth).toBe(1);
    expect(signals[0]?.creator_count).toBe(0);
    expect(signals[0]?.newswire_item_count).toBe(1);
  });

  it('F: primary Intel attaches as primary and does not verify every theme claim', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Federal deployment authority dispute continues',
        publishedAt: DAY1,
        id: 'c1',
      }),
      intelCandidate({
        id: 'intel-primary-1',
        slug: 'federal-register',
        title: 'Primary record on federal deployment authority',
        url: 'https://federalregister.gov/d/2026-deploy',
        publishedAt: DAY2,
        provenance: 'PRIMARY',
      }),
    ];
    const result = await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY2 });
    expect(result.diagnostics.primaryMembersAttached).toBe(1);
    const signal = (await store.listSignals())[0];
    expect(signal?.primary_source_count).toBe(1);
    expect(signal?.metadata.evidenceDepthMeans).toBe(
      'related_primary_specialist_reporting_context_not_claim_verification',
    );
  });

  it('G: specialist Intel attaches as specialist', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'meidastouch',
        title: 'Surveillance reauthorization fight explained',
        publishedAt: DAY1,
        id: 'c1',
      }),
      intelCandidate({
        id: 'intel-spec-1',
        slug: 'lawfare',
        title: 'Specialist analysis of surveillance reauthorization',
        url: 'https://lawfare.test/surveillance',
        publishedAt: DAY2,
        provenance: 'SPECIALIST',
      }),
    ];
    const result = await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY2 });
    expect(result.diagnostics.specialistMembersAttached).toBe(1);
    expect((await store.listMemberships()).some((row) => row.member_role === 'specialist')).toBe(true);
  });

  it('H: syndicated Newswire duplicates do not inflate source breadth', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Appeals court hears tariff authority case',
        publishedAt: DAY1,
        id: 'c1',
      }),
      newswireCandidate({
        slug: 'ap',
        title: 'Appeals court hears tariff authority case',
        url: 'https://ap.test/tariff-case',
        publishedAt: DAY1,
      }),
      newswireCandidate({
        slug: 'local-paper',
        title: 'Appeals court hears tariff authority case',
        url: 'https://local.test/tariff-syndicate',
        publishedAt: DAY1,
      }),
    ];
    await processThemeMemory({ items, store, ai: createTestThemeAIProvider(), now: DAY1 });
    const signal = (await store.listSignals())[0];
    expect(signal?.newswire_item_count).toBe(2);
    expect(signal?.newswire_source_count).toBe(1);
  });

  it('I: malformed AI output is rejected and the pipeline continues', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Federal deployment authority dispute continues',
        publishedAt: DAY1,
        id: 'c1',
      }),
      voiceCandidate({
        slug: 'meidastouch',
        title: 'Legal limits on federal deployment',
        publishedAt: DAY2,
        id: 'c2',
      }),
    ];
    const warns: unknown[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warns.push(args);
    });
    const result = await processThemeMemory({
      items,
      store,
      ai: createTestThemeAIProvider({ mode: 'malformed' }),
      now: DAY2,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics.aiFailures).toBeGreaterThan(0);
    expect(result.diagnostics.aiFailureCategories.validation).toBeGreaterThan(0);
    expect(result.diagnostics.aiFailureCategories.unavailable).toBe(0);
    expect(result.diagnostics.aiFailureReasons.canonicalLabel_not_string).toBeGreaterThan(0);
    expect((await store.listThemes()).length).toBeGreaterThanOrEqual(1);
    const serialized = JSON.stringify({ diagnostics: result.diagnostics, warns });
    expect(serialized).toMatch(/belongs_not_boolean|canonicalLabel_not_string/);
    expect(serialized).not.toMatch(/Federal deployment|Legal limits on federal deployment|sk-|API_KEY/i);
  });

  it('records membership validation codes without leaking item text', async () => {
    const warns: unknown[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warns.push(args);
    });
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'meidastouch',
        name: 'MeidasTouch',
        title: 'Federal troops deployment authority explained',
        publishedAt: DAY1,
        id: 'meidas-d1',
      }),
      voiceCandidate({
        slug: 'david-pakman',
        name: 'David Pakman',
        title: 'Can the president deploy federal forces domestically?',
        publishedAt: DAY2,
        id: 'pakman-d2',
      }),
    ];
    const result = await processThemeMemory({
      items,
      store,
      ai: createTestThemeAIProvider({
        classify: async () => {
          throw new ThemeAIValidationError('confidence_not_number');
        },
      }),
      now: DAY2,
    });
    expect(result.diagnostics.aiFailureReasons.confidence_not_number).toBeGreaterThan(0);
    expect(result.diagnostics.aiFailureCategories.validation).toBeGreaterThan(0);
    const serialized = JSON.stringify({ diagnostics: result.diagnostics, warns });
    expect(serialized).toContain('confidence_not_number');
    expect(serialized).not.toMatch(/Federal troops|deploy federal forces|sk-|API_KEY/i);
  });

  it('J: AI unavailable still keeps deterministic creator work', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Federal troops deployment authority explained',
        publishedAt: DAY1,
        id: 'c1',
      }),
      voiceCandidate({
        slug: 'meidastouch',
        title: 'Legal limits on federal deployment',
        publishedAt: DAY1,
        id: 'c2',
      }),
    ];
    const result = await processThemeMemory({
      items,
      store,
      ai: createTestThemeAIProvider({ mode: 'unavailable' }),
      now: DAY1,
    });
    expect(result.ok).toBe(true);
    expect((await store.listThemes()).length).toBeGreaterThanOrEqual(1);
    expect((await store.listMemberships()).length).toBe(2);
    expect(result.diagnostics.aiFailureReasons.ollama_timeout).toBeGreaterThan(0);
    expect(result.diagnostics.aiFailureCategories.unavailable).toBeGreaterThan(0);
    expect(result.diagnostics.aiFailureCategories.validation).toBe(0);
    expect(result.diagnostics.incompleteClassification || result.diagnostics.aiUnavailable || result.diagnostics.themesCreated >= 1).toBe(true);
  });

  it('categorizes unexpected AI errors without leaking source text', async () => {
    const warns: unknown[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warns.push(args);
    });
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'meidastouch',
        name: 'MeidasTouch',
        title: 'Federal troops deployment authority explained',
        publishedAt: DAY1,
        id: 'meidas-d1',
      }),
      voiceCandidate({
        slug: 'david-pakman',
        name: 'David Pakman',
        title: 'Can the president deploy federal forces domestically?',
        publishedAt: DAY2,
        id: 'pakman-d2',
      }),
      voiceCandidate({
        slug: 'brian-tyler-cohen',
        name: 'Brian Tyler Cohen',
        title: 'Legal limits on federal deployment',
        publishedAt: DAY3,
        id: 'btc-d3',
      }),
    ];
    const result = await processThemeMemory({
      items,
      store,
      ai: createTestThemeAIProvider({
        classify: async () => {
          throw new Error('SECRET_TOKEN=abc Federal troops deployment authority explained');
        },
      }),
      now: DAY3,
    });
    expect(result.diagnostics.aiFailureCategories.unexpected).toBeGreaterThan(0);
    expect(result.diagnostics.aiFailureReasons.unexpected_error).toBeGreaterThan(0);
    const serialized = JSON.stringify({ diagnostics: result.diagnostics, warns });
    expect(serialized).not.toMatch(/SECRET_TOKEN|Federal troops|deploy federal forces/i);
  });

  it('K: exact rerun does not duplicate themes or memberships', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Federal deployment authority dispute continues',
        publishedAt: DAY1,
        id: 'c1',
      }),
      voiceCandidate({
        slug: 'meidastouch',
        title: 'Legal limits on federal deployment',
        publishedAt: DAY1,
        id: 'c2',
      }),
    ];
    const ai = createTestThemeAIProvider();
    await processThemeMemory({ items, store, ai, now: DAY1 });
    const afterFirst = {
      themes: (await store.listThemes()).length,
      members: (await store.listMemberships()).length,
    };
    const second = await processThemeMemory({ items, store, ai, now: DAY1 });
    expect((await store.listThemes()).length).toBe(afterFirst.themes);
    expect((await store.listMemberships()).length).toBe(afterFirst.members);
    expect(second.diagnostics.themesCreated).toBe(0);
  });

  it('L: lifecycle moves from new toward persistent across multiple active days', async () => {
    const store = createMemoryThemeStore();
    const ai = createTestThemeAIProvider();
    const day1 = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Federal deployment authority dispute continues',
        publishedAt: DAY1,
        id: 'd1',
      }),
    ];
    await processThemeMemory({ items: day1, store, ai, now: DAY1 });
    expect((await store.listThemes())[0]?.lifecycle_status).toBe('new');

    const growing = [
      ...day1,
      voiceCandidate({
        slug: 'meidastouch',
        title: 'Legal limits on federal deployment',
        publishedAt: DAY2,
        id: 'd2',
      }),
      voiceCandidate({
        slug: 'brian-tyler-cohen',
        title: 'Can the president deploy federal forces domestically?',
        publishedAt: DAY3,
        id: 'd3',
      }),
      voiceCandidate({
        slug: 'democracy-docket',
        title: 'Court filing on federal deployment authority',
        publishedAt: DAY4,
        id: 'd4',
      }),
    ];
    await processThemeMemory({ items: growing, store, ai, now: DAY4 });
    const status = (await store.listThemes())[0]?.lifecycle_status;
    expect(['developing', 'persistent']).toContain(status);
  });

  it('M: a quiet theme resurging after later creator activity', async () => {
    const store = createMemoryThemeStore();
    const ai = createTestThemeAIProvider();
    const early = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Federal deployment authority dispute continues',
        publishedAt: DAY1,
        id: 'early',
      }),
    ];
    await processThemeMemory({ items: early, store, ai, now: DAY1 });
    await processThemeMemory({ items: early, store, ai, now: DAY14 });
    expect((await store.listThemes())[0]?.lifecycle_status).toBe('dormant');

    const later = [
      ...early,
      voiceCandidate({
        slug: 'meidastouch',
        title: 'New development in federal deployment authority',
        publishedAt: DAY15,
        id: 'later',
      }),
    ];
    await processThemeMemory({ items: later, store, ai, now: DAY15 });
    expect((await store.listThemes())[0]?.lifecycle_status).toBe('resurging');
  });

  it('N: creator-only theme is valid editorial attention with zero evidence', async () => {
    const store = createMemoryThemeStore();
    await processThemeMemory({
      items: [
        voiceCandidate({
          slug: 'david-pakman',
          title: 'Why this surveillance bill matters',
          publishedAt: DAY1,
          id: 'only',
        }),
      ],
      store,
      ai: createTestThemeAIProvider(),
      now: DAY1,
    });
    const signal = (await store.listSignals())[0];
    expect(signal?.creator_item_count).toBe(1);
    expect(signal?.primary_source_count).toBe(0);
    expect(signal?.newswire_item_count).toBe(0);
    expect(signal?.evidence_depth).toBe(0);
  });

  it('O: attached reporting and primary deepen evidence without changing creator attention', async () => {
    const store = createMemoryThemeStore();
    const creator = voiceCandidate({
      slug: 'david-pakman',
      title: 'Federal deployment authority dispute continues',
      publishedAt: DAY1,
      id: 'only-creator',
    });
    const ai = createTestThemeAIProvider();
    await processThemeMemory({ items: [creator], store, ai, now: DAY1 });
    const before = (await store.listSignals())[0];

    await processThemeMemory({
      items: [
        creator,
        newswireCandidate({
          slug: 'ap',
          title: 'Reporting on federal deployment authority',
          url: 'https://ap.test/deployment',
          publishedAt: DAY1,
        }),
        intelCandidate({
          id: 'primary-2',
          slug: 'scotus-blog',
          title: 'Court filing on federal deployment authority',
          url: 'https://scotusblog.test/deployment',
          publishedAt: DAY1,
          provenance: 'PRIMARY',
        }),
      ],
      store,
      ai,
      now: DAY1,
    });
    const after = (await store.listSignals())[0];
    expect(after?.creator_item_count).toBe(before?.creator_item_count);
    expect(after?.primary_source_count).toBe(1);
    expect(after?.newswire_item_count).toBe(1);
    expect((after?.evidence_depth || 0) > (before?.evidence_depth || 0)).toBe(true);
  });

  it('exposes an inspectable read model and future attention helper without ranking points', async () => {
    const store = createMemoryThemeStore();
    const item = voiceCandidate({
      slug: 'david-pakman',
      title: 'Federal deployment authority dispute continues',
      publishedAt: DAY1,
      id: 'read-1',
    });
    await processThemeMemory({ items: [item], store, ai: createTestThemeAIProvider(), now: DAY1 });
    const active = await getActiveThemes(store, { windowDays: 7, now: DAY1 });
    expect(active).toHaveLength(1);
    expect(active[0]?.evidence.membershipIsNotCorroboration).toBe(true);
    const members = await getThemeMembers(store, active[0]!.id);
    expect(members[0]?.canonicalUrl).toBeTruthy();
    const attention = await getThemeAttentionForItem(store, {
      sourceSystem: item.sourceSystem,
      sourceSlug: item.sourceSlug,
      identityKey: item.identityKey,
    });
    expect(attention?.matchedThemeId).toBe(active[0]?.id);
    expect(attention?.membershipIsNotCorroboration).toBe(true);
    expect(attention).not.toHaveProperty('rankingDelta');
    const signals = await store.listSignals();
    expect(signals[0]).not.toHaveProperty('lastCreatorActivityAt');
  });

  it('does not permanently cache a no-AI analysis against later AI classification', async () => {
    const store = createMemoryThemeStore();
    const items = [
      voiceCandidate({
        slug: 'david-pakman',
        title: 'Downtown rail extension cleared after years of review',
        publishedAt: DAY1,
        id: 'rail-creator',
      }),
      newswireCandidate({
        slug: 'gazette',
        source: 'Municipal Gazette',
        title: 'Transit agency studies rail expansion downtown',
        url: 'https://gazette.test/rail-downtown',
        publishedAt: DAY1,
      }),
    ];

    const noneResult = await processThemeMemory({
      items,
      store,
      ai: createDeterministicThemeAIProvider(),
      now: DAY1,
    });
    expect(noneResult.diagnostics.newswireMembersAttached).toBe(0);
    const analysesAfterNone = await store.listMemberships();
    expect(analysesAfterNone.filter((row) => row.source_system === 'newswire')).toHaveLength(0);
    const noneAnalysis = await store.getAnalysis({
      source_system: 'newswire',
      source_slug: 'gazette',
      identity_key: items[1]!.identityKey,
    });
    expect(noneAnalysis?.classification_version).toBe(themeClassificationCacheVersion('none'));
    expect(analysisIsCurrent(noneAnalysis!, items[1]!.contentHash, themeClassificationCacheVersion('ollama'))).toBe(
      false,
    );

    const aiResult = await processThemeMemory({
      items,
      store,
      ai: createTestThemeAIProvider(),
      now: DAY1,
    });
    expect(aiResult.diagnostics.creatorItemsSkippedUnchanged).toBeGreaterThanOrEqual(0);
    const newswireMembers = (await store.listMemberships()).filter((row) => row.source_system === 'newswire');
    expect(newswireMembers).toHaveLength(1);
    expect(newswireMembers[0]?.membership_method).toBe('ai');
  });
});
