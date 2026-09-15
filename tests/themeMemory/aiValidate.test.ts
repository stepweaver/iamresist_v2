import { describe, expect, it } from 'vitest';

import { ThemeAIValidationError } from '@/lib/themeMemory/ai/types';
import {
  parseMembershipOutput,
  parseThemeLabelOutput,
  validateMembershipOutput,
} from '@/lib/themeMemory/ai/validate';

describe('Theme Memory AI output validation', () => {
  it('accepts well-formed membership JSON', () => {
    const decision = parseMembershipOutput(
      JSON.stringify({
        belongs: true,
        confidence: 0.87,
        reasons: ['same named person', 'same legal dispute', 'same action'],
      }),
    );
    expect(decision.belongs).toBe(true);
    expect(decision.confidence).toBe(0.87);
    expect(decision.reasons).toHaveLength(3);
  });

  it('rejects malformed membership output instead of coercing it', () => {
    expect(() => validateMembershipOutput({ belongs: 'yes', confidence: 0.9, reasons: [] })).toThrow(ThemeAIValidationError);
    expect(() => validateMembershipOutput({ belongs: true, confidence: 1.4, reasons: [] })).toThrow(ThemeAIValidationError);
    expect(() => validateMembershipOutput({ belongs: true, confidence: 87, reasons: [] })).toThrow(ThemeAIValidationError);
    expect(() => parseMembershipOutput('not json')).toThrow(ThemeAIValidationError);
  });

  it('rejects oversized or missing label fields', () => {
    expect(() =>
      parseThemeLabelOutput(JSON.stringify({ canonicalLabel: 'ok', headline: 'ok', summary: 'ok' })),
    ).not.toThrow();
    expect(() => parseThemeLabelOutput(JSON.stringify({ headline: 'ok', summary: 'ok' }))).toThrow(ThemeAIValidationError);
    expect(() =>
      parseThemeLabelOutput(
        JSON.stringify({
          canonicalLabel: 'x'.repeat(81),
          headline: 'ok',
          summary: 'ok',
        }),
      ),
    ).toThrow(ThemeAIValidationError);
  });
});
