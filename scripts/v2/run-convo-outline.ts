/**
 * Smoke: enqueue + drain convo_outline for a day (T5.1 Done when).
 * Usage: npx tsx --env-file=.env scripts/v2/run-convo-outline.ts 18
 */
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { validateConvoOutline } from '@/lib/v2/convo/pack/validateOutline';
import {
  enqueueGenerateConvoPack,
  runWorkerUntilIdle,
} from '@/lib/v2/generation/jobs';
import { getLatestConvoPack } from '@/lib/v2/generation/convo/save';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';

async function main() {
  const day = Number(process.argv[2] ?? 18);
  if (!Number.isInteger(day) || day < 1) {
    throw new Error('usage: run-convo-outline.ts <day>');
  }
  const published = await getPublishedLesson(day);
  if (!published) {
    throw new Error(`No published lesson for day ${day}`);
  }
  console.log(
    `published day=${day} lesson_v=${published.version} items=${published.pack.items.length}`,
  );

  const enqueued = await enqueueGenerateConvoPack({ day });
  console.log('enqueued', enqueued);

  await runWorkerUntilIdle(`smoke-convo-outline-${day}`, {
    maxEmptyRounds: 6,
    idleMs: 1000,
    deadlineMs: 240_000,
  });

  const pack = await getLatestConvoPack(day);
  const outline = pack?.meta?.handoffs?.outline;
  if (!outline) {
    throw new Error('outline handoff missing after worker');
  }

  const core = getCoreItemsDay(day);
  const allowed = [
    ...core.core_items.map((c) => c.id),
    ...core.recycle_ids,
    ...published.pack.items.map((i) => i.id),
  ];
  const result = validateConvoOutline(outline, {
    allowedItemIds: [...new Set(allowed)],
  });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        errors: result.issues.filter((i) => i.severity === 'error'),
        warnings: result.issues.filter((i) => i.severity === 'warning'),
        groups: result.outline?.groups,
        character: result.outline?.scene.character_id,
        visual: result.outline?.visual.type,
      },
      null,
      2,
    ),
  );
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
