import { describe, expect, it } from 'vitest';
import { computeDisplayPriority } from '@/lib/intel/displayPriority';
import { applyEditorialRankingProfile } from '@/lib/intel/rankingProfile';

describe('applyEditorialRankingProfile', () => {
  it('boosts court / injunction language', () => {
    const { delta, explanations } = applyEditorialRankingProfile({
      haystack: 'appeals court grants injunction against policy',
      deskLane: 'osint',
      provenanceClass: 'SPECIALIST',
      stateChangeType: 'specialist_item',
      sourceFamily: 'general',
    });
    expect(delta).toBeGreaterThan(0);
    expect(explanations.some((e) => e.ruleId === 'profile:court')).toBe(true);
  });

  it('boosts executive / agency language', () => {
    const { delta, explanations } = applyEditorialRankingProfile({
      haystack: 'DHS announces new ICE policy after White House executive order',
      deskLane: 'osint',
      provenanceClass: 'PRIMARY',
      stateChangeType: 'press_statement',
      sourceFamily: 'general',
    });
    expect(delta).toBeGreaterThan(0);
    expect(explanations.some((e) => e.ruleId === 'profile:exec_agency')).toBe(true);
  });

  it('boosts defense tempo keywords', () => {
    const { delta, explanations } = applyEditorialRankingProfile({
      haystack: 'CENTCOM confirms strike exercise near NATO deployment',
      deskLane: 'osint',
      provenanceClass: 'WIRE',
      stateChangeType: 'wire_item',
      sourceFamily: 'general',
    });
    expect(delta).toBeGreaterThan(0);
    expect(explanations.some((e) => e.ruleId === 'profile:defense')).toBe(true);
  });

  it('applies statements lane demotion', () => {
    const { delta, explanations } = applyEditorialRankingProfile({
      haystack: 'Breaking: official says something',
      deskLane: 'statements',
      provenanceClass: 'COMMENTARY',
      stateChangeType: 'commentary_item',
      sourceFamily: 'claims_public',
    });
    expect(delta).toBeLessThan(0);
    expect(explanations.some((e) => e.ruleId === 'profile:statements_lane')).toBe(true);
  });
});

describe('computeDisplayPriority + ranking profile', () => {
  const base = {
    title: 'Court issues preliminary injunction',
    summary: 'DOJ and DHS respond',
    provenanceClass: 'SPECIALIST' as const,
    sourceSlug: 'lawfare',
    stateChangeType: 'specialist_item',
    missionTags: ['courts'],
    branchOfGovernment: 'judicial',
    institutionalArea: 'courts',
    relevanceScore: 58,
    clusterKeys: {},
    publishedAt: new Date().toISOString(),
  };

  it('scores higher for court-heavy content than generic commentary without hard signals', () => {
    const court = computeDisplayPriority({
      ...base,
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      sourceFamily: 'general',
    });
    const noise = computeDisplayPriority({
      ...base,
      title: 'Just a hot take on politics today',
      summary: 'Opinion thread',
      provenanceClass: 'COMMENTARY',
      stateChangeType: 'commentary_item',
      missionTags: [],
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      sourceFamily: 'general',
    });
    expect(court.displayPriority).toBeGreaterThan(noise.displayPriority);
  });

  it('scores statements lane lower than OSINT for the same headline', () => {
    const osint = computeDisplayPriority({
      ...base,
      title: 'Official statement on deployment',
      summary: 'CENTCOM press',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      sourceFamily: 'general',
    });
    const st = computeDisplayPriority({
      ...base,
      title: 'Official statement on deployment',
      summary: 'CENTCOM press',
      deskLane: 'statements',
      contentUseMode: 'feed_summary',
      sourceFamily: 'claims_public',
    });
    expect(st.displayPriority).toBeLessThan(osint.displayPriority);
  });
});
