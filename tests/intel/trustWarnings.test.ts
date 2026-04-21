import { describe, expect, it } from 'vitest';
import {
  BASELINE_INLINE_TRUST_EXPLAIN,
  computeTrustWarnings,
  shouldShowInlineTrustExplain,
} from '@/lib/intel/trustWarnings';
import { getLaneWarningCopy } from '@/components/intel/IntelLaneWarning';

function base(over: Partial<Parameters<typeof computeTrustWarnings>[0]> = {}) {
  return {
    source: {
      trustWarningMode: 'none' as const,
      trustWarningLevel: 'info' as const,
      requiresIndependentVerification: false,
      heroEligibilityMode: 'normal' as const,
      trustWarningText: null,
    },
    item: {
      title: 'Title',
      summary: null,
      sourceSlug: 'x',
      institutionalArea: 'unknown',
      missionTags: [],
      clusterKeys: {},
    },
    ...over,
  };
}

describe('computeTrustWarnings', () => {
  it('adds SOURCE-CONTROLLED / OFFICIAL CLAIM / VERIFY INDEPENDENTLY for official-claim sources', () => {
    const out = computeTrustWarnings(
      base({
        source: {
          trustWarningMode: 'source_controlled_official_claims',
          trustWarningLevel: 'caution',
          requiresIndependentVerification: true,
          heroEligibilityMode: 'demote_low_substance',
          trustWarningText: 'Official channel note',
        },
        item: {
          title: 'White House statement',
          summary: 'Some framing',
          sourceSlug: 'wh-news',
          institutionalArea: 'white_house',
          missionTags: ['executive_power'],
          clusterKeys: {},
        },
      }),
    );

    const labels = out.trustBadges.map((b) => b.label);
    expect(labels).toContain('SOURCE-CONTROLLED');
    expect(labels).toContain('OFFICIAL CLAIM');
    expect(labels).toContain('VERIFY INDEPENDENTLY');
    expect(out.politically_interested_source).toBe(true);
    expect(out.official_claim).toBe(true);
    expect(out.requires_independent_verification).toBe(true);
    expect(out.trustExplain).toBeTruthy();
  });

  it('detects ceremonial/low-substance patterns deterministically', () => {
    const out = computeTrustWarnings(
      base({
        source: {
          trustWarningMode: 'source_controlled_official_claims',
          trustWarningLevel: 'caution',
          requiresIndependentVerification: true,
          heroEligibilityMode: 'demote_low_substance',
          trustWarningText: null,
        },
        item: {
          title: 'A Proclamation on National Something Day',
          summary: null,
          sourceSlug: 'wh-presidential',
          institutionalArea: 'white_house',
          missionTags: ['executive_power'],
          clusterKeys: { proclamation: '123' },
        },
      }),
    );

    expect(out.ceremonial_or_low_substance).toBe(true);
    expect(out.trustRuleExplanations.map((e) => e.ruleId)).toContain('trust:low_substance_text');
  });

  it('only emits CONTESTED CLAIM when explicit dispute language and scoped tags are present', () => {
    const out = computeTrustWarnings(
      base({
        source: {
          trustWarningMode: 'source_controlled_official_claims',
          trustWarningLevel: 'caution',
          requiresIndependentVerification: true,
          heroEligibilityMode: 'demote_low_substance',
          trustWarningText: null,
        },
        item: {
          title: 'Fact check: judge rebukes false claim',
          summary: null,
          sourceSlug: 'wh-news',
          institutionalArea: 'white_house',
          missionTags: ['voting_rights'],
          clusterKeys: {},
        },
      }),
    );

    expect(out.contested_claim).toBe(true);
    expect(out.trustBadges.map((b) => b.label)).toContain('CONTESTED CLAIM');
  });

  it('does not emit CONTESTED CLAIM when dispute text is present but tags are out of scope', () => {
    const out = computeTrustWarnings(
      base({
        source: {
          trustWarningMode: 'source_controlled_official_claims',
          trustWarningLevel: 'caution',
          requiresIndependentVerification: true,
          heroEligibilityMode: 'demote_low_substance',
          trustWarningText: null,
        },
        item: {
          title: 'Fact check: claim disputed',
          summary: null,
          sourceSlug: 'wh-news',
          institutionalArea: 'white_house',
          missionTags: ['executive_power'],
          clusterKeys: {},
        },
      }),
    );

    expect(out.contested_claim).toBe(false);
    expect(out.trustBadges.map((b) => b.label)).not.toContain('CONTESTED CLAIM');
  });
});

describe('shouldShowInlineTrustExplain', () => {
  const baselineRow = {
    trustExplain: BASELINE_INLINE_TRUST_EXPLAIN,
    trustBadges: [
      { label: 'SOURCE-CONTROLLED' as const, tone: 'caution' as const, tooltip: 'Baseline' },
      { label: 'OFFICIAL CLAIM' as const, tone: 'neutral' as const, tooltip: 'Baseline' },
      { label: 'VERIFY INDEPENDENTLY' as const, tone: 'caution' as const, tooltip: 'Baseline' },
    ],
  };

  it('suppresses baseline inline trust text when a lane-level disclosure is active', () => {
    expect(
      shouldShowInlineTrustExplain(baselineRow, { laneHasBaselineDisclosure: true }),
    ).toBe(false);
  });

  it('keeps elevated inline trust text on a lane-level disclosure view', () => {
    expect(
      shouldShowInlineTrustExplain(
        {
          trustExplain: BASELINE_INLINE_TRUST_EXPLAIN,
          trustBadges: [
            { label: 'SOURCE-CONTROLLED' as const, tone: 'caution' as const, tooltip: 'Baseline' },
            { label: 'CONTESTED CLAIM' as const, tone: 'high' as const, tooltip: 'Elevated' },
          ],
        },
        { laneHasBaselineDisclosure: true },
      ),
    ).toBe(true);
  });

  it('still allows the same baseline trust text without page-level disclosure context', () => {
    expect(
      shouldShowInlineTrustExplain(baselineRow, { laneHasBaselineDisclosure: false }),
    ).toBe(true);
  });
});

describe('IntelLaneWarning copy', () => {
  it('defines a Voices lane disclaimer for creator commentary + feed previews', () => {
    const copy = getLaneWarningCopy('voices');
    expect(copy).toBeTruthy();
    expect(copy?.title).toMatch(/voices/i);
    expect(copy?.body).toMatch(/creator commentary/i);
    expect(copy?.body).toMatch(/public-feed previews/i);
    expect(copy?.body).toMatch(/not neutral reporting/i);
    expect(copy?.body).toMatch(/not.*primary records/i);
    expect(copy?.body).toMatch(/verify factual claims/i);
  });

  it('keeps OSINT and defense_ops warning copy available', () => {
    expect(getLaneWarningCopy('osint')?.body).toMatch(/verify key assertions/i);
    expect(getLaneWarningCopy('defense_ops')?.body).toMatch(/verify key assertions/i);
  });
});

