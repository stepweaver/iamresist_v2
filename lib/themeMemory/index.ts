export {
  THEME_CANDIDATE_ROLES,
  THEME_MEMORY_INTEL_CANDIDATE_LIMIT,
  THEME_MEMORY_ITEMS_PER_NEWSWIRE_SOURCE,
  THEME_MEMORY_ITEMS_PER_VOICE,
  THEME_MEMORY_OBSERVATION_QUERY_LIMIT,
  THEME_MEMORY_WINDOW_DAYS,
  THEME_OBSERVATION_SOURCE_SYSTEMS,
  THEME_SOURCE_SYSTEMS,
} from '@/lib/themeMemory/types';

export type {
  ThemeCandidateItem,
  ThemeCandidateRole,
  ThemeMemoryWindow,
  ThemeMemoryWindowDays,
  ThemeObservationRow,
  ThemeObservationSourceSystem,
  ThemeSourceSystem,
} from '@/lib/themeMemory/types';

export {
  canonicalizeThemeUrl,
  dedupeThemeCandidates,
  hashThemeCandidatePayload,
  normalizeIntelThemeCandidate,
  normalizeNewswireThemeCandidate,
  normalizeVoiceThemeCandidate,
  roleForIntelItem,
  roleForNewswireItem,
  roleForVoiceItem,
  themeCandidateId,
  themeIdentityFromCanonical,
  themeObservationIdentityKey,
} from '@/lib/themeMemory/normalize';

export {
  isTimestampInWindow,
  resolveThemeMemoryWindow,
  timestampMs,
  toUtcIso,
  windowForDays,
} from '@/lib/themeMemory/windows';

export { ingestThemeMemorySources, deriveThemeMemoryIngestOverallStatus } from '@/lib/themeMemory/ingest';
export type { ThemeMemoryIngestResult } from '@/lib/themeMemory/ingest';

export {
  auditThemeRankingCoverage,
  formatThemeRankingCoverageReport,
  loadThemeRankingCoverageAudit,
} from '@/lib/themeMemory/rankingCoverageAudit';
export type {
  ThemeCoverageDeskItem,
  ThemeCoveragePreviewOutcome,
  ThemeCoverageState,
  ThemeRankingCoverageReport,
} from '@/lib/themeMemory/rankingCoverageAudit';

export {
  describeThemeMemoryWindow,
  filterCandidatesByWindow,
  getThemeCandidateItems,
  getThemeCandidateItemsByWindows,
  getThemeCandidateItemsForDays,
} from '@/lib/themeMemory/query';

export { getThemeMemoryDiagnostics } from '@/lib/themeMemory/diagnostics';
export type { ThemeMemoryDiagnostics } from '@/lib/themeMemory/diagnostics';

export type {
  ThemeAttentionForItem,
  ThemeAttentionItemRef,
  ThemeReadModel,
} from '@/lib/themeMemory/readModel';

export {
  THEME_CLASSIFICATION_VERSION,
  THEME_LABEL_PROMPT_VERSION,
  THEME_LIFECYCLE_THRESHOLDS,
  THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
  THEME_MEMBERSHIP_PROMPT_VERSION,
  themeClassificationCacheVersion,
} from '@/lib/themeMemory/constants';

export type {
  MembershipMethod,
  ThemeDailySignalRecord,
  ThemeLabelResult,
  ThemeLifecycle,
  ThemeMemberRole,
  ThemeMembershipDecision,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';

export { processThemeMemory, emptyThemeProcessDiagnostics } from '@/lib/themeMemory/process';
export type { ThemeProcessDiagnostics, ThemeProcessResult } from '@/lib/themeMemory/process';

export { createMemoryThemeStore } from '@/lib/themeMemory/store';
export { createDeterministicThemeAIProvider } from '@/lib/themeMemory/ai/deterministic';

export {
  getActiveThemes,
  getThemeAttentionForItem,
  getThemeAttentionForItems,
  getThemeById,
  getThemeMembers,
  getThemeTimeline,
  themeAttentionKey,
} from '@/lib/themeMemory/readModel';

