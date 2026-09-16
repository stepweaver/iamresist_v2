import { resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import {
  assertThemeReclassifyDryRun,
  formatThemeReclassifyReport,
  reclassifyLegacyCoreMemberships,
  THEME_RECLASSIFY_WRITE_BLOCKED,
  type ThemeReclassifyReport,
} from '@/lib/themeMemory/reclassify';
import { listAllMembershipRecords, listAllThemeRecords } from '@/lib/themeMemory/themesDb';
import type { ThemeStore } from '@/lib/themeMemory/store';
import type { ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';

export type ThemeReclassifyRunDeps = {
  listThemes?: () => Promise<ThemeRecord[]>;
  listMemberships?: () => Promise<ThemeMembershipRecord[]>;
  store?: ThemeStore;
};

export type WriteBlockedThemeStore = {
  store: ThemeStore;
  writesAttempted: () => number;
};

export function createWriteBlockedThemeStore(inner: ThemeStore): WriteBlockedThemeStore {
  let writes = 0;
  const block = async () => {
    writes += 1;
    throw new Error(THEME_RECLASSIFY_WRITE_BLOCKED);
  };
  return {
    store: {
      listThemes: (...args) => inner.listThemes(...args),
      listThemesByIds: (...args) => inner.listThemesByIds(...args),
      listMemberships: (...args) => inner.listMemberships(...args),
      getMembershipByItem: (...args) => inner.getMembershipByItem(...args),
      getMembershipsByItems: (...args) => inner.getMembershipsByItems(...args),
      listSignals: (...args) => inner.listSignals(...args),
      listSignalsByThemeIds: (...args) => inner.listSignalsByThemeIds(...args),
      getAnalysis: (...args) => inner.getAnalysis(...args),
      upsertTheme: block,
      upsertMembership: block,
      upsertSignal: block,
      upsertAnalysis: block,
    },
    writesAttempted: () => writes,
  };
}

export function parseThemeReclassifyArgs(argv: string[]): { dryRun: boolean; apply: boolean } {
  return {
    dryRun: argv.includes('--dry-run'),
    apply: argv.includes('--apply'),
  };
}

export async function runThemeMembershipReclassify(input: {
  dryRun?: boolean;
  apply?: boolean;
  rankingMode?: string;
  deps?: ThemeReclassifyRunDeps;
}): Promise<ThemeReclassifyReport> {
  assertThemeReclassifyDryRun({ dryRun: input.dryRun, apply: input.apply });

  const blocked = input.deps?.store ? createWriteBlockedThemeStore(input.deps.store) : null;
  const listThemes =
    input.deps?.listThemes ||
    (blocked ? () => blocked.store.listThemes() : listAllThemeRecords);
  const listMemberships =
    input.deps?.listMemberships ||
    (blocked ? () => blocked.store.listMemberships() : listAllMembershipRecords);

  const themes = await listThemes();
  const memberships = await listMemberships();
  if (blocked && blocked.writesAttempted() !== 0) {
    throw new Error(THEME_RECLASSIFY_WRITE_BLOCKED);
  }

  return reclassifyLegacyCoreMemberships({
    themes,
    memberships,
    rankingMode: input.rankingMode ?? resolveThemeRankingMode(),
    databaseWrites: blocked?.writesAttempted() ?? 0,
  });
}

export { formatThemeReclassifyReport };
