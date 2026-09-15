import { themeClassificationCacheVersion } from '@/lib/themeMemory/constants';
import type {
  ThemeDailySignalRecord,
  ThemeItemAnalysisRecord,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';
import type { ThemeSourceSystem } from '@/lib/themeMemory/types';

export function themeItemKey(input: {
  source_system: string;
  source_slug: string;
  identity_key: string;
}): string {
  return `${input.source_system}:${input.source_slug}:${input.identity_key}`;
}

export type ThemeStoreSnapshot = {
  themes: ThemeRecord[];
  memberships: ThemeMembershipRecord[];
  signals: ThemeDailySignalRecord[];
  analyses: ThemeItemAnalysisRecord[];
};

export type ThemeItemIdentity = {
  source_system: ThemeSourceSystem;
  source_slug: string;
  identity_key: string;
};

export type ThemeStore = {
  listThemes(): Promise<ThemeRecord[]>;
  listThemesByIds(ids: string[]): Promise<ThemeRecord[]>;
  upsertTheme(row: ThemeRecord): Promise<ThemeRecord>;
  listMemberships(themeIds?: string[]): Promise<ThemeMembershipRecord[]>;
  getMembershipByItem(input: ThemeItemIdentity): Promise<ThemeMembershipRecord | null>;
  getMembershipsByItems(items: ThemeItemIdentity[]): Promise<ThemeMembershipRecord[]>;
  upsertMembership(row: ThemeMembershipRecord): Promise<ThemeMembershipRecord>;
  listSignals(themeId?: string): Promise<ThemeDailySignalRecord[]>;
  listSignalsByThemeIds(themeIds: string[]): Promise<ThemeDailySignalRecord[]>;
  upsertSignal(row: ThemeDailySignalRecord): Promise<ThemeDailySignalRecord>;
  getAnalysis(input: ThemeItemIdentity): Promise<ThemeItemAnalysisRecord | null>;
  upsertAnalysis(row: ThemeItemAnalysisRecord): Promise<ThemeItemAnalysisRecord>;
};

export function createMemoryThemeStore(seed: Partial<ThemeStoreSnapshot> = {}): ThemeStore {
  const themes = new Map<string, ThemeRecord>();
  const memberships = new Map<string, ThemeMembershipRecord>();
  const membershipByItem = new Map<string, string>();
  const signals = new Map<string, ThemeDailySignalRecord>();
  const analyses = new Map<string, ThemeItemAnalysisRecord>();

  for (const row of seed.themes || []) themes.set(row.id, { ...row, metadata: { ...row.metadata } });
  for (const row of seed.memberships || []) {
    memberships.set(row.id, { ...row, membership_reasons: [...row.membership_reasons], metadata: { ...row.metadata } });
    membershipByItem.set(themeItemKey(row), row.id);
  }
  for (const row of seed.signals || []) {
    signals.set(`${row.theme_id}:${row.signal_date}`, { ...row, metadata: { ...row.metadata } });
  }
  for (const row of seed.analyses || []) {
    analyses.set(themeItemKey(row), { ...row, reasons: [...row.reasons] });
  }

  return {
    async listThemes() {
      return [...themes.values()].map((row) => ({ ...row, metadata: { ...row.metadata } }));
    },
    async listThemesByIds(ids) {
      const wanted = new Set(ids);
      return [...themes.values()]
        .filter((row) => wanted.has(row.id))
        .map((row) => ({ ...row, metadata: { ...row.metadata } }));
    },
    async upsertTheme(row) {
      themes.set(row.id, { ...row, metadata: { ...row.metadata } });
      return { ...row, metadata: { ...row.metadata } };
    },
    async listMemberships(themeIds) {
      const wanted = themeIds ? new Set(themeIds) : null;
      return [...memberships.values()]
        .filter((row) => !wanted || wanted.has(row.theme_id))
        .map((row) => ({ ...row, membership_reasons: [...row.membership_reasons], metadata: { ...row.metadata } }));
    },
    async getMembershipByItem(input) {
      const id = membershipByItem.get(themeItemKey(input));
      if (!id) return null;
      const row = memberships.get(id);
      return row
        ? { ...row, membership_reasons: [...row.membership_reasons], metadata: { ...row.metadata } }
        : null;
    },
    async getMembershipsByItems(items) {
      const out: ThemeMembershipRecord[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const key = themeItemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        const id = membershipByItem.get(key);
        if (!id) continue;
        const row = memberships.get(id);
        if (row) {
          out.push({
            ...row,
            membership_reasons: [...row.membership_reasons],
            metadata: { ...row.metadata },
          });
        }
      }
      return out;
    },
    async upsertMembership(row) {
      const itemKey = themeItemKey(row);
      const existingId = membershipByItem.get(itemKey);
      if (existingId && existingId !== row.id) {
        const existing = memberships.get(existingId);
        if (existing) return { ...existing, membership_reasons: [...existing.membership_reasons], metadata: { ...existing.metadata } };
      }
      memberships.set(row.id, { ...row, membership_reasons: [...row.membership_reasons], metadata: { ...row.metadata } });
      membershipByItem.set(itemKey, row.id);
      return { ...row, membership_reasons: [...row.membership_reasons], metadata: { ...row.metadata } };
    },
    async listSignals(themeId) {
      return [...signals.values()]
        .filter((row) => !themeId || row.theme_id === themeId)
        .map((row) => ({ ...row, metadata: { ...row.metadata } }));
    },
    async listSignalsByThemeIds(themeIds) {
      const wanted = new Set(themeIds);
      return [...signals.values()]
        .filter((row) => wanted.has(row.theme_id))
        .map((row) => ({ ...row, metadata: { ...row.metadata } }));
    },
    async upsertSignal(row) {
      signals.set(`${row.theme_id}:${row.signal_date}`, { ...row, metadata: { ...row.metadata } });
      return { ...row, metadata: { ...row.metadata } };
    },
    async getAnalysis(input) {
      const row = analyses.get(themeItemKey(input));
      return row ? { ...row, reasons: [...row.reasons] } : null;
    },
    async upsertAnalysis(row) {
      analyses.set(themeItemKey(row), { ...row, reasons: [...row.reasons] });
      return { ...row, reasons: [...row.reasons] };
    },
  };
}

export function analysisIsCurrent(
  row: ThemeItemAnalysisRecord,
  contentHash: string,
  classificationVersion: string = themeClassificationCacheVersion('none'),
): boolean {
  return row.content_hash === contentHash && row.classification_version === classificationVersion;
}
