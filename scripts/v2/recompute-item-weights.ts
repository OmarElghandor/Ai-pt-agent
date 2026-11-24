/**
 * Recompute freq_rank, reuse_count, weight, weight_why for every core item (17 W1).
 *
 *   npx tsx --env-file=.env.local scripts/v2/recompute-item-weights.ts
 *   npx tsx --env-file=.env.local scripts/v2/recompute-item-weights.ts --through=90 --top=50
 *
 * Rerun after core-items change or after importing a frequency list.
 * Never on the answer path.
 */
import { recomputeItemWeights } from '../../lib/v2/weights';

function parseArgs(argv: string[]): {
  throughDay?: number;
  topN: number;
  lang?: string;
} {
  let throughDay: number | undefined;
  let topN = 50;
  let lang: string | undefined;
  for (const a of argv) {
    if (a.startsWith('--through=')) throughDay = Number(a.slice('--through='.length));
    else if (a.startsWith('--top=')) topN = Number(a.slice('--top='.length));
    else if (a.startsWith('--lang=')) lang = a.slice('--lang='.length);
  }
  return {
    throughDay: Number.isFinite(throughDay) ? throughDay : undefined,
    topN: Number.isFinite(topN) && topN > 0 ? topN : 50,
    lang,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = await recomputeItemWeights({
    lang: opts.lang,
    throughDay: opts.throughDay,
    topN: opts.topN,
  });

  console.log(
    JSON.stringify(
      {
        lang: result.lang,
        count: result.count,
        flagged_needs_review: result.flagged,
        note:
          result.flagged === result.count
            ? 'All items flagged (freq list empty or no matches). Import a list then re-run.'
            : undefined,
      },
      null,
      2,
    ),
  );

  console.log(`\nTop ${result.top.length} by weight:\n`);
  for (const [i, row] of result.top.entries()) {
    const rank = row.freq_rank == null ? '—' : String(row.freq_rank);
    console.log(
      `${String(i + 1).padStart(2)}. w=${String(row.weight).padStart(3)}  day=${String(row.day).padStart(3)}  freq=${rank.padStart(4)}  reuse=${row.reuse_count}  ${row.priority.padEnd(11)}  ${row.item_id}  (${row.tl})  [${row.weight_why.join(' · ')}]`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
