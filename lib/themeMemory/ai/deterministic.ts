import { deterministicLabelFromFingerprint } from '@/lib/themeMemory/features';
import type { ThemeAIProvider, ThemeLabelGenerateInput, ThemeMembershipClassifyInput } from '@/lib/themeMemory/ai/types';
import type { ThemeLabelResult, ThemeMembershipDecision } from '@/lib/themeMemory/themeTypes';

/**
 * No-AI fallback. Conservative: never claims topical membership on its own.
 * Deterministic narrowing/accept still happens outside this provider.
 * Labels are derived from existing member metadata only.
 */
export function createDeterministicThemeAIProvider(): ThemeAIProvider {
  return {
    name: 'none',
    model: null,
    async classifyMembership(_input: ThemeMembershipClassifyInput): Promise<ThemeMembershipDecision> {
      return {
        belongs: false,
        confidence: 0,
        reasons: ['ai_unavailable_deterministic_fallback'],
      };
    },
    async generateThemeLabel(input: ThemeLabelGenerateInput): Promise<ThemeLabelResult> {
      const label = input.currentLabel.trim() || deterministicLabelFromFingerprint(
        {
          distinctiveTokens: [],
          supportingTokens: [],
          phrases: [],
          weakEntities: [],
          clusterKeys: {},
          actionHints: [],
          eventType: null,
          entitySpans: [],
        },
        input.currentLabel,
      );
      const creatorNote = input.creatorNames.length
        ? `Tracked creators (${input.creatorNames.slice(0, 4).join(', ')}) continued covering this subject.`
        : 'Tracked creators continued covering this subject.';
      return {
        canonicalLabel: label.slice(0, 80),
        headline: `Coverage of ${label} continues`.slice(0, 140),
        summary: creatorNote.slice(0, 400),
      };
    },
  };
}
