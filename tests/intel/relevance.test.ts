import { describe, expect, it } from 'vitest';
import { computeRelevanceProfile, compilePatternList, editorialControlsForDb } from '@/lib/intel/relevance';
import type { NormalizedItem, SignalSourceConfig } from '@/lib/intel/types';

function baseItem(over: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    externalId: 'x',
    canonicalUrl: 'https://example.com/a',
    title: 'Test title',
    summary: null,
    publishedAt: null,
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
    contentUseMode: 'feed_summary',
    endpointUrl: 'https://x',
    isEnabled: true,
    purpose: 'p',
    trustedFor: 't',
    notTrustedFor: 'n',
    isCoreSource: true,
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
});
