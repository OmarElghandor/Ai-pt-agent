/**
 * Validate content/v2/plan/pt-PT.core-items.json
 * Usage: npx tsx scripts/v2/validate-core-items.ts [path]
 */
import { resolve } from 'node:path';
import {
  loadCoreItemsFile,
  resetCoreItemsCache,
  validateCoreItemsFile,
  MAX_CORE_ITEMS_PER_DAY,
} from '@/lib/v2/generation/lesson/coreItems';

async function main() {
  const filePath =
    process.argv[2] ??
    resolve(process.cwd(), 'content/v2/plan/pt-PT.core-items.json');
  resetCoreItemsCache();
  // loadCoreItemsFile throws on fatal structural errors; still run full report
  const file = JSON.parse(
    await import('node:fs').then((fs) =>
      fs.readFileSync(filePath, 'utf8'),
    ),
  );
  const issues = validateCoreItemsFile(file);
  const byRule = new Map<string, number>();
  for (const i of issues) {
    byRule.set(i.rule, (byRule.get(i.rule) ?? 0) + 1);
  }
  const days = file.days ?? [];
  const maxLen = Math.max(
    0,
    ...days.map((d: { core_items?: unknown[] }) => d.core_items?.length ?? 0),
  );
  console.log(
    JSON.stringify(
      {
        path: filePath,
        days: days.length,
        max_core_items: maxLen,
        cap: MAX_CORE_ITEMS_PER_DAY,
        issue_count: issues.length,
        by_rule: Object.fromEntries(byRule),
        issues: issues.slice(0, 50),
      },
      null,
      2,
    ),
  );
  // Also ensure load path accepts the file (fatals throw)
  resetCoreItemsCache();
  loadCoreItemsFile(filePath);
  if (issues.length > 0) {
    process.exitCode = 1;
    return;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
