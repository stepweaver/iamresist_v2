import { getLiveIntelDeskUncached } from '@/lib/feeds/liveIntel.service';
import { resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import { getThemeIntelCandidateSaturation } from '@/lib/themeMemory/query';
import {
  formatThemeRankingCoverageReport,
  loadThemeRankingCoverageAudit,
} from '@/lib/themeMemory/rankingCoverageAudit';
import { createSupabaseThemeStore } from '@/lib/themeMemory/themesDb';

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] || null;
}

async function main() {
  const lane = argValue('--lane') || 'osint';
  const limit = Math.max(1, Math.min(80, Number(argValue('--limit') || 40) || 40));
  const mode = resolveThemeRankingMode();
  const desk = await getLiveIntelDeskUncached(lane);
  const pool = Array.isArray(desk.preCapCandidates) && desk.preCapCandidates.length
    ? desk.preCapCandidates
    : Array.isArray(desk.items)
      ? desk.items
      : [];
  const items = pool.slice(0, limit);
  let intelSaturation = null;
  try {
    intelSaturation = await getThemeIntelCandidateSaturation();
  } catch (error) {
    console.warn('[theme-memory:ranking-coverage] Intel saturation unavailable', error);
  }
  const report = await loadThemeRankingCoverageAudit(createSupabaseThemeStore(), items, {
    deskLane: lane,
    intelSaturation,
  });
  console.log(formatThemeRankingCoverageReport(report));
  console.log('');
  console.log(`Ranking mode (unchanged): ${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
