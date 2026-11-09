/**
 * Minimal published lesson so convo pack generation can run (local/M4 smoke).
 * Usage: npx tsx --env-file=.env scripts/v2/smoke-publish-day.ts 3 18 22
 */
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { LessonPackSchema } from '@/lib/v2/content/lesson';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { V2LessonModel } from '@/lib/v2/mongo/models';

async function publishSmoke(day: number) {
  const core = getCoreItemsDay(day);
  const plan = getDayPlan(day);
  const items = core.core_items
    .filter((c) => c.kind === 'word' || c.kind === 'phrase' || c.kind === 'verb')
    .slice(0, 10)
    .map((c) => {
      if (c.kind === 'word' || c.kind === 'verb') {
        return {
          type: 'word' as const,
          id: c.id.startsWith('verb.') ? c.id : c.id,
          tl: c.tl,
          ar: c.eg || c.tl,
        };
      }
      return {
        type: 'phrase' as const,
        id: c.id,
        tl: c.tl,
        ar: c.eg || c.tl,
        role: 'said' as const,
        context_eg: c.context_eg || c.eg || 'جملة',
        cloze: c.tl.split(/\s+/)[0] || c.tl,
      };
    });

  const pack = {
    lesson: {
      id: `pt-PT.d${String(day).padStart(2, '0')}`,
      target_lang: 'pt-PT',
      day,
      pages: ['p0'],
      situation: {
        tl: plan.example_tl || plan.title_tl,
        eg: plan.situation_eg || plan.title_ar,
      },
    },
    items,
    pages: [
      {
        id: 'p0',
        preset: 'dictionary' as const,
        mode: 'static' as const,
        title: [{ text: plan.title_tl, lang: 'tl' as const }],
        blocks: [
          {
            type: 'heading' as const,
            id: 'h1',
            text: [{ text: plan.title_tl, lang: 'tl' as const }],
          },
        ],
      },
    ],
    questions: [],
  };

  const parsed = LessonPackSchema.safeParse(pack);
  if (!parsed.success) {
    console.error(`day ${day} zod`, parsed.error.issues.slice(0, 12));
    throw new Error(`day ${day} pack invalid`);
  }

  await connectMongo();
  const latest = await V2LessonModel()
    .findOne({ day, target_lang: 'pt-PT' })
    .sort({ version: -1 })
    .select({ version: 1 })
    .lean();
  const version = (latest?.version ?? 0) + 1;
  await V2LessonModel().updateMany(
    { day, target_lang: 'pt-PT', status: 'published' },
    { $set: { status: 'reviewed' } },
  );
  await V2LessonModel().create({
    day,
    target_lang: 'pt-PT',
    version,
    status: 'published',
    data: parsed.data,
    meta: { text_ready: true, smoke: true },
  });
  console.log(`published smoke lesson day ${day} v${version} items=${items.length}`);
}

async function main() {
  if (!mongoConfigured()) throw new Error('Mongo not configured');
  const days = process.argv.slice(2).map(Number).filter((n) => n > 0);
  if (days.length === 0) throw new Error('usage: smoke-publish-day.ts <day>…');
  for (const day of days) {
    await publishSmoke(day);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
