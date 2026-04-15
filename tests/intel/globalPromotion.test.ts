import { describe, expect, it } from 'vitest';
import { promoteGlobally } from '@/lib/intel/globalPromotion';

function mkIntelItem(partial: Partial<any>) {
  // Minimal shape required by promotion/clustering.
  return {
    id: partial.id ?? 'id',
    title: partial.title ?? 'T',
    summary: partial.summary ?? null,
    canonicalUrl: partial.canonicalUrl ?? `https://example.test/${partial.id ?? 'id'}`,
    imageUrl: null,
    publishedAt: partial.publishedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    provenanceClass: partial.provenanceClass ?? 'SPECIALIST',
    sourceName: partial.sourceName ?? 'Src',
    sourceSlug: partial.sourceSlug ?? 'src',
    trustWarningMode: partial.trustWarningMode ?? 'none',
    trustWarningLevel: 'info',
    requiresIndependentVerification: false,
    heroEligibilityMode: 'normal',
    trustWarningText: null,
    stateChangeType: partial.stateChangeType ?? 'unknown',
    deskLane: partial.deskLane ?? 'osint',
    contentUseMode: partial.contentUseMode ?? 'feed_summary',
    sourceFamily: partial.sourceFamily ?? 'general',
    indicator_class: null,
    clusterKeys: partial.clusterKeys ?? {},
    relevanceScore: 50,
    surfaceState: partial.surfaceState ?? 'surfaced',
    suppressionReason: null,
    missionTags: partial.missionTags ?? [],
    branchOfGovernment: partial.branchOfGovernment ?? 'unknown',
    institutionalArea: partial.institutionalArea ?? 'unknown',
    relevanceExplanations: [],
    isDuplicateLoser: false,
    displayPriority: partial.displayPriority ?? 50,
    displayBucket: partial.displayBucket ?? 'routine',
  };
}

describe('promoteGlobally', () => {
  it('promotes a mid-ranked court/legal item above routine commentary across lanes', () => {
    const routineCommentary = mkIntelItem({
      id: 'c1',
      title: 'Hot take thread about politics',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      displayPriority: 88,
      missionTags: [],
    });
    const courtAction = mkIntelItem({
      id: 'p1',
      title: 'Court issues order granting temporary restraining order',
      provenanceClass: 'PRIMARY',
      deskLane: 'osint',
      institutionalArea: 'courts',
      missionTags: ['courts', 'civil_liberties'],
      displayPriority: 66, // mid-ranked in-lane by old logic
    });
    const out = promoteGlobally([routineCommentary, courtAction], { limit: 2 });
    expect(out[0].representativeId).toBe('p1');
    expect(out[0].decision.reasons).toContain('court_or_legal_action');
  });

  it('clusters identical canonicalUrl into one promotable cluster with corroboration reasons', () => {
    const a = mkIntelItem({
      id: 'a',
      canonicalUrl: 'https://example.test/story',
      title: 'Judge issues injunction',
      provenanceClass: 'SPECIALIST',
      sourceSlug: 'law-blog',
      missionTags: ['courts'],
      displayPriority: 60,
    });
    const b = mkIntelItem({
      id: 'b',
      canonicalUrl: 'https://example.test/story',
      title: 'Court grants preliminary injunction',
      provenanceClass: 'WIRE',
      sourceSlug: 'wire-1',
      missionTags: ['courts'],
      displayPriority: 62,
    });
    const out = promoteGlobally([a, b], { limit: 3 });
    expect(out[0].decision.corroboration.itemCount).toBe(2);
    expect(out[0].decision.reasons).toContain('corroborated_multi_source');
  });

  it('penalizes claims/statement surfaces without corroboration', () => {
    const claim = mkIntelItem({
      id: 's1',
      title: 'Spokesperson says investigation is a hoax',
      deskLane: 'statements',
      trustWarningMode: 'source_controlled_official_claims',
      provenanceClass: 'PRIMARY',
      displayPriority: 84,
      missionTags: ['elections'],
    });
    const corroborated = mkIntelItem({
      id: 'w1',
      title: 'Inspector general opens investigation',
      deskLane: 'watchdogs',
      provenanceClass: 'SPECIALIST',
      displayPriority: 70,
      sourceSlug: 'watchdog',
      sourceFamily: 'watchdog_global',
      missionTags: ['federal_agencies'],
    });
    const out = promoteGlobally([claim, corroborated], { limit: 2 });
    expect(out.some((c) => c.representativeId === 's1')).toBe(true);
    const claimCluster = out.find((c) => c.representativeId === 's1');
    expect(claimCluster?.decision.reasons).toContain('claims_lane_penalty');
  });
});

