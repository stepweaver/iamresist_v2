import { describe, expect, it } from 'vitest';

import { pairRecommendation, sameEventChoiceAndNoul } from '@/lib/jev/policy';

describe('Jev same-event policy', () => {
  const candidateId = 'event-27';

  it('records a merge only when candidate choice, pair choice, and noul agree', () => {
    expect(
      pairRecommendation({
        candidateChoice: candidateId,
        candidateId,
        pairChoice: 'same_event',
        noul: 0.91,
        noulThreshold: 0.8,
      }),
    ).toBe('merge');
  });

  it('keeps a weak noul or a disagreeing choice as review_or_split', () => {
    expect(
      pairRecommendation({
        candidateChoice: candidateId,
        candidateId,
        pairChoice: 'same_event',
        noul: 0.4,
        noulThreshold: 0.8,
      }),
    ).toBe('review_or_split');
    expect(
      pairRecommendation({
        candidateChoice: 'new_event',
        candidateId,
        pairChoice: 'same_event',
        noul: 0.99,
        noulThreshold: 0.8,
      }),
    ).toBe('review_or_split');
    expect(
      pairRecommendation({
        candidateChoice: candidateId,
        candidateId,
        pairChoice: 'related_but_distinct',
        noul: 0.99,
        noulThreshold: 0.8,
      }),
    ).toBe('review_or_split');
    expect(
      pairRecommendation({
        candidateChoice: candidateId,
        candidateId,
        pairChoice: 'unrelated',
        noul: 0.1,
        noulThreshold: 0.8,
      }),
    ).toBe('review_or_split');
    expect(
      pairRecommendation({
        candidateChoice: candidateId,
        candidateId,
        pairChoice: 'uncertain',
        noul: 0.99,
        noulThreshold: 0.8,
      }),
    ).toBe('review_or_split');
  });

  it('treats pair choice plus noul as the same-event identification', () => {
    expect(sameEventChoiceAndNoul({ pairChoice: 'same_event', noul: 0.8, noulThreshold: 0.8 })).toBe(true);
    expect(sameEventChoiceAndNoul({ pairChoice: 'same_event', noul: 0.79, noulThreshold: 0.8 })).toBe(false);
    expect(sameEventChoiceAndNoul({ pairChoice: 'unrelated', noul: 0.99, noulThreshold: 0.8 })).toBe(false);
  });
});
