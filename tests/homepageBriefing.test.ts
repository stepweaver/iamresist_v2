import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  bridgeNewswireStoryScore,
  computeHomepageBriefingScore,
  dedupeHomepageBriefingItemsForDisplay,
  homepageBriefingDisplayDedupeKey,
  mergeAndRankBriefingCandidates,
  passesFallbackGate,
  weightedBriefingScore,
} from '@/lib/feeds/homepageBriefing.service';
import {
  FALLBACK_MAX_AGE_HOURS,
  hoursSincePublished,
  VOICES_COMMENTARY_FALLBACK_MAX_AGE_H,
} from '@/lib/feeds/homepageBriefing.policy';
import { BRIEFING_LANE_WEIGHT, BRIEFING_TOTAL_SLOTS } from '@/lib/feeds/homepageBriefing.weights';

describe('bridgeNewswireStoryScore', () => {
  it('boosts curated stories', () => {
    const base = { title: 'T', url: 'https://a.test', publishedAt: new Date().toISOString(), isCurated: false };
    const cur = { ...base, isCurated: true };
    expect(bridgeNewswireStoryScore(cur)).toBeGreaterThan(bridgeNewswireStoryScore(base));
  });
});

describe('weightedBriefingScore', () => {
  it('applies lower weight for voices lane', () => {
    const raw = 80;
    const os = weightedBriefingScore({ briefLane: 'osint', rawScore: raw });
    const vo = weightedBriefingScore({ briefLane: 'voices', rawScore: raw });
    expect(vo).toBeLessThan(os);
    expect(os).toBe(raw * BRIEFING_LANE_WEIGHT.osint);
    expect(vo).toBe(raw * BRIEFING_LANE_WEIGHT.voices);
  });
});

describe('mergeAndRankBriefingCandidates', () => {
  it('dedupes by normalized URL and keeps higher homepage score first', () => {
    const url = 'https://example.com/dupe';
    const candidates = [
      {
        kind: 'newswire' as const,
        briefLane: 'newswire' as const,
        briefingOrigin: 'newswire' as const,
        rawScore: 60,
        weightedScore: 60 * BRIEFING_LANE_WEIGHT.newswire,
        story: { id: 'n1', url, title: 'A', sourceSlug: 's', publishedAt: new Date().toISOString() },
      },
      {
        kind: 'intel' as const,
        briefLane: 'osint' as const,
        briefingOrigin: 'promoted' as const,
        rawScore: 90,
        weightedScore: 90 * BRIEFING_LANE_WEIGHT.osint,
        intelItem: {
          id: 'i1',
          canonicalUrl: url,
          title: 'B',
          sourceName: 'X',
          sourceSlug: 'x',
          publishedAt: new Date().toISOString(),
          deskLane: 'osint',
          provenanceClass: 'WIRE',
        },
      },
    ];
    const out = mergeAndRankBriefingCandidates(candidates);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('intel');
  });

  it('uses a strict lane cap first then backfills with fallback when one lane dominates', () => {
    const families = [
      'general',
      'watchdog_global',
      'defense_primary',
      'combatant_command',
      'indicator_hard',
      'claims_public',
    ] as const;
    const mk = (id: string, w: number, i: number) => ({
      kind: 'intel' as const,
      briefLane: 'osint' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: w,
      weightedScore: w * BRIEFING_LANE_WEIGHT.osint,
      intelItem: {
        id,
        canonicalUrl: `https://example.test/${id}`,
        title: id,
        sourceName: 'S',
        sourceSlug: `src-${id}`,
        sourceFamily: families[i] ?? 'general',
        publishedAt: new Date().toISOString(),
        deskLane: 'osint',
        displayPriority: w,
        provenanceClass: 'WIRE',
      },
    });
    const sixOsint = [
      mk('a', 90, 0),
      mk('b', 89, 1),
      mk('c', 88, 2),
      mk('d', 87, 3),
      mk('e', 86, 4),
      mk('f', 85, 5),
    ];
    const out = mergeAndRankBriefingCandidates(sixOsint);
    expect(out.length).toBe(BRIEFING_TOTAL_SLOTS);
    expect(out.every((x) => x.briefLane === 'osint')).toBe(true);
  });

  it('caps items from the same source slug', () => {
    const mk = (id: string, w: number) => ({
      kind: 'intel' as const,
      briefLane: 'watchdogs' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: w,
      weightedScore: w * BRIEFING_LANE_WEIGHT.watchdogs,
      intelItem: {
        id,
        canonicalUrl: `https://example.test/w/${id}`,
        title: id,
        sourceName: 'S',
        sourceSlug: 'same-feed',
        sourceFamily: 'watchdog_global',
        publishedAt: new Date().toISOString(),
        deskLane: 'watchdogs',
        displayPriority: w,
        provenanceClass: 'PRIMARY',
      },
    });
    const many = [mk('a', 99), mk('b', 98), mk('c', 97), mk('d', 96), mk('e', 95)];
    const out = mergeAndRankBriefingCandidates(many);
    const slugs = out.map((o) => (o.kind === 'intel' ? o.intelItem.sourceSlug : null));
    expect(slugs.filter((s) => s === 'same-feed').length).toBeLessThanOrEqual(2);
  });

  it('attaches briefingExplain with origin and selection phase', () => {
    const candidates = [
      {
        kind: 'intel' as const,
        briefLane: 'osint' as const,
        briefingOrigin: 'promoted' as const,
        rawScore: 70,
        weightedScore: 70 * BRIEFING_LANE_WEIGHT.osint,
        intelItem: {
          id: 'p1',
          canonicalUrl: 'https://example.test/p1',
          title: 'P',
          sourceName: 'S',
          sourceSlug: 's1',
          publishedAt: new Date().toISOString(),
          deskLane: 'osint',
          promotionReasons: ['accountability_signal'],
          promotionEventType: 'court_order',
        },
      },
    ];
    const out = mergeAndRankBriefingCandidates(candidates);
    expect(out[0].briefingExplain?.origin).toBe('promoted');
    expect(out[0].briefingExplain?.selectionPhase).toBe('primary');
    expect(out[0].briefingExplain?.promotionReasons).toContain('accountability_signal');
    expect(out[0].briefingExplain?.promotedPriorityApplied).toBe(true);
    expect(out[0].briefingExplain?.sameStoryCoherenceSupport?.applied).toBe(false);
  });
});

describe('Prompt 3 homepage merge behavior', () => {
  const now = '2026-04-17T12:00:00.000Z';

  function mkIntel({
    id,
    lane,
    origin = 'lane_backstop',
    rawScore,
    publishedAt = '2026-04-17T10:00:00.000Z',
    title,
    summary,
    sourceSlug,
    sourceFamily = 'general',
    provenanceClass = 'PRIMARY',
    promotionReasons,
    promotionEventType,
  }: {
    id: string;
    lane: 'osint' | 'watchdogs' | 'defense_ops' | 'voices';
    origin?: 'promoted' | 'lane_backstop';
    rawScore: number;
    publishedAt?: string;
    title: string;
    summary?: string;
    sourceSlug?: string;
    sourceFamily?: string;
    provenanceClass?: string;
    promotionReasons?: string[];
    promotionEventType?: string;
  }) {
    return {
      kind: 'intel' as const,
      briefLane: lane,
      briefingOrigin: origin as 'promoted' | 'lane_backstop',
      rawScore,
      weightedScore: rawScore * BRIEFING_LANE_WEIGHT[lane],
      intelItem: {
        id,
        canonicalUrl: `https://example.test/${id}`,
        title,
        summary: summary ?? null,
        sourceName: sourceSlug ?? `${lane}-source`,
        sourceSlug: sourceSlug ?? `${lane}-${id}`,
        sourceFamily,
        publishedAt,
        deskLane: lane,
        displayPriority: rawScore,
        provenanceClass,
        promotionReasons: promotionReasons ?? [],
        promotionEventType: promotionEventType ?? 'generic_report',
      },
    };
  }

  function mkNewswire({
    id,
    rawScore,
    title,
    excerpt,
    publishedAt = '2026-04-17T09:30:00.000Z',
    sourceSlug = 'ap',
  }: {
    id: string;
    rawScore: number;
    title: string;
    excerpt?: string;
    publishedAt?: string;
    sourceSlug?: string;
  }) {
    return {
      kind: 'newswire' as const,
      briefLane: 'newswire' as const,
      briefingOrigin: 'newswire' as const,
      rawScore,
      weightedScore: rawScore * BRIEFING_LANE_WEIGHT.newswire,
      story: {
        id,
        url: `https://wire.test/${id}`,
        title,
        excerpt: excerpt ?? '',
        sourceSlug,
        publishedAt,
      },
    };
  }

  it('1. lets a strong promoted cluster survive against lane-backstop filler', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const promoted = mkIntel({
      id: 'promo-1',
      lane: 'watchdogs',
      origin: 'promoted',
      rawScore: 62,
      title: 'Inspector general subpoena expands surveillance oversight fight',
      summary: 'Corroborated accountability cluster on the live surveillance fight',
      promotionReasons: ['accountability_signal', 'corroborated_multi_source'],
      promotionEventType: 'hearing',
    });
    const fillerA = mkIntel({
      id: 'fill-a',
      lane: 'osint',
      rawScore: 64,
      title: 'Routine agency update',
      summary: 'Solid but isolated item',
    });
    const fillerB = mkIntel({
      id: 'fill-b',
      lane: 'defense_ops',
      rawScore: 63,
      title: 'Routine theater update',
      summary: 'Another decent but isolated item',
    });

    const out = mergeAndRankBriefingCandidates([fillerA, fillerB, promoted]);
    expect(out[0].intelItem.id).toBe('promo-1');
    expect(out[0].briefingExplain?.promotedPriorityApplied).toBe(true);

    vi.useRealTimers();
  });

  it('2. no longer crushes a strong voices-backed promoted story', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const voicesPromoted = mkIntel({
      id: 'voices-promo',
      lane: 'voices',
      origin: 'promoted',
      rawScore: 72,
      title: 'Creators converge on late-night FISA surveillance showdown',
      summary: 'Multiple trusted voices and desks point to the same 702 vote fight',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
      promotionReasons: ['congress_urgency', 'corroborated_multi_lane'],
      promotionEventType: 'congress_urgency',
    });
    const backstop = mkIntel({
      id: 'backstop',
      lane: 'watchdogs',
      rawScore: 66,
      title: 'Routine oversight memo',
      summary: 'Useful but less urgent than the promoted surveillance cluster',
    });

    const out = mergeAndRankBriefingCandidates([backstop, voicesPromoted]);
    expect(out[0].intelItem.id).toBe('voices-promo');
    expect(out[0].briefingExplain?.weightedLaneScore).toBeCloseTo(72 * BRIEFING_LANE_WEIGHT.voices, 2);

    vi.useRealTimers();
  });

  it('3. still keeps stale voices commentary from padding the rail', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const fresh = mkIntel({
      id: 'fresh-1',
      lane: 'watchdogs',
      rawScore: 61,
      title: 'New watchdog filing',
    });
    const staleVoice = mkIntel({
      id: 'stale-voice',
      lane: 'voices',
      rawScore: 83,
      publishedAt: '2026-01-01T12:00:00.000Z',
      title: 'Old recycled take',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
    });

    const out = mergeAndRankBriefingCandidates([fresh, staleVoice]);
    expect(out.map((item) => (item.kind === 'intel' ? item.intelItem.id : item.story.id))).toEqual(['fresh-1']);

    vi.useRealTimers();
  });

  it('4. helps a supporting newswire item survive when it reinforces a top promoted story', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const promoted = mkIntel({
      id: 'promo-wire-anchor',
      lane: 'watchdogs',
      origin: 'promoted',
      rawScore: 67,
      title: 'Inspector general subpoena expands FISA surveillance fight',
      summary: 'Oversight and surveillance pressure accelerate around the same live story',
      promotionReasons: ['accountability_signal', 'congress_urgency'],
      promotionEventType: 'hearing',
    });
    const coherentNewswire = mkNewswire({
      id: 'wire-support',
      rawScore: 54,
      title: 'AP: Senate FISA surveillance fight widens as inspector general subpoena lands',
      excerpt: 'Fresh wire reinforcement of the same surveillance oversight story',
    });
    const unrelatedBackstop = mkIntel({
      id: 'unrelated',
      lane: 'osint',
      rawScore: 57,
      title: 'Separate diplomatic briefing',
      summary: 'Not the same story',
    });

    const out = mergeAndRankBriefingCandidates([promoted, coherentNewswire, unrelatedBackstop]);
    const support = out.find((item) => item.kind === 'newswire');
    expect(support).toBeTruthy();
    expect(support?.briefingExplain?.sameStoryCoherenceSupport?.applied).toBe(true);
    expect(support?.briefingExplain?.sameStoryCoherenceSupport?.anchorItemId).toBe('promo-wire-anchor');

    vi.useRealTimers();
  });

  it('5. does not let caps break obvious same-story coherence for a promoted anchor plus companion item', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const anchor = mkIntel({
      id: 'story-anchor',
      lane: 'watchdogs',
      origin: 'promoted',
      rawScore: 74,
      title: 'Subpoena fight escalates over election surveillance records',
      summary: 'Main promoted accountability story',
      sourceFamily: 'general',
      promotionReasons: ['accountability_signal', 'corroborated_multi_source'],
      promotionEventType: 'hearing',
    });
    const familyA = mkIntel({
      id: 'family-a',
      lane: 'osint',
      rawScore: 71,
      title: 'Top legal filing one',
      sourceFamily: 'general',
      sourceSlug: 'gen-a',
    });
    const familyB = mkIntel({
      id: 'family-b',
      lane: 'defense_ops',
      rawScore: 70,
      title: 'Top legal filing two',
      sourceFamily: 'general',
      sourceSlug: 'gen-b',
    });
    const coherentCompanion = mkIntel({
      id: 'family-c',
      lane: 'osint',
      rawScore: 60,
      title: 'Election surveillance subpoena fight escalates again in court and Congress',
      summary: 'Same accountability story, now with another concrete development',
      sourceFamily: 'general',
      sourceSlug: 'gen-c',
      provenanceClass: 'WIRE',
      promotionEventType: 'hearing',
    });

    const out = mergeAndRankBriefingCandidates([anchor, familyA, familyB, coherentCompanion]);
    const support = out.find((item) => item.kind === 'intel' && item.intelItem.id === 'family-c');
    expect(support).toBeTruthy();
    expect(support?.briefingExplain?.sameStoryCoherenceSupport?.capOverrideUsed).toBe(true);

    vi.useRealTimers();
  });

  it('7. carries creator-led corroboration reasons without making commentary the representative item', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const promotedHardSignal = mkIntel({
      id: 'creator-led-watchdog',
      lane: 'watchdogs',
      origin: 'promoted',
      rawScore: 73,
      title: 'Watchdog verifies detention raid fallout after creator convergence',
      summary: 'Hard-signal reporting becomes the representative item for the live story',
      sourceFamily: 'watchdog_global',
      provenanceClass: 'PRIMARY',
      promotionReasons: [
        'trusted_creator_convergence',
        'creator_led_story_with_corroboration',
        'corroborated_multi_lane',
      ],
      promotionEventType: 'generic_report',
    });
    promotedHardSignal.intelItem.globalPromotion = {
      contributions: [
        {
          code: 'trusted_creator_convergence',
          delta: 12,
          message: 'Trusted creators converged on the same live story',
        },
      ],
      creatorConvergence: {
        active: true,
        itemCount: 2,
        sourceCount: 2,
        supportingItemCount: 1,
        supportingLaneCount: 1,
        sharedTokens: ['detention', 'raid', 'fallout'],
        latestHours: 3,
      },
    };
    const voiceBackstop = mkIntel({
      id: 'creator-commentary',
      lane: 'voices',
      rawScore: 75,
      title: 'Creators converge on detention raid fallout',
      summary: 'Trusted voices surface the same live story early',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
    });

    const out = mergeAndRankBriefingCandidates([voiceBackstop, promotedHardSignal]);
    expect(out[0].intelItem.id).toBe('creator-led-watchdog');
    expect(out[0].briefingExplain?.promotionReasons).toContain('trusted_creator_convergence');
    expect(out[0].briefingExplain?.promotionReasons).toContain('creator_led_story_with_corroboration');
    expect(out[0].briefingExplain?.representative?.itemId).toBe('creator-led-watchdog');
    expect(out[0].briefingExplain?.creatorConvergence?.active).toBe(true);
    expect(
      out[0].briefingExplain?.promotionContributions?.some(
        (contribution) => contribution.code === 'trusted_creator_convergence',
      ),
    ).toBe(true);

    vi.useRealTimers();
  });

  it('6. keeps off-mission leakage suppressed by weak weights and merge priority', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const promoted = mkIntel({
      id: 'mission-top',
      lane: 'watchdogs',
      origin: 'promoted',
      rawScore: 66,
      title: 'Court order deepens accountability fight over deportation records',
      summary: 'Live mission story',
      promotionReasons: ['court_or_legal_action'],
      promotionEventType: 'court_order',
    });
    const offMissionishVoice = mkIntel({
      id: 'voice-noise',
      lane: 'voices',
      rawScore: 65,
      title: 'Creator reaction to celebrity tech platform drama',
      summary: 'High engagement but not mission-relevant',
      sourceFamily: 'claims_public',
      provenanceClass: 'COMMENTARY',
    });

    const out = mergeAndRankBriefingCandidates([promoted, offMissionishVoice]);
    expect(out[0].intelItem.id).toBe('mission-top');
    expect(out.some((item) => item.kind === 'intel' && item.intelItem.id === 'voice-noise')).toBe(true);
    expect(out[1]?.briefingExplain?.homepageBriefingScore).toBeLessThan(out[0].briefingExplain?.homepageBriefingScore ?? 0);

    vi.useRealTimers();
  });
});

describe('ranking tightening (deterministic clock)', () => {
  it('A: stale Voices item does not rank above fresher institutional item when homepage score is lower', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    const staleVoice = {
      kind: 'intel' as const,
      briefLane: 'voices' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: 88,
      weightedScore: 88 * BRIEFING_LANE_WEIGHT.voices,
      intelItem: {
        id: 'v1',
        canonicalUrl: 'https://voice.test/old',
        title: 'Old commentary',
        sourceName: 'V',
        sourceSlug: 'v',
        publishedAt: '2026-01-01T12:00:00.000Z',
        deskLane: 'voices',
        provenanceClass: 'COMMENTARY',
        displayPriority: 88,
      },
    };

    const freshWatch = {
      kind: 'intel' as const,
      briefLane: 'watchdogs' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: 58,
      weightedScore: 58 * BRIEFING_LANE_WEIGHT.watchdogs,
      intelItem: {
        id: 'w1',
        canonicalUrl: 'https://watch.test/new',
        title: 'New filing',
        sourceName: 'W',
        sourceSlug: 'w',
        publishedAt: '2026-04-15T08:00:00.000Z',
        deskLane: 'watchdogs',
        provenanceClass: 'PRIMARY',
        displayPriority: 58,
      },
    };

    const sv = computeHomepageBriefingScore(staleVoice);
    const fw = computeHomepageBriefingScore(freshWatch);
    expect(fw).toBeGreaterThan(sv);

    const out = mergeAndRankBriefingCandidates([staleVoice, freshWatch]);
    expect(out[0].intelItem.id).toBe('w1');

    vi.useRealTimers();
  });

  it('B: fallback rejects items past age floor or below score floor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    const ancient = {
      kind: 'intel' as const,
      briefLane: 'osint' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: 99,
      weightedScore: 99 * BRIEFING_LANE_WEIGHT.osint,
      intelItem: {
        id: 'old',
        canonicalUrl: 'https://example.test/old',
        title: 'Old',
        sourceSlug: 'a',
        publishedAt: '2025-01-01T12:00:00.000Z',
        deskLane: 'osint',
        provenanceClass: 'WIRE',
      },
    };

    const hp = computeHomepageBriefingScore(ancient);
    expect(passesFallbackGate(ancient, hp)).toBe(false);
    expect(hoursSincePublished(ancient.intelItem.publishedAt)).toBeGreaterThan(FALLBACK_MAX_AGE_HOURS.osint);

    vi.useRealTimers();
  });

  it('C: fresher mid-strength accountability lane beats older stronger commentary for ordering', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    const oldCommentary = {
      kind: 'intel' as const,
      briefLane: 'voices' as const,
      briefingOrigin: 'promoted' as const,
      rawScore: 92,
      weightedScore: 92 * BRIEFING_LANE_WEIGHT.voices,
      intelItem: {
        id: 'oc',
        canonicalUrl: 'https://c.test/old',
        title: 'Strong take',
        sourceSlug: 'c',
        publishedAt: '2026-02-01T12:00:00.000Z',
        deskLane: 'voices',
        provenanceClass: 'COMMENTARY',
      },
    };

    const freshAcct = {
      kind: 'intel' as const,
      briefLane: 'watchdogs' as const,
      briefingOrigin: 'promoted' as const,
      rawScore: 62,
      weightedScore: 62 * BRIEFING_LANE_WEIGHT.watchdogs,
      intelItem: {
        id: 'fa',
        canonicalUrl: 'https://a.test/new',
        title: 'Filing',
        sourceSlug: 'a',
        publishedAt: '2026-04-14T18:00:00.000Z',
        deskLane: 'watchdogs',
        provenanceClass: 'PRIMARY',
      },
    };

    expect(computeHomepageBriefingScore(freshAcct)).toBeGreaterThan(computeHomepageBriefingScore(oldCommentary));
    const out = mergeAndRankBriefingCandidates([oldCommentary, freshAcct]);
    expect(out[0].intelItem.id).toBe('fa');

    vi.useRealTimers();
  });

  it('D: fresh wire reporting can beat slightly higher older primary filler when the homepage score is stronger', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    const breakingWire = {
      kind: 'intel' as const,
      briefLane: 'osint' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: 74,
      weightedScore: 74 * BRIEFING_LANE_WEIGHT.osint,
      intelItem: {
        id: 'wire-break',
        canonicalUrl: 'https://wire.test/break',
        title: 'Wire reports injunction hits surveillance program',
        sourceSlug: 'wire-1',
        publishedAt: '2026-04-15T11:00:00.000Z',
        deskLane: 'osint',
        provenanceClass: 'WIRE',
        displayPriority: 74,
      },
    };

    const olderPrimary = {
      kind: 'intel' as const,
      briefLane: 'watchdogs' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: 72,
      weightedScore: 72 * BRIEFING_LANE_WEIGHT.watchdogs,
      intelItem: {
        id: 'primary-old',
        canonicalUrl: 'https://primary.test/old',
        title: 'Older filing remains in the mix',
        sourceSlug: 'primary-1',
        publishedAt: '2026-04-14T02:00:00.000Z',
        deskLane: 'watchdogs',
        provenanceClass: 'PRIMARY',
        displayPriority: 72,
      },
    };

    expect(computeHomepageBriefingScore(breakingWire)).toBeGreaterThan(computeHomepageBriefingScore(olderPrimary));
    const out = mergeAndRankBriefingCandidates([olderPrimary, breakingWire]);
    expect(out[0].intelItem.id).toBe('wire-break');

    vi.useRealTimers();
  });

  it('F: small pool returns fewer slots rather than padding with stale garbage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    const staleOnly = {
      kind: 'intel' as const,
      briefLane: 'voices' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: 70,
      weightedScore: 70 * BRIEFING_LANE_WEIGHT.voices,
      intelItem: {
        id: 'st',
        canonicalUrl: 'https://v.test/stale',
        title: 'Stale',
        sourceSlug: 'v',
        publishedAt: '2025-06-01T12:00:00.000Z',
        deskLane: 'voices',
        provenanceClass: 'COMMENTARY',
      },
    };

    const hp = computeHomepageBriefingScore(staleOnly);
    expect(passesFallbackGate(staleOnly, hp)).toBe(false);

    const out = mergeAndRankBriefingCandidates([staleOnly]);
    expect(out.length).toBe(0);

    vi.useRealTimers();
  });
});

describe('passesFallbackGate (voices commentary)', () => {
  it('blocks voices commentary when older than VOICES_COMMENTARY window and raw is below threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    const voiceCommentary = {
      kind: 'intel' as const,
      briefLane: 'voices' as const,
      briefingOrigin: 'lane_backstop' as const,
      rawScore: 68,
      weightedScore: 68 * BRIEFING_LANE_WEIGHT.voices,
      intelItem: {
        id: 'vc',
        canonicalUrl: 'https://v.test/x',
        title: 'X',
        sourceSlug: 'v',
        publishedAt: '2026-04-13T11:00:00.000Z',
        deskLane: 'voices',
        provenanceClass: 'COMMENTARY',
      },
    };

    const age = hoursSincePublished(voiceCommentary.intelItem.publishedAt);
    expect(age).toBeGreaterThan(VOICES_COMMENTARY_FALLBACK_MAX_AGE_H);
    expect(passesFallbackGate(voiceCommentary, 80)).toBe(false);

    vi.useRealTimers();
  });
});

describe('homepage briefing payload shape', () => {
  it('includes briefing desk explain metadata (limits + per-lane counts)', async () => {
    vi.resetModules();

    vi.doMock('next/cache', () => {
      return {
        unstable_cache: (cb: unknown) => cb,
      };
    });

    vi.doMock('@/lib/feeds/liveIntel.service', () => {
      return {
        getLiveIntelDeskForHomepageBriefing: vi.fn(async (lane: string) => {
          if (lane === 'watchdogs') return { configured: true, items: [{ id: 'w1' }] };
          if (lane === 'defense_ops') return { configured: true, items: [{ id: 'd1' }, { id: 'd2' }] };
          if (lane === 'voices') return { configured: true, items: [] };
          return { configured: true, items: [{ id: 'o1' }] };
        }),
      };
    });

    vi.doMock('@/lib/newswire', async () => {
      const actual = await vi.importActual<typeof import('@/lib/newswire')>('@/lib/newswire');
      return { ...actual, getNewswireStories: vi.fn(async () => []) };
    });

    const { getHomeLiveBriefingWithExplain } = await import('@/lib/feeds/homepageBriefing.service');
    const payload = await getHomeLiveBriefingWithExplain();

    expect(payload).toHaveProperty('items');
    expect(payload).toHaveProperty('explain.pool.briefingDesk.limits');
    expect(payload.explain.pool.briefingDesk.desks.osint).toBe(1);
    expect(payload.explain.pool.briefingDesk.desks.watchdogs).toBe(1);
    expect(payload.explain.pool.briefingDesk.desks.defense_ops).toBe(2);
    expect(payload.explain.pool.briefingDesk.desks.voices).toBe(0);
  });

  it('uses voices as signal but does not directly rank voices items into the briefing rail', async () => {
    vi.resetModules();

    vi.doMock('next/cache', () => {
      return {
        unstable_cache: (cb: unknown) => cb,
      };
    });

    vi.doMock('@/lib/feeds/liveIntel.service', () => {
      return {
        getLiveIntelDeskForHomepageBriefing: vi.fn(async (lane: string) => {
          if (lane === 'voices') {
            return {
              configured: true,
              items: [
                {
                  id: 'voice-1',
                  canonicalUrl: 'https://voice.test/post',
                  title: 'Creator post',
                  sourceName: 'Creator',
                  sourceSlug: 'creator',
                  publishedAt: '2026-04-17T10:00:00.000Z',
                  deskLane: 'voices',
                  displayPriority: 88,
                  provenanceClass: 'COMMENTARY',
                },
              ],
            };
          }
          return { configured: true, items: [] };
        }),
      };
    });

    vi.doMock('@/lib/newswire', async () => {
      const actual = await vi.importActual<typeof import('@/lib/newswire')>('@/lib/newswire');
      return { ...actual, getNewswireStories: vi.fn(async () => []) };
    });

    vi.doMock('@/lib/intel/globalPromotion', () => ({
      promoteGlobally: vi.fn(() => [
        {
          representative: {
            id: 'voice-1',
            canonicalUrl: 'https://voice.test/post',
            title: 'Creator post',
            sourceName: 'Creator',
            sourceSlug: 'creator',
            publishedAt: '2026-04-17T10:00:00.000Z',
            deskLane: 'voices',
            provenanceClass: 'COMMENTARY',
            displayPriority: 88,
          },
          decision: {
            totalScore: 88,
            reasons: ['trusted_creator_convergence'],
            eventType: 'generic_report',
            corroboration: { itemCount: 1 },
          },
        },
      ]),
    }));

    const { getHomeLiveBriefingWithExplain } = await import('@/lib/feeds/homepageBriefing.service');
    const payload = await getHomeLiveBriefingWithExplain();

    expect(payload.items).toEqual([]);
    expect(payload.explain.pool.promotedIntel).toBe(0);
    expect(payload.explain.pool.briefingDesk.desks.voices).toBe(1);
  });
});

describe('final homepage briefing display dedupe', () => {
  it('drops later items that resolve to the same normalized external URL (cross-kind)', () => {
    const url = 'https://example.com/a';
    const items = [
      {
        kind: 'intel' as const,
        briefLane: 'osint' as const,
        intelItem: { id: 'i1', canonicalUrl: url },
      },
      {
        kind: 'newswire' as const,
        briefLane: 'newswire' as const,
        story: { id: 'n1', url },
      },
      {
        kind: 'intel' as const,
        briefLane: 'watchdogs' as const,
        intelItem: { id: 'i2', canonicalUrl: 'https://example.com/b' },
      },
    ];

    const out = dedupeHomepageBriefingItemsForDisplay(items);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('intel');
    expect(out[0].intelItem.id).toBe('i1');
    expect(out[1].kind).toBe('intel');
    expect(out[1].intelItem.id).toBe('i2');
  });

  it('ensures the hero/first item never reappears later in the returned array', () => {
    const url = 'https://example.com/hero';
    const items = [
      {
        kind: 'newswire' as const,
        briefLane: 'newswire' as const,
        story: { id: 'hero', url },
      },
      {
        kind: 'newswire' as const,
        briefLane: 'newswire' as const,
        story: { id: 'dupe-later', url },
      },
      {
        kind: 'newswire' as const,
        briefLane: 'newswire' as const,
        story: { id: 'ok', url: 'https://example.com/other' },
      },
    ];

    const out = dedupeHomepageBriefingItemsForDisplay(items);
    const heroKey = homepageBriefingDisplayDedupeKey(out[0]);
    expect(heroKey).toBeTruthy();
    expect(out.slice(1).some((it) => homepageBriefingDisplayDedupeKey(it) === heroKey)).toBe(false);
  });

  it('preserves ordering for non-duplicate items', () => {
    const items = [
      {
        kind: 'intel' as const,
        briefLane: 'osint' as const,
        intelItem: { id: 'i1', canonicalUrl: 'https://example.com/1' },
      },
      {
        kind: 'intel' as const,
        briefLane: 'watchdogs' as const,
        intelItem: { id: 'i2', canonicalUrl: 'https://example.com/2' },
      },
      {
        kind: 'intel' as const,
        briefLane: 'defense_ops' as const,
        intelItem: { id: 'i3', canonicalUrl: 'https://example.com/3' },
      },
    ];

    const out = dedupeHomepageBriefingItemsForDisplay(items);
    expect(out.map((it) => it.intelItem.id)).toEqual(['i1', 'i2', 'i3']);
  });
});
