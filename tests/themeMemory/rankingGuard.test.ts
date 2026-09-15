import { describe, expect, it } from 'vitest';

import {
  resolveThemeRankingMode,
  THEME_ATTENTION_RANKING,
} from '@/lib/intel/themeAttentionRanking';

describe('Theme Memory ranking guardrails', () => {
  it('keeps ranking in shadow-capable modes without changing the +5 cap', () => {
    expect(THEME_ATTENTION_RANKING.MAX_CONTRIBUTION).toBe(5);
    expect(THEME_ATTENTION_RANKING.COOLING_MAX_CONTRIBUTION).toBe(2);
    expect(THEME_ATTENTION_RANKING.COMBINED_CREATOR_INFLUENCE_CAP).toBe(7);
    expect(THEME_ATTENTION_RANKING.MIN_CREATOR_BREADTH_7D).toBe(2);
    expect(resolveThemeRankingMode({})).toBe('off');
    expect(resolveThemeRankingMode({ THEME_RANKING_MODE: 'shadow' })).toBe('shadow');
  });
});
