/**
 * Patch Day 1 items from core, then regen story + questions only.
 * Usage: npx tsx scripts/v2/regen-day1-questions-story.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const DAY = 1;
const OUT = resolve(process.cwd(), 'examples/day01-generated.json');

async function main() {
  const { connectMongo, mongoConfigured } = await import('@/lib/mongo');
  if (!mongoConfigured()) {
    console.error('Mongo not configured');
    process.exit(1);
  }
  await connectMongo();

  const { getLatestLesson, updateDraftFields } = await import(
    '@/lib/v2/generation/lesson/save'
  );
  const { getCoreItemsDay } = await import(
    '@/lib/v2/generation/lesson/coreItems'
  );
  const { fillPatternsInBank } = await import(
    '@/lib/v2/generation/lesson/patternFill'
  );
  const {
    enqueueStoryRegen,
    enqueueQuestionsRegen,
    runWorkerUntilIdle,
  } = await import('@/lib/v2/generation/jobs');
  const { getStoryVersion } = await import(
    '@/lib/v2/generation/lesson/storySave'
  );

  const lesson = await getLatestLesson(DAY);
  if (!lesson) {
    console.error('No Day 1 lesson');
    process.exit(1);
  }
  console.log(`Day 1 lesson v${lesson.version} status=${lesson.status}`);

  const coreDay = getCoreItemsDay(DAY);
  const coreById = new Map(coreDay.core_items.map((c) => [c.id, c]));

  let items = [...(lesson.data.items ?? [])];
  items = items.map((it) => {
    const row = { ...(it as Record<string, unknown>) };
    const core = coreById.get(it.id);
    if (!core) return it;
    if (core.eg && !core.eg.includes('/')) {
      if (
        !row.ar ||
        row.ar === '…' ||
        String(row.ar).includes('/') ||
        it.id === 'phrase.good_night'
      ) {
        row.ar = core.eg;
      }
    }
    if (typeof row.ar === 'string' && row.ar.includes('/')) {
      row.ar = row.ar.split('/')[0]!.trim();
    }
    if (core.context_eg) row.context_eg = core.context_eg;
    if (core.role) row.role = core.role;
    if (core.replies_to) row.replies_to = core.replies_to;
    if (core.role === 'heard' && 'replies_to' in row) {
      delete row.replies_to;
    }
    if (core.variant_group) row.variant_group = core.variant_group;
    return row as typeof it;
  });

  // Ensure likewise / nice_to_meet pairing even if core copy missed
  items = items.map((it) => {
    if (it.id === 'phrase.nice_to_meet') {
      const { replies_to: _d, ...rest } = it as typeof it & {
        replies_to?: string;
      };
      return { ...rest, role: 'heard' } as typeof it;
    }
    if (it.id === 'phrase.likewise') {
      return {
        ...it,
        role: 'said',
        replies_to: 'phrase.nice_to_meet',
      } as typeof it;
    }
    if (it.id === 'phrase.good_night') {
      return {
        ...it,
        ar: 'تصبح على خير',
        context_eg:
          (it as { context_eg?: string }).context_eg ||
          'بتحية بالليل وبرضو لما تودّع بالليل',
      } as typeof it;
    }
    return it;
  });

  items = fillPatternsInBank(items, { coreItems: coreDay.core_items });

  // Patch items only — never clobber outline/pages via full pack replace
  const fields: Record<string, unknown> = { items };
  const dataOutline = (lesson.data as { outline?: { pages?: unknown[] } })
    .outline;
  const metaOutline = (lesson.meta as { outline?: { pages?: unknown[] } } | undefined)
    ?.outline;
  if (!dataOutline?.pages?.length && metaOutline?.pages?.length) {
    fields.outline = metaOutline;
    console.log(`Restoring outline from meta (${metaOutline.pages.length} pages)`);
  }
  await updateDraftFields({
    day: DAY,
    version: lesson.version,
    fields,
  });
  console.log(`Patched ${items.length} items (good_night, replies_to, patterns)`);

  const workerId = `regen-d1-${process.pid}-${Date.now().toString(36)}`;

  console.log('Enqueueing story regen…');
  const storyEnq = await enqueueStoryRegen({ day: DAY });
  console.log(`story job ${storyEnq.storyJobId} v${storyEnq.version}`);
  const storyProcessed = await runWorkerUntilIdle(workerId + '-s', {
    maxEmptyRounds: 4,
    idleMs: 2500,
    deadlineMs: 280_000,
  });
  console.log(`story drain processed=${storyProcessed}`);

  console.log('Enqueueing questions regen…');
  const qEnq = await enqueueQuestionsRegen({ day: DAY });
  console.log(`questions job ${qEnq.questionsJobId} v${qEnq.version}`);
  const qProcessed = await runWorkerUntilIdle(workerId + '-q', {
    maxEmptyRounds: 4,
    idleMs: 2500,
    deadlineMs: 280_000,
  });
  console.log(`questions drain processed=${qProcessed}`);

  const latest = await getLatestLesson(DAY);
  const story = await getStoryVersion({
    day: DAY,
    version: latest?.version ?? lesson.version,
  });

  const payload = {
    day: DAY,
    version: latest?.version,
    status: latest?.status,
    items: (latest?.data.items ?? []).filter((i) =>
      [
        'phrase.good_night',
        'phrase.nice_to_meet',
        'phrase.likewise',
        'pattern.chamo_me',
      ].includes(i.id),
    ),
    questions: latest?.data.questions ?? [],
    story: story
      ? {
          id: story.id,
          version: story.version,
          setting: story.setting,
          cast: story.cast,
          lines: story.lines,
        }
      : null,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
  console.log(`questions=${payload.questions.length}`);
  console.log(
    payload.questions
      .map(
        (q) =>
          `${q.id}\t${q.type}\t${Array.isArray(q.tests) ? q.tests.join(',') : ''}`,
      )
      .join('\n'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
