import { resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import {
  assertThemeReclassifyApplySafety,
  assertThemeReclassifyMode,
  buildThemeReclassifyApplyPlan,
  formatThemeReclassifyApplyPlan,
  formatThemeReclassifyReport,
  persistThemeReclassifyPlan,
  reclassifyLegacyCoreMemberships,
  THEME_RECLASSIFY_REQUIRED_RANKING_MODE,
  THEME_RECLASSIFY_SHADOW_REQUIRED,
  THEME_RECLASSIFY_WRITE_BLOCKED,
  themeReclassifyExpectedMismatch,
  withThemeReclassifyApplyResult,
  type ThemeReclassifyReport,
} from '@/lib/themeMemory/reclassify';
import { listAllMembershipRecords, listAllThemeRecords, updateThemeMembershipMetadata } from '@/lib/themeMemory/themesDb';
import type { ThemeStore } from '@/lib/themeMemory/store';
import type { ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';

export type ThemeReclassifyArgs = {
  dryRun: boolean;
  apply: boolean;
  expectedDowngrades: number | null;
};

export type ThemeReclassifyRunDeps = {
  listThemes?: () => Promise<ThemeRecord[]>;
  listMemberships?: () => Promise<ThemeMembershipRecord[]>;
  persistMembership?: (row: ThemeMembershipRecord) => Promise<unknown>;
  store?: ThemeStore;
  log?: (message: string) => void;
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

function parseExpectedDowngrades(argv: string[]): number | null {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    let raw: string | undefined;
    if (arg.startsWith('--expected-downgrades=')) {
      raw = arg.slice('--expected-downgrades='.length);
    } else if (arg === '--expected-downgrades') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) return Number.NaN;
      raw = next;
    }
    if (raw == null) continue;
    if (!/^\d+$/.test(raw)) return Number.NaN;
    return Number(raw);
  }
  return null;
}

export function parseThemeReclassifyArgs(argv: string[]): ThemeReclassifyArgs {
  return {
    dryRun: argv.includes('--dry-run'),
    apply: argv.includes('--apply'),
    expectedDowngrades: parseExpectedDowngrades(argv),
  };
}

async function defaultPersistMembership(row: ThemeMembershipRecord): Promise<ThemeMembershipRecord> {
  await updateThemeMembershipMetadata({
    id: row.id,
    metadata: row.metadata,
    updatedAt: row.updated_at,
  });
  return row;
}

export async function runThemeMembershipReclassify(input: {
  dryRun?: boolean;
  apply?: boolean;
  expectedDowngrades?: number | null;
  rankingMode?: string;
  now?: string;
  deps?: ThemeReclassifyRunDeps;
}): Promise<ThemeReclassifyReport> {
  assertThemeReclassifyMode({
    dryRun: input.dryRun,
    apply: input.apply,
    expectedDowngrades: input.expectedDowngrades,
  });

  const isApply = Boolean(input.apply);
  const store = input.deps?.store;
  const blocked = !isApply && store ? createWriteBlockedThemeStore(store) : null;
  const readStore = blocked?.store ?? store;

  const listThemes =
    input.deps?.listThemes || (readStore ? () => readStore.listThemes() : listAllThemeRecords);
  const listMemberships =
    input.deps?.listMemberships || (readStore ? () => readStore.listMemberships() : listAllMembershipRecords);

  const persistMembership =
    input.deps?.persistMembership ||
    (isApply && store ? (row: ThemeMembershipRecord) => store.upsertMembership(row) : defaultPersistMembership);

  const themes = await listThemes();
  const memberships = await listMemberships();
  if (blocked && blocked.writesAttempted() !== 0) {
    throw new Error(THEME_RECLASSIFY_WRITE_BLOCKED);
  }

  const rankingMode = input.rankingMode ?? resolveThemeRankingMode();
  const report = reclassifyLegacyCoreMemberships({
    themes,
    memberships,
    rankingMode,
    databaseWrites: blocked?.writesAttempted() ?? 0,
  });

  if (!isApply) {
    return report;
  }

  const expectedDowngrades = input.expectedDowngrades as number;
  if (rankingMode !== THEME_RECLASSIFY_REQUIRED_RANKING_MODE) {
    throw new Error(`${THEME_RECLASSIFY_SHADOW_REQUIRED} (ranking mode: ${rankingMode})`);
  }
  if (report.downgradeContextualCount !== expectedDowngrades) {
    throw new Error(themeReclassifyExpectedMismatch(expectedDowngrades, report.downgradeContextualCount));
  }

  const now = input.now || new Date().toISOString();
  const plan = buildThemeReclassifyApplyPlan({ report, memberships, now });
  assertThemeReclassifyApplySafety({
    rankingMode,
    expectedDowngrades,
    report,
    plan,
  });

  const log = input.deps?.log ?? console.log;
  log(formatThemeReclassifyApplyPlan({ report, plan, expectedDowngrades }));

  const writes = await persistThemeReclassifyPlan({
    plan,
    persistMembership,
  });
  return withThemeReclassifyApplyResult(report, writes);
}

export { formatThemeReclassifyReport };
