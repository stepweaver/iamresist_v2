import { describe, expect, it, vi } from 'vitest';
import { computeCreatorCorroborationBridge, promoteGlobally } from '@/lib/intel/globalPromotion';

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

  it('uses trusted creator convergence to lift corroborating watchdog and OSINT support', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    const creatorA = mkIntelItem({
      id: 'creator-a',
      title: 'Creator tracks ICE detention raid fallout in Los Angeles',
      summary: 'Multiple communities document the same detention crackdown',
      sourceSlug: 'creator-a',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      missionTags: ['executive_power', 'civil_liberties'],
      displayPriority: 78,
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T10:30:00.000Z',
    });
    const creatorB = mkIntelItem({
      id: 'creator-b',
      title: 'Trusted voice maps Los Angeles detention raid fallout and ICE crackdown',
      summary: 'Another independent creator surfaces the same detention operation',
      sourceSlug: 'creator-b',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      missionTags: ['executive_power', 'civil_liberties'],
      displayPriority: 76,
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T09:50:00.000Z',
    });
    const watchdog = mkIntelItem({
      id: 'watchdog-ice',
      title: 'Watchdog documents Los Angeles detention raid fallout after ICE crackdown',
      summary: 'Monitors corroborate detainee counts and operational timeline',
      sourceSlug: 'watchdog-ice',
      sourceFamily: 'watchdog_global',
      provenanceClass: 'SPECIALIST',
      deskLane: 'watchdogs',
      missionTags: ['executive_power', 'civil_liberties'],
      displayPriority: 65,
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T10:45:00.000Z',
    });
    const osint = mkIntelItem({
      id: 'osint-ice',
      title: 'OSINT confirms Los Angeles detention raid routes after ICE crackdown',
      summary: 'Geolocated footage corroborates the same operation',
      sourceSlug: 'osint-ice',
      sourceFamily: 'general',
      provenanceClass: 'WIRE',
      deskLane: 'osint',
      missionTags: ['executive_power', 'civil_liberties'],
      displayPriority: 63,
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T11:10:00.000Z',
    });
    const unrelated = mkIntelItem({
      id: 'routine-other',
      title: 'Routine budget hearing update',
      sourceSlug: 'routine-other',
      provenanceClass: 'PRIMARY',
      deskLane: 'watchdogs',
      missionTags: ['congress'],
      displayPriority: 72,
    });

    const out = promoteGlobally([creatorA, creatorB, watchdog, osint, unrelated], { limit: 3 });
    expect(out[0].representativeId).toBe('watchdog-ice');
    expect(out[0].decision.reasons).toContain('trusted_creator_convergence');
    expect(out[0].decision.reasons).toContain('creator_led_story_with_corroboration');
    expect(out[0].decision.creatorConvergence.active).toBe(true);
    expect(out[0].decision.creatorConvergence.sourceCount).toBe(2);
    expect(out[0].decision.contributions.some((c) => c.code === 'trusted_creator_convergence')).toBe(true);

    vi.useRealTimers();
  });

  it('does not give an isolated creator item a convergence boost', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    const creator = mkIntelItem({
      id: 'solo-creator',
      title: 'Creator warns of a possible contract scandal',
      summary: 'Single creator item without corroboration',
      sourceSlug: 'solo-creator',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      displayPriority: 84,
      publishedAt: '2026-04-17T10:00:00.000Z',
    });
    const watchdog = mkIntelItem({
      id: 'watchdog-alone',
      title: 'Watchdog filing on agency disclosures',
      summary: 'Separate accountability item',
      sourceSlug: 'watchdog-alone',
      sourceFamily: 'watchdog_global',
      provenanceClass: 'PRIMARY',
      deskLane: 'watchdogs',
      missionTags: ['federal_agencies'],
      displayPriority: 67,
      publishedAt: '2026-04-17T09:30:00.000Z',
    });

    const out = promoteGlobally([creator, watchdog], { limit: 2 });
    const creatorCluster = out.find((cluster) => cluster.representativeId === 'solo-creator');
    expect(creatorCluster?.decision.reasons).not.toContain('trusted_creator_convergence');
    expect(creatorCluster?.decision.creatorConvergence.active).toBe(false);
    expect(creatorCluster?.decision.contributions.some((c) => c.code === 'trusted_creator_convergence')).toBe(false);

    vi.useRealTimers();
  });

  it('does not let unsupported creator-only chatter dominate promotion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    const creatorA = mkIntelItem({
      id: 'noise-a',
      title: 'Creator reacts to vague rumors about a media shakeup',
      summary: 'Live reaction without corroborating reporting',
      sourceSlug: 'noise-a',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      displayPriority: 88,
      clusterKeys: { topic: 'media-rumor-wave' },
      publishedAt: '2026-04-17T10:00:00.000Z',
    });
    const creatorB = mkIntelItem({
      id: 'noise-b',
      title: 'Another creator reacts to the same media shakeup rumors',
      summary: 'Second creator echoes the chatter',
      sourceSlug: 'noise-b',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      displayPriority: 87,
      clusterKeys: { topic: 'media-rumor-wave' },
      publishedAt: '2026-04-17T09:40:00.000Z',
    });
    const hardA = mkIntelItem({
      id: 'hard-a',
      title: 'Inspector general subpoena expands prison abuse investigation',
      summary: 'Documented accountability escalation',
      sourceSlug: 'hard-a',
      sourceFamily: 'watchdog_global',
      provenanceClass: 'PRIMARY',
      deskLane: 'watchdogs',
      missionTags: ['civil_liberties', 'federal_agencies'],
      displayPriority: 68,
      clusterKeys: { investigation: 'prison-abuse-1' },
      publishedAt: '2026-04-17T10:50:00.000Z',
    });
    const hardB = mkIntelItem({
      id: 'hard-b',
      title: 'OSINT verifies prison abuse investigation after inspector general subpoena',
      summary: 'Independent corroboration of the same accountability story',
      sourceSlug: 'hard-b',
      sourceFamily: 'general',
      provenanceClass: 'WIRE',
      deskLane: 'osint',
      missionTags: ['civil_liberties'],
      displayPriority: 64,
      clusterKeys: { investigation: 'prison-abuse-1' },
      publishedAt: '2026-04-17T11:05:00.000Z',
    });

    const out = promoteGlobally([creatorA, creatorB, hardA, hardB], { limit: 2 });
    expect(out[0].representativeId).toBe('hard-a');
    expect(out[0].decision.totalScore).toBeGreaterThan(out[1]!.decision.totalScore);
    expect(out[1]!.decision.reasons).toContain('creator_support_noted');
    expect(out[1]!.decision.reasons).not.toContain('trusted_creator_convergence');

    vi.useRealTimers();
  });

  it('computes a bounded creator corroboration bridge for surfaced non-creator targets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    const creatorA = mkIntelItem({
      id: 'bridge-creator-a',
      title: 'Creator tracks ICE detention raid fallout in Los Angeles',
      summary: 'Multiple communities document the same detention crackdown',
      sourceSlug: 'bridge-creator-a',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      missionTags: ['executive_power', 'civil_liberties'],
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T10:30:00.000Z',
    });
    const creatorB = mkIntelItem({
      id: 'bridge-creator-b',
      title: 'Trusted voice maps Los Angeles detention raid fallout and ICE crackdown',
      summary: 'Another independent creator surfaces the same detention operation',
      sourceSlug: 'bridge-creator-b',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      missionTags: ['executive_power', 'civil_liberties'],
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T09:50:00.000Z',
    });
    const watchdog = mkIntelItem({
      id: 'bridge-watchdog',
      title: 'Watchdog documents Los Angeles detention raid fallout after ICE crackdown',
      summary: 'Monitors corroborate detainee counts and operational timeline',
      sourceSlug: 'bridge-watchdog',
      sourceFamily: 'watchdog_global',
      provenanceClass: 'SPECIALIST',
      deskLane: 'watchdogs',
      missionTags: ['executive_power', 'civil_liberties'],
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T10:45:00.000Z',
      surfaceState: 'surfaced',
    });

    const out = computeCreatorCorroborationBridge([watchdog], [creatorA, creatorB], {
      maxBoost: 4,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.targetItemId).toBe('bridge-watchdog');
    expect(out[0]?.boost).toBeGreaterThan(0);
    expect(out[0]?.boost).toBeLessThanOrEqual(4);
    expect(out[0]?.reasons).toContain('trusted_creator_convergence');

    vi.useRealTimers();
  });

  it('does not let creator corroboration rescue non-surfaced targets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));

    const creatorA = mkIntelItem({
      id: 'bridge-downranked-creator-a',
      title: 'Creator tracks ICE detention raid fallout in Los Angeles',
      sourceSlug: 'bridge-downranked-creator-a',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      missionTags: ['executive_power', 'civil_liberties'],
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T10:30:00.000Z',
    });
    const creatorB = mkIntelItem({
      id: 'bridge-downranked-creator-b',
      title: 'Trusted voice maps Los Angeles detention raid fallout and ICE crackdown',
      sourceSlug: 'bridge-downranked-creator-b',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      missionTags: ['executive_power', 'civil_liberties'],
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T09:50:00.000Z',
    });
    const downrankedTarget = mkIntelItem({
      id: 'bridge-downranked-watchdog',
      title: 'Watchdog documents Los Angeles detention raid fallout after ICE crackdown',
      sourceSlug: 'bridge-downranked-watchdog',
      sourceFamily: 'watchdog_global',
      provenanceClass: 'SPECIALIST',
      deskLane: 'watchdogs',
      missionTags: ['executive_power', 'civil_liberties'],
      clusterKeys: { topic: 'la-detention-crackdown' },
      publishedAt: '2026-04-17T10:45:00.000Z',
      surfaceState: 'downranked',
    });

    const out = computeCreatorCorroborationBridge([downrankedTarget], [creatorA, creatorB], {
      maxBoost: 4,
    });
    expect(out).toEqual([]);

    vi.useRealTimers();
  });
});

