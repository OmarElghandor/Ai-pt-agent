/**
 * Temporary published lesson for day 18 so convo_outline can run (local smoke).
 * Not for production content.
 */
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { LessonPackSchema } from '@/lib/v2/content/lesson';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { V2LessonModel } from '@/lib/v2/mongo/models';

async function main() {
  if (!mongoConfigured()) throw new Error('Mongo not configured');
  const core = getCoreItemsDay(18);
  const items = core.core_items
    .filter((c) => c.kind === 'word' || c.kind === 'phrase')
    .slice(0, 8)
    .map((c) => {
      if (c.kind === 'word') {
        return { type: 'word' as const, id: c.id, tl: c.tl, ar: c.eg || c.tl };
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
      id: 'pt-PT.d18',
      target_lang: 'pt-PT',
      day: 18,
      pages: ['p0'],
      situation: { tl: 'Em casa', eg: 'في البيت' },
    },
    items,
    pages: [
      {
        id: 'p0',
        preset: 'dictionary' as const,
        mode: 'static' as const,
        title: [{ text: 'A Casa', lang: 'tl' as const }],
        blocks: [
          {
            type: 'heading' as const,
            id: 'h1',
            text: [{ text: 'A Casa', lang: 'tl' as const }],
          },
        ],
      },
    ],
    questions: [],
  };

  const parsed = LessonPackSchema.safeParse(pack);
  if (!parsed.success) {
    console.error(parsed.error.issues.slice(0, 20));
    process.exit(1);
  }

  await connectMongo();
  await V2LessonModel().deleteMany({ day: 18, 'meta.smoke': true });
  await V2LessonModel().create({
    day: 18,
    target_lang: 'pt-PT',
    version: 1,
    status: 'published',
    data: parsed.data,
    meta: { text_ready: true, smoke: true },
  });
  console.log('published smoke lesson day 18 items', items.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
