import { describe, expect, it } from 'vitest';
import { computeRelevanceProfile, compilePatternList, editorialControlsForDb } from '@/lib/intel/relevance';
import type { NormalizedItem, SignalSourceConfig } from '@/lib/intel/types';

function baseItem(over: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    externalId: 'x',
    canonicalUrl: 'https://example.com/a',
    title: 'Test title',
    summary: null,
    publishedAt: new Date('2026-04-19T12:00:00.000Z').toISOString(),
    imageUrl: null,
    contentHash: 'h',
    structured: {},
    clusterKeys: {},
    stateChangeType: 'unknown',
    ...over,
  };
}

function baseCfg(over: Partial<SignalSourceConfig> = {}): SignalSourceConfig {
  return {
    slug: 'fr-published',
    name: 'FR',
    provenanceClass: 'PRIMARY',
    fetchKind: 'json_api',
    deskLane: 'osint',
    sourceFamily: 'general',
    contentUseMode: 'feed_summary',
    endpointUrl: 'https://x',
    isEnabled: true,
    purpose: 'p',
    trustedFor: 't',
    notTrustedFor: 'n',
    isCoreSource: true,
    trustWarningMode: 'none',
    trustWarningLevel: 'info',
    requiresIndependentVerification: false,
    heroEligibilityMode: 'normal',
    trustWarningText: null,
    ...over,
  };
}

describe('compilePatternList', () => {
  it('skips invalid regex strings', () => {
    expect(compilePatternList(['(', 'valid'])).toHaveLength(1);
  });
});

describe('editorialControlsForDb', () => {
  it('omits empty optional fields', () => {
    expect(editorialControlsForDb(baseCfg())).toEqual({});
    expect(
      editorialControlsForDb(
        baseCfg({
          editorialControls: {
            defaultPriority: 40,
            blockKeywords: ['sunshine'],
            noiseNotes: 'noisy',
          },
        }),
      ),
    ).toEqual({
      defaultPriority: 40,
      blockKeywords: ['sunshine'],
      noiseNotes: 'noisy',
    });
  });
});

describe('computeRelevanceProfile', () => {
  it('suppresses when block keyword matches', () => {
    const item = baseItem({
      title: 'Sunshine Act Meeting Notice',
      summary: 'Federal advisory committee',
    });
    const cfg = baseCfg({
      slug: 'fr-published',
      editorialControls: {
        blockKeywords: ['sunshine act'],
        defaultPriority: 40,
      },
    });
    const p = computeRelevanceProfile(item, cfg);
    expect(p.surface_state).toBe('suppressed');
    expect(p.suppression_reason).toMatch(/block keyword/i);
    expect(p.relevance_explanations.some((e) => e.ruleId === 'editorial:block_keyword')).toBe(true);
  });

  it('downranks when state_change_type not in preferred list', () => {
    const item = baseItem({
      title: 'Routine press piece',
      stateChangeType: 'press_statement',
    });
    const cfg = baseCfg({
      slug: 'fr-published',
      editorialControls: {
        preferredStateChangeTypes: ['published_document'],
        defaultPriority: 40,
      },
    });
    const p = computeRelevanceProfile(item, cfg);
    expect(p.surface_state).toBe('downranked');
    expect(p.relevance_explanations.some((e) => e.ruleId === 'editorial:state_change_mismatch')).toBe(
      true,
    );
  });

  it('adds executive_power tag for executive order in title', () => {
    const item = baseItem({
      title: 'Executive Order 12345 on an issue',
      stateChangeType: 'published_document',
    });
    const cfg = baseCfg({
      slug: 'fr-published',
      editorialControls: { preferredStateChangeTypes: ['published_document'] },
    });
    const p = computeRelevanceProfile(item, cfg);
    expect(p.mission_tags).toContain('executive_power');
    expect(p.surface_state).toBe('surfaced');
  });

  it('uses fr_type for tag hints', () => {
    const item = baseItem({
      title: 'Some rule',
      structured: { fr_type: 'Rule' },
      stateChangeType: 'published_document',
    });
    const cfg = baseCfg({
      editorialControls: { preferredStateChangeTypes: ['published_document'] },
    });
    const p = computeRelevanceProfile(item, cfg);
    expect(p.mission_tags).toContain('regulation');
  });

  it('applies higher baseline for wh-presidential', () => {
    const item = baseItem({
      title: 'Memorandum on policy',
      stateChangeType: 'presidential_action',
    });
    const cfg = baseCfg({
      slug: 'wh-presidential',
      fetchKind: 'rss',
      editorialControls: {
        preferredStateChangeTypes: ['presidential_action', 'published_document', 'press_statement'],
      },
    });
    const p = computeRelevanceProfile(item, cfg);
    expect(p.relevance_score).toBeGreaterThan(55);
    expect(p.institutional_area).toBe('white_house');
  });

  it('gives a modest sourcePosition boost that does not overpower stronger deterministic evidence', () => {
    const cfg = baseCfg({
      slug: 'fr-published',
      provenanceClass: 'PRIMARY',
      sourceFamily: 'general',
      trustWarningMode: 'none',
      editorialControls: {
        defaultPriority: 40,
        allowKeywords: ['sanctions'],
      },
    });

    const weakTop = baseItem({
      title: 'Routine bulletin',
      structured: { sourcePosition: 1 },
      stateChangeType: 'published_document',
    });
    const strongLower = baseItem({
      title: 'New sanctions announced',
      structured: { sourcePosition: 8 },
      stateChangeType: 'published_document',
    });

    const pWeak = computeRelevanceProfile(weakTop, cfg);
    const pStrong = computeRelevanceProfile(strongLower, cfg);

    expect(pWeak.relevance_score).toBeLessThan(pStrong.relevance_score);
    expect(pWeak.relevance_explanations.some((e) => e.ruleId === 'upstream:source_position_boost')).toBe(true);
    expect(pStrong.relevance_explanations.some((e) => e.ruleId === 'editorial:allow_keyword')).toBe(true);
  });

  it('uses upstream categories as controlled hints when they corroborate minimal text evidence', () => {
    const cfg = baseCfg({
      slug: 'kyiv-independent',
      provenanceClass: 'SPECIALIST',
      sourceFamily: 'defense_specialist',
      trustWarningMode: 'none',
      editorialControls: { defaultPriority: 44 },
    });

    const item = baseItem({
      title: 'Kyiv officials report overnight strikes',
      summary: null,
      structured: { itemCategories: ['Ukraine', 'War'] },
      stateChangeType: 'specialist_item',
    });

    const p = computeRelevanceProfile(item, cfg);
    expect(p.mission_tags).toContain('international_relevant');
    const e = p.relevance_explanations.find((x) => x.ruleId === 'upstream:category_hint');
    expect(e).toBeTruthy();
    expect(e?.meta && Array.isArray(e.meta['matchedHints']) ? e.meta['matchedHints'] : []).toContain('ukraine');
  });

  it('does not allow upstream metadata to boost commentary items', () => {
    const cfg = baseCfg({
      slug: 'creator-x',
      provenanceClass: 'COMMENTARY',
      fetchKind: 'rss',
      deskLane: 'voices',
      sourceFamily: 'claims_public',
      trustWarningMode: 'source_controlled_official_claims',
      editorialControls: { defaultPriority: 46 },
    });

    const item = baseItem({
      title: 'Hot take on geopolitics',
      structured: { sourcePosition: 1, itemCategories: ['Ukraine', 'Iran'] },
      stateChangeType: 'commentary_item',
    });

    const p = computeRelevanceProfile(item, cfg);
    expect(p.relevance_explanations.some((e) => String(e.ruleId).startsWith('upstream:'))).toBe(false);
  });

  it('sourcePosition boost decays quickly and is capped', () => {
    const cfg = baseCfg({
      slug: 'fr-published',
      provenanceClass: 'PRIMARY',
      trustWarningMode: 'none',
      editorialControls: { defaultPriority: 40 },
    });
    const base = baseItem({ title: 'Routine notice', stateChangeType: 'published_document' });

    const p1 = computeRelevanceProfile({ ...base, structured: { sourcePosition: 1 } }, cfg);
    const p5 = computeRelevanceProfile({ ...base, structured: { sourcePosition: 5 } }, cfg);
    const p12 = computeRelevanceProfile({ ...base, structured: { sourcePosition: 12 } }, cfg);

    expect(p1.relevance_score).toBeGreaterThan(p5.relevance_score);
    expect(p5.relevance_score).toBeGreaterThanOrEqual(p12.relevance_score);

    const e1 = p1.relevance_explanations.find((e) => e.ruleId === 'upstream:source_position_boost');
    expect(e1).toBeTruthy();
    expect(e1?.meta?.['sourcePosition']).toBe(1);
  });

  it('suppresses an off-topic sports item', () => {
    const item = baseItem({
      title: 'NFL playoffs preview centers on a quarterback battle',
      summary: 'Analysts break down the point spread and fantasy fallout.',
      publishedAt: new Date('2026-04-19T11:00:00.000Z').toISOString(),
    });
    const cfg = baseCfg({
      slug: 'reuters-wire',
      name: 'Reuters',
      provenanceClass: 'WIRE',
      sourceFamily: 'watchdog_global',
      fetchKind: 'rss',
    });

    const p = computeRelevanceProfile(item, cfg);

    expect(p.surface_state).toBe('suppressed');
    expect(p.suppression_reason).toMatch(/sports-only/i);
    expect(p.relevance_explanations.some((e) => e.ruleId === 'mission:off_topic')).toBe(true);
  });

  it('suppresses an off-topic entertainment or lifestyle item', () => {
    const item = baseItem({
      title: 'Celebrity fashion dominates the red carpet before the music festival',
      summary: 'Streaming stars arrive as album rumors and gossip spread.',
      publishedAt: new Date('2026-04-19T11:00:00.000Z').toISOString(),
    });
    const cfg = baseCfg({
      slug: 'ap-wire',
      name: 'AP',
      provenanceClass: 'WIRE',
      sourceFamily: 'watchdog_global',
      fetchKind: 'rss',
    });

    const p = computeRelevanceProfile(item, cfg);

    expect(p.surface_state).toBe('suppressed');
    expect(p.suppression_reason).toMatch(/entertainment \/ lifestyle/i);
    expect(p.relevance_explanations.some((e) => e.ruleId === 'mission:off_topic')).toBe(true);
  });

  it('keeps a fresh ambiguous wire-style item surfaced with only a light penalty', () => {
    const item = baseItem({
      title: 'Breaking: crews respond after major blast shuts down port operations',
      summary: 'Officials say emergency teams are still assessing damage and disruptions.',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      stateChangeType: 'wire_item',
    });
    const cfg = baseCfg({
      slug: 'reuters-wire',
      name: 'Reuters',
      provenanceClass: 'WIRE',
      sourceFamily: 'watchdog_global',
      fetchKind: 'rss',
    });

    const p = computeRelevanceProfile(item, cfg);

    expect(p.surface_state).toBe('surfaced');
    expect(p.suppression_reason).toBeNull();
    expect(p.relevance_explanations.some((e) => e.ruleId === 'mission:ambiguous_fresh_reporting')).toBe(
      true,
    );
  });

  it('downranks an older ambiguous broad item', () => {
    const item = baseItem({
      title: 'Breaking: blast disrupts major port operations',
      summary: 'Authorities continue investigating the damage and response timeline.',
      publishedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      stateChangeType: 'wire_item',
    });
    const cfg = baseCfg({
      slug: 'ap-wire',
      name: 'AP',
      provenanceClass: 'WIRE',
      sourceFamily: 'watchdog_global',
      fetchKind: 'rss',
    });

    const p = computeRelevanceProfile(item, cfg);

    expect(p.surface_state).toBe('downranked');
    expect(p.relevance_explanations.some((e) => e.ruleId === 'mission:ambiguous_downrank')).toBe(true);
  });

  it('keeps a clear in-scope political item surfaced and stronger than an ambiguous wire item', () => {
    const inScope = computeRelevanceProfile(
      baseItem({
        title: 'Congress opens oversight hearing into White House surveillance policy',
        summary: 'Lawmakers and a federal judge are examining civil rights concerns.',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        stateChangeType: 'wire_item',
      }),
      baseCfg({
        slug: 'reuters-wire',
        name: 'Reuters',
        provenanceClass: 'WIRE',
        sourceFamily: 'watchdog_global',
        fetchKind: 'rss',
      }),
    );

    const ambiguous = computeRelevanceProfile(
      baseItem({
        title: 'Breaking: crews respond after major blast shuts down port operations',
        summary: 'Officials say emergency teams are still assessing damage and disruptions.',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        stateChangeType: 'wire_item',
      }),
      baseCfg({
        slug: 'ap-wire',
        name: 'AP',
        provenanceClass: 'WIRE',
        sourceFamily: 'watchdog_global',
        fetchKind: 'rss',
      }),
    );

    expect(inScope.surface_state).toBe('surfaced');
    expect(ambiguous.surface_state).toBe('surfaced');
    expect(inScope.relevance_score).toBeGreaterThan(ambiguous.relevance_score);
    expect(inScope.relevance_explanations.find((e) => e.ruleId === 'mission:scope')?.message).toMatch(
      /^In-scope:/,
    );
  });

  it('keeps relevance explanations explicit for ambiguous and off-topic mission outcomes', () => {
    const ambiguous = computeRelevanceProfile(
      baseItem({
        title: 'Breaking: crews respond after major blast shuts down port operations',
        summary: 'Officials say emergency teams are still assessing damage and disruptions.',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        stateChangeType: 'wire_item',
      }),
      baseCfg({
        slug: 'reuters-wire',
        name: 'Reuters',
        provenanceClass: 'WIRE',
        sourceFamily: 'watchdog_global',
        fetchKind: 'rss',
      }),
    );
    const offTopic = computeRelevanceProfile(
      baseItem({
        title: 'NFL playoffs preview centers on a quarterback battle',
        summary: 'Analysts break down the point spread and fantasy fallout.',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        stateChangeType: 'wire_item',
      }),
      baseCfg({
        slug: 'ap-wire',
        name: 'AP',
        provenanceClass: 'WIRE',
        sourceFamily: 'watchdog_global',
        fetchKind: 'rss',
      }),
    );

    expect(ambiguous.relevance_explanations.find((e) => e.ruleId === 'mission:scope')?.message).toBe(
      'Ambiguous: broad current-events item with no strong mission anchor',
    );
    expect(
      ambiguous.relevance_explanations.find((e) =>
        ['mission:ambiguous_fresh_reporting', 'mission:ambiguous_downrank'].includes(e.ruleId),
      )?.message,
    ).toMatch(/mission-ambiguous/i);
    expect(offTopic.relevance_explanations.find((e) => e.ruleId === 'mission:off_topic')?.message).toMatch(
      /Off-topic:/,
    );
  });
});
