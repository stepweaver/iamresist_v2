import {
  formatThemeReclassifyReport,
  parseThemeReclassifyArgs,
  runThemeMembershipReclassify,
} from '@/lib/themeMemory/reclassifyRun';

async function main() {
  const args = parseThemeReclassifyArgs(process.argv.slice(2));
  const report = await runThemeMembershipReclassify(args);
  console.log(formatThemeReclassifyReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
