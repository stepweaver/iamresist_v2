import {
  formatThemeReclassifyReport,
  parseThemeReclassifyArgs,
  runThemeMembershipReclassify,
} from '@/lib/themeMemory/reclassifyRun';

async function main() {
  const args = parseThemeReclassifyArgs(process.argv.slice(2));
  const report = await runThemeMembershipReclassify(args);
  console.log(formatThemeReclassifyReport(report));
  if (report.mode === 'apply' && (report.failedWrites > 0 || report.successfulWrites !== report.plannedWrites)) {
    console.error(
      `Apply incomplete: ${report.successfulWrites} succeeded, ${report.failedWrites} failed, ${report.plannedWrites} planned.`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
