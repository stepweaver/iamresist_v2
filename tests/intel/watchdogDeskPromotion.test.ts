import { describe, expect, it } from 'vitest';
import {
  applyAnecdotalIndicatorClassCaps,
  applyWatchdogLeadCorroborationRules,
} from '@/lib/intel/watchdogDeskPromotion';

describe('applyWatchdogLeadCorroborationRules', () => {
  const base = {
    id: 'a',
    sourceSlug: 'meduza-english',
    sourceFamily: 'watchdog_global',
    provenanceClass: 'SPECIALIST',
    missionTags: ['international_relevant'],
    clusterKeys: {},
    publishedAt: new Date().toISOString(),
    surfaceState: 'surfaced',
    displayExplanations: [],
    relevanceExplanations: [],
  };

  it('demotes lead without corroboration on watchdogs lane', () => {
    const items = [
      {
        ...base,
        displayBucket: 'lead' as const,
        displayPriority: 88,
      },
    ];
    const out = applyWatchdogLeadCorroborationRules(items, 'watchdogs');
    expect(out[0]!.displayBucket).toBe('secondary');
    expect(out[0]!.displayExplanations.some((e) => e.ruleId === 'watchdogs:corroboration_cap')).toBe(true);
  });

  it('keeps lead when another watchdog shares a mission tag with a different family', () => {
    const t = new Date().toISOString();
    const items = [
      {
        ...base,
        id: '1',
        displayBucket: 'lead' as const,
        displayPriority: 88,
        publishedAt: t,
      },
      {
        ...base,
        id: '2',
        sourceSlug: 'bellingcat',
        displayBucket: 'routine' as const,
        displayPriority: 50,
        publishedAt: t,
      },
    ];
    const out = applyWatchdogLeadCorroborationRules(items, 'watchdogs');
    expect(out.find((x) => x.id === '1')?.displayBucket).toBe('lead');
  });

  it('is a no-op for osint lane', () => {
    const items = [{ ...base, displayBucket: 'lead' as const, displayPriority: 90 }];
    const out = applyWatchdogLeadCorroborationRules(items, 'osint');
    expect(out[0]!.displayBucket).toBe('lead');
  });
});

describe('applyAnecdotalIndicatorClassCaps', () => {
  it('forces anecdotal rows to routine', () => {
    const items = [
      {
        id: 'x',
        displayBucket: 'lead' as const,
        displayPriority: 90,
        displayExplanations: [],
        indicator_class: 'anecdotal',
      },
    ];
    const out = applyAnecdotalIndicatorClassCaps(items);
    expect(out[0]!.displayBucket).toBe('routine');
    expect(out[0]!.displayPriority).toBeLessThanOrEqual(32);
  });
});
