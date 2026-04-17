import { describe, expect, it, vi } from 'vitest';
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

  it('lets a corroborated Congress/FISA cluster outrank a lone clean court item of similar base strength', () => {
    const courtItem = mkIntelItem({
      id: 'court-1',
      title: 'Court issues clean preliminary injunction in challenge',
      sourceSlug: 'court-wire',
      sourceFamily: 'general',
      provenanceClass: 'SPECIALIST',
      deskLane: 'osint',
      institutionalArea: 'courts',
      missionTags: ['courts', 'civil_liberties'],
      displayPriority: 78,
    });

    const congressPrimary = mkIntelItem({
      id: 'cg-1',
      title: 'Senate leaders push late-night floor vote on FISA Section 702 reauthorization',
      summary: 'Cloture fight escalates over surveillance extension',
      canonicalUrl: 'https://example.test/fisa-1',
      sourceSlug: 'hill-primary',
      sourceFamily: 'general',
      provenanceClass: 'PRIMARY',
      deskLane: 'osint',
      institutionalArea: 'congress',
      missionTags: ['congress', 'civil_liberties'],
      displayPriority: 67,
      clusterKeys: { bill: 'hr-702' },
    });
    const congressWire = mkIntelItem({
      id: 'cg-2',
      title: 'House and Senate showdown over Section 702 surveillance extension heads to emergency vote',
      summary: 'Rules vote and cloture pressure build',
      canonicalUrl: 'https://example.test/fisa-2',
      sourceSlug: 'wire-702',
      sourceFamily: 'general',
      provenanceClass: 'WIRE',
      deskLane: 'watchdogs',
      institutionalArea: 'congress',
      missionTags: ['congress', 'civil_liberties'],
      displayPriority: 65,
      clusterKeys: { bill: 'hr-702' },
    });
    const congressCommentary = mkIntelItem({
      id: 'cg-3',
      title: 'Commentary: why the Section 702 reauthorization vote became a surveillance showdown',
      summary: 'Late-night FISA extension pressure exposes the real fight',
      canonicalUrl: 'https://example.test/fisa-3',
      sourceSlug: 'creator-fisa',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      institutionalArea: 'congress',
      missionTags: ['congress', 'civil_liberties'],
      displayPriority: 82,
      clusterKeys: { bill: 'hr-702' },
    });

    const out = promoteGlobally([courtItem, congressPrimary, congressWire, congressCommentary], { limit: 3 });
    expect(out[0].representativeId).toBe('cg-1');
    expect(out[0].decision.reasons).toContain('congress_urgency');
    expect(out[0].decision.reasons).toContain('corroborated_multi_source');
    expect(out[0].decision.reasons).toContain('corroborated_multi_lane');
    expect(out[0].decision.contributions.some((c) => c.code === 'congress_urgency')).toBe(true);
    expect(out[1]!.representativeId).toBe('court-1');
  });

  it('promotes a multi-lane Iran defense/watchdog cluster via corroboration and momentum', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    const defense = mkIntelItem({
      id: 'ir-1',
      title: 'Pentagon tracks Iran drone barrage after regional strike',
      summary: 'Defense officials assess the next operational phase',
      canonicalUrl: 'https://example.test/iran-1',
      sourceSlug: 'pentagon-special',
      sourceFamily: 'defense_primary',
      provenanceClass: 'PRIMARY',
      deskLane: 'defense_ops',
      institutionalArea: 'specialist',
      missionTags: ['international_relevant'],
      displayPriority: 68,
      clusterKeys: { theater: 'iran-drone-wave' },
      publishedAt: '2026-04-17T09:00:00.000Z',
    });
    const watchdog = mkIntelItem({
      id: 'ir-2',
      title: 'Watchdog maps Iran drone escalation after overnight strike phase',
      summary: 'Regional monitors trace the same barrage and response',
      canonicalUrl: 'https://example.test/iran-2',
      sourceSlug: 'watch-iran',
      sourceFamily: 'watchdog_global',
      provenanceClass: 'SPECIALIST',
      deskLane: 'watchdogs',
      institutionalArea: 'specialist',
      missionTags: ['international_relevant'],
      displayPriority: 64,
      clusterKeys: { theater: 'iran-drone-wave' },
      publishedAt: '2026-04-17T02:30:00.000Z',
    });
    const osint = mkIntelItem({
      id: 'ir-3',
      title: 'Iran drone barrage enters new phase as strike fallout widens',
      summary: 'Officials and analysts point to the same overnight operation',
      canonicalUrl: 'https://example.test/iran-3',
      sourceSlug: 'osint-iran',
      sourceFamily: 'general',
      provenanceClass: 'WIRE',
      deskLane: 'osint',
      institutionalArea: 'specialist',
      missionTags: ['international_relevant'],
      displayPriority: 63,
      clusterKeys: { theater: 'iran-drone-wave' },
      publishedAt: '2026-04-17T10:00:00.000Z',
    });

    const out = promoteGlobally([defense, watchdog, osint], { limit: 2 });
    expect(out[0].representativeId).toBe('ir-1');
    expect(out[0].decision.reasons).toContain('corroborated_multi_lane');
    expect(out[0].decision.reasons).toContain('corroborated_multi_family');
    expect(out[0].decision.reasons).toContain('new_phase_in_active_story');
    expect(out[0].decision.contributions.some((c) => c.code === 'corroborated_multi_source')).toBe(true);

    vi.useRealTimers();
  });

  it('does not let isolated commentary outrank corroborated hard-signal reporting', () => {
    const commentary = mkIntelItem({
      id: 'com-1',
      title: 'Commentary: this is the biggest political story in America',
      provenanceClass: 'COMMENTARY',
      sourceSlug: 'voice-big',
      sourceFamily: 'claims_public',
      deskLane: 'voices',
      missionTags: [],
      displayPriority: 90,
    });
    const hardA = mkIntelItem({
      id: 'hard-1',
      title: 'Inspector general opens oversight probe into surveillance program',
      canonicalUrl: 'https://example.test/surv-1',
      provenanceClass: 'PRIMARY',
      sourceSlug: 'ig-primary',
      sourceFamily: 'general',
      deskLane: 'watchdogs',
      institutionalArea: 'specialist',
      missionTags: ['congress', 'civil_liberties', 'federal_agencies'],
      displayPriority: 66,
      clusterKeys: { investigation: 'surv-probe-1' },
    });
    const hardB = mkIntelItem({
      id: 'hard-2',
      title: 'Senate oversight hearing presses surveillance officials after probe opens',
      canonicalUrl: 'https://example.test/surv-2',
      provenanceClass: 'SPECIALIST',
      sourceSlug: 'senate-watch',
      sourceFamily: 'watchdog_global',
      deskLane: 'osint',
      institutionalArea: 'congress',
      missionTags: ['congress', 'civil_liberties'],
      displayPriority: 64,
      clusterKeys: { investigation: 'surv-probe-1' },
    });

    const out = promoteGlobally([commentary, hardA, hardB], { limit: 2 });
    expect(out[0].representativeId).toBe('hard-1');
    expect(out[0].decision.totalScore).toBeGreaterThan(out[1]!.decision.totalScore);
  });

  it('lets commentary strengthen a corroborated cluster without becoming the representative', () => {
    const hard = mkIntelItem({
      id: 'rep-1',
      title: 'House committee issues subpoena in oversight fight',
      canonicalUrl: 'https://example.test/rep-1',
      provenanceClass: 'PRIMARY',
      sourceSlug: 'house-desk',
      sourceFamily: 'general',
      deskLane: 'osint',
      institutionalArea: 'congress',
      missionTags: ['congress'],
      displayPriority: 68,
      clusterKeys: { oversight: 'house-subpoena-1' },
    });
    const commentary = mkIntelItem({
      id: 'rep-2',
      title: 'Commentary: why the subpoena fight matters now',
      canonicalUrl: 'https://example.test/rep-2',
      provenanceClass: 'COMMENTARY',
      sourceSlug: 'voice-house',
      sourceFamily: 'claims_public',
      deskLane: 'voices',
      institutionalArea: 'congress',
      missionTags: ['congress'],
      displayPriority: 86,
      clusterKeys: { oversight: 'house-subpoena-1' },
    });

    const withCommentary = promoteGlobally([hard, commentary], { limit: 1 })[0]!;
    const withoutCommentary = promoteGlobally([hard], { limit: 1 })[0]!;

    expect(withCommentary.representativeId).toBe('rep-1');
    expect(withCommentary.decision.corroboration.itemCount).toBe(2);
    expect(withCommentary.decision.totalScore).toBeGreaterThan(withoutCommentary.decision.totalScore);
    expect(withCommentary.decision.reasons).toContain('corroborated_multi_source');
  });
});

