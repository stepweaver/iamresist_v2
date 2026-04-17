import { describe, expect, it } from 'vitest';
import { computeDisplayPriority } from '@/lib/intel/displayPriority';
import { computeRelevanceProfile } from '@/lib/intel/relevance';
import type { NormalizedItem, SignalSourceConfig } from '@/lib/intel/types';

function base(over: Partial<Parameters<typeof computeDisplayPriority>[0]> = {}) {
  return {
    title: 'Title',
    summary: null,
    provenanceClass: 'PRIMARY' as const,
    sourceSlug: 'wh-presidential',
    stateChangeType: 'presidential_action',
    missionTags: ['executive_power'],
    branchOfGovernment: 'executive',
    institutionalArea: 'white_house',
    relevanceScore: 60,
    clusterKeys: { proclamation: '9999' },
    publishedAt: new Date().toISOString(),
    ...over,
  };
}

describe('computeDisplayPriority', () => {
  it('penalizes ceremonial proclamations so they are not lead by default', () => {
    const out = computeDisplayPriority(
      base({
        title: 'A Proclamation on National Something Day',
        clusterKeys: { proclamation: '12345' },
      }),
    );
    expect(out.displayPriority).toBeLessThan(78);
    expect(out.displayBucket).not.toBe('lead');
    expect(out.displayExplanations.map((e) => e.ruleId)).toContain('display:ceremonial_exec');
  });

  it('boosts high-impact court language', () => {
    const out = computeDisplayPriority(
      base({
        provenanceClass: 'SPECIALIST',
        sourceSlug: 'scotusblog',
        missionTags: ['courts'],
        branchOfGovernment: 'judicial',
        institutionalArea: 'courts',
        title: 'Court grants injunction in major case',
        clusterKeys: {},
      }),
    );
    expect(out.displayPriority).toBeGreaterThan(60);
    expect(out.displayExplanations.map((e) => e.ruleId)).toContain('display:impact_text');
  });

  it('lets a strong Congress item compete with a court item when relevance is similar', () => {
    const court = computeDisplayPriority(
      base({
        provenanceClass: 'SPECIALIST',
        sourceSlug: 'scotusblog',
        missionTags: ['courts'],
        branchOfGovernment: 'judicial',
        institutionalArea: 'courts',
        title: 'Court grants injunction in major case',
        clusterKeys: {},
        relevanceScore: 62,
      }),
    );

    const congress = computeDisplayPriority(
      base({
        provenanceClass: 'PRIMARY',
        sourceSlug: 'govinfo-bills',
        missionTags: ['congress'],
        branchOfGovernment: 'legislative',
        institutionalArea: 'congress',
        title: 'Senate committee issues subpoena in oversight fight',
        summary: 'Congressional leaders escalate a shutdown and oversight clash',
        stateChangeType: 'published_document',
        clusterKeys: {},
        relevanceScore: 62,
      }),
    );

    expect(congress.displayPriority).toBeGreaterThanOrEqual(court.displayPriority - 3);
    expect(congress.displayExplanations.map((e) => e.ruleId)).toContain('display:tag');
  });
});

describe('off-topic mission leakage', () => {
  function baseCfg(over: Partial<SignalSourceConfig> = {}): SignalSourceConfig {
    return {
      slug: 'reuters-wire',
      name: 'Reuters',
      provenanceClass: 'WIRE',
      fetchKind: 'rss',
      deskLane: 'osint',
      sourceFamily: 'general',
      contentUseMode: 'feed_summary',
      endpointUrl: 'https://example.test/feed',
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

  function baseItem(over: Partial<NormalizedItem> = {}): NormalizedItem {
    return {
      externalId: 'sports-1',
      canonicalUrl: 'https://example.test/sports-1',
      title: 'NBA playoffs preview',
      summary: 'Coach discusses point spread and fantasy fallout',
      publishedAt: null,
      imageUrl: null,
      contentHash: 'sports-1',
      structured: {},
      clusterKeys: {},
      stateChangeType: 'wire_item',
      ...over,
    };
  }

  it('suppresses obvious sports-only wire items', () => {
    const profile = computeRelevanceProfile(baseItem(), baseCfg());
    expect(profile.surface_state).toBe('suppressed');
    expect(profile.suppression_reason).toMatch(/off-topic: sports-only item/i);
  });
});

