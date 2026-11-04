/**
 * Generate conversation packs for given days (M4: 3, 18, 22).
 * Usage: npx tsx --env-file=.env scripts/v2/generate-convo-days.ts 3 18 22
 */
import {
  enqueueGenerateConvoPack,
  runWorkerUntilIdle,
} from '@/lib/v2/generation/jobs';
import { getLatestConvoPack } from '@/lib/v2/generation/convo/save';

async function generateDay(day: number) {
  const enq = await enqueueGenerateConvoPack({ day });
  console.log('enqueued', enq);
  await runWorkerUntilIdle(`m4-convo-${day}`, {
    maxEmptyRounds: 6,
    idleMs: 1200,
    deadlineMs: 900_000,
    filter: {
      day,
      version: enq.version,
      kinds: [
        'convo_outline',
        'convo_items',
        'convo_critic',
        'convo_lang_check',
        'convo_assemble',
      ],
    },
  });
  const pack = await getLatestConvoPack(day);
  const summary = {
    day,
    version: pack?.version,
    text_ready: pack?.meta?.text_ready,
    audio_ready: pack?.meta?.audio_ready,
    groups: (pack?.data as { groups?: unknown[] } | undefined)?.groups?.length,
    items: Object.keys(
      (pack?.data as { items?: Record<string, unknown> } | undefined)?.items ??
        {},
    ).length,
    assemble: pack?.meta?.handoffs?.assemble,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!pack?.meta?.text_ready) {
    throw new Error(`day ${day} convo pack not text_ready`);
  }
}

async function main() {
  const days = process.argv.slice(2).map(Number).filter((n) => n > 0);
  if (days.length === 0) {
    throw new Error('usage: generate-convo-days.ts <day>…');
  }
  for (const day of days) {
    await generateDay(day);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
