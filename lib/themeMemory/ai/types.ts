/**
 * Theme Memory AI boundary.
 * Do not leak provider-specific types through the rest of the codebase.
 */

import type { ThemeFingerprint } from '@/lib/themeMemory/themeTypes';
import type { ThemeLabelResult, ThemeMembershipDecision } from '@/lib/themeMemory/themeTypes';

export type ThemeMembershipClassifyInput = {
  itemTitle: string;
  itemSummary: string | null;
  itemRole: string;
  itemSourceSystem: string;
  itemSourceName: string;
  themeLabel: string;
  themeHeadline: string | null;
  themeMemberTitles: string[];
  fingerprintOverlap: {
    sharedDistinctive: string[];
    sharedPhrases: string[];
    reasons: string[];
  };
  itemFingerprint: ThemeFingerprint;
};

export type ThemeLabelGenerateInput = {
  currentLabel: string;
  memberTitles: string[];
  memberRoles: string[];
  creatorNames: string[];
};

export interface ThemeAIProvider {
  readonly name: string;
  readonly model: string | null;
  classifyMembership(input: ThemeMembershipClassifyInput): Promise<ThemeMembershipDecision>;
  generateThemeLabel(input: ThemeLabelGenerateInput): Promise<ThemeLabelResult>;
}

export class ThemeAIUnavailableError extends Error {
  readonly code: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ThemeAIUnavailableError';
    this.code = code || message;
  }
}

export class ThemeAIValidationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ThemeAIValidationError';
    this.code = code;
  }
}
