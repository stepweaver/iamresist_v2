import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  bridgeNewswireStoryScore,
  computeHomepageBriefingScore,
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
