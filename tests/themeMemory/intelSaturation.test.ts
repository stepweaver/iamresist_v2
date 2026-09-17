import { describe, expect, it } from 'vitest';

import {
  excludedByIntelCandidateCap,
  measureIntelCandidateSaturation,
} from '@/lib/themeMemory/intelSaturation';

describe('Theme Memory Intel candidate saturation', () => {
  it('marks the 1000-row cap as hit when selected fills the limit', () => {
    const selected = Array.from({ length: 1000 }, (_, index) => ({
      identityKey: `url:https://example.test/${index}`,
      sourceSlug: 'lawfare',
      sourceSystem: 'intel',
      publishedAt: new Date(Date.parse('2026-09-16T16:00:00.000Z') - index * 3600000).toISOString(),
    }));
    const saturation = measureIntelCandidateSaturation({
      availableInWindow: 1535,
      selected,
      fetchedRaw: 1000,
      candidateLimit: 1000,
      windowStart: '2026-09-02T16:00:00.000Z',
      windowEnd: '2026-09-16T16:00:00.000Z',
    });
    expect(saturation.candidateLimitHit).toBe(true);
    expect(saturation.availableInWindow).toBe(1535);
    expect(saturation.selectedForProcessing).toBe(1000);
    expect(saturation.newestSelectedAt).toBe('2026-09-16T16:00:00.000Z');
    expect(saturation.oldestSelectedAt).toBeTruthy();
    expect(saturation.selectedIdentityKeys[0]).toMatch(/^intel:lawfare:/);
  });

  it('does not mark the cap as hit when the window is smaller than the limit', () => {
    const saturation = measureIntelCandidateSaturation({
      availableInWindow: 40,
      selected: [
        {
          identityKey: 'url:https://example.test/a',
          sourceSlug: 'lawfare',
          publishedAt: '2026-09-16T12:00:00.000Z',
        },
      ],
      fetchedRaw: 1,
      candidateLimit: 1000,
      windowStart: '2026-09-02T16:00:00.000Z',
      windowEnd: '2026-09-16T16:00:00.000Z',
    });
    expect(saturation.candidateLimitHit).toBe(false);
    expect(saturation.selectedForProcessing).toBe(1);
  });

  it('treats older in-window items as excluded by cap only when the cap is hit', () => {
    expect(
      excludedByIntelCandidateCap({
        insideProcessWindow: true,
        presentInSelectedSet: false,
        candidateLimitHit: true,
        itemTimestamp: '2026-09-03T12:00:00.000Z',
        oldestSelectedAt: '2026-09-09T16:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      excludedByIntelCandidateCap({
        insideProcessWindow: true,
        presentInSelectedSet: false,
        candidateLimitHit: false,
        itemTimestamp: '2026-09-03T12:00:00.000Z',
        oldestSelectedAt: '2026-09-09T16:00:00.000Z',
      }),
    ).toBe(false);
  });
});
