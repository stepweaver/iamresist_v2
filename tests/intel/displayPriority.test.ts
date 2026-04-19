import { describe, expect, it } from 'vitest';
import { computeDisplayPriority, evaluateRecentWindowTieBreak } from '@/lib/intel/displayPriority';
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
  it('keeps provenance-first tie-breaks outside the recent window', () => {
    const decision = evaluateRecentWindowTieBreak(
      {
        publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
        provenanceClass: 'WIRE',
        score: 61,
      },
      {
        publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        provenanceClass: 'PRIMARY',
        score: 63,
      },
    );

    expect(decision.winner).toBeNull();
  });

  it('lets freshness win inside the bounded recent window when the provenance gap is small', () => {
    const decision = evaluateRecentWindowTieBreak(
      {
        publishedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
        provenanceClass: 'PRIMARY',
        score: 64,
      },
      {
        publishedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        provenanceClass: 'WIRE',
        score: 62,
      },
    );

    expect(decision.winner).toBe('b');
    expect(decision.reason).toMatch(/both <=6h old/i);
  });

  it('does not let commentary leapfrog stronger reporting in the recent-window tie-break', () => {
    const decision = evaluateRecentWindowTieBreak(
      {
        publishedAt: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
        provenanceClass: 'SPECIALIST',
        score: 63,
      },
      {
        publishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        provenanceClass: 'COMMENTARY',
        score: 62,
      },
    );

    expect(decision.winner).toBeNull();
  });

  it('keeps provenance as the stronger default when the recent-window score gap is too large', () => {
    const decision = evaluateRecentWindowTieBreak(
      {
        publishedAt: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
        provenanceClass: 'PRIMARY',
        score: 67,
      },
      {
        publishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        provenanceClass: 'WIRE',
        score: 61,
      },
    );

    expect(decision.winner).toBeNull();
    expect(decision.scoreGap).toBe(6);
  });

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

  it('gives fresh specialist reporting more lift than older commentary on the same development', () => {
    const freshSpecialist = computeDisplayPriority(
      base({
        provenanceClass: 'SPECIALIST',
        sourceSlug: 'scotusblog',
        missionTags: ['courts'],
        branchOfGovernment: 'judicial',
        institutionalArea: 'courts',
        title: 'Court grants injunction in major case',
        summary: 'Fresh filing points to a new ruling in the case',
        clusterKeys: {},
        publishedAt: new Date().toISOString(),
        relevanceScore: 58,
      }),
    );

    const olderCommentary = computeDisplayPriority(
      base({
        provenanceClass: 'COMMENTARY',
        sourceSlug: 'creator-analysis',
        missionTags: ['courts'],
        branchOfGovernment: 'judicial',
        institutionalArea: 'courts',
        title: 'Commentary: court fight intensifies',
        summary: 'Strong analysis, but not the fresh reported development itself',
        stateChangeType: 'commentary_item',
        clusterKeys: {},
        publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        relevanceScore: 64,
      }),
    );

    expect(freshSpecialist.displayPriority).toBeGreaterThan(olderCommentary.displayPriority);
    expect(freshSpecialist.displayExplanations.map((e) => e.ruleId)).toContain('display:provenance');
    expect(freshSpecialist.displayExplanations.map((e) => e.ruleId)).toContain('display:recency');
  });

  it('keeps recent-window recency explanations explicit for debug inspection', () => {
    const out = computeDisplayPriority(
      base({
        provenanceClass: 'WIRE',
        sourceSlug: 'ap-wire',
        missionTags: ['courts'],
        branchOfGovernment: 'judicial',
        institutionalArea: 'courts',
        title: 'Appeals court issues stay in voting rights case',
        clusterKeys: {},
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      }),
    );

    expect(out.displayExplanations.some((e) => e.ruleId === 'display:recency')).toBe(true);
    expect(out.displayExplanations.some((e) => /recent-window|breaking-window/i.test(e.message))).toBe(true);
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

  it('suppresses obvious entertainment-only wire items too', () => {
    const profile = computeRelevanceProfile(
      baseItem({
        id: 'ent-1',
        canonicalUrl: 'https://example.test/ent-1',
        title: 'Celebrity fashion dominates the red carpet',
        summary: 'Streaming gossip and wellness chatter lead the day',
      }),
      baseCfg(),
    );
    expect(profile.surface_state).toBe('suppressed');
    expect(profile.suppression_reason).toMatch(/off-topic: entertainment \/ lifestyle item/i);
  });
});

