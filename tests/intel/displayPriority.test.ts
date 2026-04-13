import { describe, expect, it } from 'vitest';
import { computeDisplayPriority } from '@/lib/intel/displayPriority';

function base(over: Partial<Parameters<typeof computeDisplayPriority>[0]> = {}) {
  return {
    title: 'Title',
    summary: null,
    provenanceClass: 'PRIMARY' as const,
    sourceSlug: 'wh-presidential',
    stateChangeType: 'presidential_action',
    missionTags: ['executive_power'],
    branchOfGovernment: 'executive',
    institutionalArea: 'white_house',
    relevanceScore: 60,
    clusterKeys: { proclamation: '9999' },
    publishedAt: new Date().toISOString(),
    ...over,
  };
}

describe('computeDisplayPriority', () => {
  it('penalizes ceremonial proclamations so they are not lead by default', () => {
    const out = computeDisplayPriority(
      base({
        title: 'A Proclamation on National Something Day',
        clusterKeys: { proclamation: '12345' },
      }),
    );
    expect(out.displayPriority).toBeLessThan(78);
    expect(out.displayBucket).not.toBe('lead');
    expect(out.displayExplanations.map((e) => e.ruleId)).toContain('display:ceremonial_exec');
  });

  it('boosts high-impact court language', () => {
    const out = computeDisplayPriority(
      base({
        provenanceClass: 'SPECIALIST',
        sourceSlug: 'scotusblog',
        missionTags: ['courts'],
        branchOfGovernment: 'judicial',
        institutionalArea: 'courts',
        title: 'Court grants injunction in major case',
        clusterKeys: {},
      }),
    );
    expect(out.displayPriority).toBeGreaterThan(60);
    expect(out.displayExplanations.map((e) => e.ruleId)).toContain('display:impact_text');
  });
});

