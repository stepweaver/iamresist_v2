import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  bridgeNewswireStoryScore,
  mergeAndRankBriefingCandidates,
  weightedBriefingScore,
} from '@/lib/feeds/homepageBriefing.service';
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
  it('dedupes by normalized URL and keeps higher weighted score first', () => {
    const url = 'https://example.com/dupe';
    const candidates = [
      {
        kind: 'newswire' as const,
        briefLane: 'newswire' as const,
        rawScore: 60,
        weightedScore: 60 * BRIEFING_LANE_WEIGHT.newswire,
        story: { id: 'n1', url, title: 'A', sourceSlug: 's', publishedAt: null },
      },
      {
        kind: 'intel' as const,
        briefLane: 'osint' as const,
        rawScore: 90,
        weightedScore: 90 * BRIEFING_LANE_WEIGHT.osint,
        intelItem: {
          id: 'i1',
          canonicalUrl: url,
          title: 'B',
          sourceName: 'X',
          sourceSlug: 'x',
          publishedAt: null,
          deskLane: 'osint',
        },
      },
    ];
    const out = mergeAndRankBriefingCandidates(candidates);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('intel');
  });

  it('uses a strict lane cap first then backfills up to total slots when one lane dominates', () => {
    const mk = (id: string, w: number) => ({
      kind: 'intel' as const,
      briefLane: 'osint' as const,
      rawScore: w,
      weightedScore: w * BRIEFING_LANE_WEIGHT.osint,
      intelItem: {
        id,
        canonicalUrl: `https://example.test/${id}`,
        title: id,
        sourceName: 'S',
        sourceSlug: 's',
        publishedAt: null,
        deskLane: 'osint',
        displayPriority: w,
      },
    });
    const sixOsint = [mk('a', 90), mk('b', 89), mk('c', 88), mk('d', 87), mk('e', 86), mk('f', 85)];
    const out = mergeAndRankBriefingCandidates(sixOsint);
    expect(out.length).toBe(BRIEFING_TOTAL_SLOTS);
    expect(out.every((x) => x.briefLane === 'osint')).toBe(true);
  });
});
