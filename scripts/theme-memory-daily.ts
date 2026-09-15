import {
  formatThemeMemoryDailySummary,
  runThemeMemoryDaily,
  themeMemoryDailyExitCode,
} from '@/lib/themeMemory/dailyRun';

async function main() {
  const refreshLabels = process.argv.includes('--refresh-labels');
  const result = await runThemeMemoryDaily({ refreshLabels });
  console.log(formatThemeMemoryDailySummary(result));
  if (result.startup?.warnings?.length) {
    for (const warning of result.startup.warnings) {
      console.warn(`warning: ${warning}`);
    }
  }
  process.exit(themeMemoryDailyExitCode(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
