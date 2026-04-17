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

  it('boosts congressional oversight language', () => {
    const { delta, explanations } = applyEditorialRankingProfile({
      haystack: 'Senate committee issues subpoena in oversight clash over shutdown funding',
      deskLane: 'osint',
      provenanceClass: 'PRIMARY',
      stateChangeType: 'published_document',
      sourceFamily: 'general',
    });
    expect(delta).toBeGreaterThan(0);
    expect(explanations.some((e) => e.ruleId === 'profile:congress')).toBe(true);
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

  it('does not automatically crush commentary with strong mission-relevant institutional hooks', () => {
    const commentary = computeDisplayPriority({
      ...base,
      title: 'Commentary: Senate oversight hearing presses DOJ on surveillance authorities',
      summary: 'A detailed analysis of the hearing and subpoena fight',
      provenanceClass: 'COMMENTARY',
      stateChangeType: 'commentary_item',
      missionTags: ['congress', 'civil_liberties'],
      branchOfGovernment: 'legislative',
      institutionalArea: 'congress',
      deskLane: 'voices',
      contentUseMode: 'feed_summary',
      sourceFamily: 'claims_public',
    });

    const noise = computeDisplayPriority({
      ...base,
      title: 'Commentary: just a hot take on politics today',
      summary: 'Thread reacting to vibes',
      provenanceClass: 'COMMENTARY',
      stateChangeType: 'commentary_item',
      missionTags: [],
      branchOfGovernment: 'unknown',
      institutionalArea: 'unknown',
      deskLane: 'voices',
      contentUseMode: 'feed_summary',
      sourceFamily: 'claims_public',
    });

    expect(commentary.displayPriority).toBeGreaterThan(noise.displayPriority);
    expect(commentary.displayExplanations.map((e) => e.ruleId)).not.toContain('profile:commentary_default');
    expect(noise.displayExplanations.map((e) => e.ruleId)).toContain('profile:commentary_default');
  });
});
