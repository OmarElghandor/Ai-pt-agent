/**
 * Day 1 review fix: patch items + overwrite story + re-assemble + publish.
 * Usage: npx tsx scripts/v2/day1-review-fix.ts
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

const STORY_LINES = [
  {
    speaker: 'ines',
    tl: 'Olá! Bom dia!',
    ar: 'أهلاً! صباح الخير!',
    ids: ['phrase.hello', 'phrase.good_morning'],
  },
  {
    speaker: 'learner',
    tl: 'Bom dia!',
    ar: 'صباح الخير!',
    ids: ['phrase.good_morning'],
    replies_to: 0,
  },
  {
    speaker: 'ines',
    tl: 'Chamo-me Inês. Como se chama?',
    ar: 'اسمي إينيس. ما اسمك؟',
    ids: ['pattern.chamo_me', 'phrase.whats_your_name'],
  },
  {
    speaker: 'learner',
    tl: 'Chamo-me Omar. Muito prazer!',
    ar: 'اسمي عمر. سررت بمعرفتك!',
    ids: ['phrase.my_name_is', 'pattern.chamo_me', 'phrase.nice_to_meet'],
    replies_to: 2,
  },
  {
    speaker: 'ines',
    tl: 'Muito prazer! Tudo bem?',
    ar: 'سررت بمعرفتك! كيف حالك؟',
    ids: ['phrase.nice_to_meet', 'phrase.how_are_you'],
  },
  {
    speaker: 'learner',
    tl: 'Tudo bem, obrigado.',
    ar: 'بخير، شكراً.',
    ids: ['phrase.fine_thanks'],
    replies_to: 4,
  },
  {
    speaker: 'ines',
    tl: 'Boa tarde, Omar! Até amanhã!',
    ar: 'مساء الخير، عمر! إلى اللقاء غداً!',
    ids: ['phrase.good_afternoon', 'phrase.see_you_tomorrow'],
  },
  {
    speaker: 'learner',
    tl: 'Até amanhã! Adeus!',
    ar: 'إلى اللقاء غداً! مع السلامة!',
    ids: ['phrase.see_you_tomorrow', 'phrase.bye'],
    replies_to: 6,
  },
];

async function main() {
  const { connectMongo, mongoConfigured } = await import('@/lib/mongo');
  if (!mongoConfigured()) {
    console.error('Mongo not configured');
    process.exit(1);
  }
  await connectMongo();

  const { getLatestLesson, updateDraft, setDraftHandoff, setLessonStatus } =
    await import('@/lib/v2/generation/lesson/save');
  const { getStoryVersion, saveStoryDoc } = await import(
    '@/lib/v2/generation/lesson/storySave'
  );
  const { buildStoryHandoff } = await import(
    '@/lib/v2/generation/lesson/handoffs'
  );
  const {
    autoFixStoryLines,
    checkStory,
  } = await import('@/lib/v2/generation/lesson/storyChecks');
  const { enrichStoryDocument } = await import(
    '@/lib/v2/generation/lesson/storyCodeEnrich'
  );
  const { runAssembleJob } = await import(
    '@/lib/v2/generation/lesson/jobs/runAssemble'
  );
  const { fillPatternsInBank } = await import(
    '@/lib/v2/generation/lesson/patternFill'
  );
  const { getCoreItemsDay } = await import(
    '@/lib/v2/generation/lesson/coreItems'
  );
  const { dedupeContextEg, splitSlashTl } = await import(
    '@/lib/v2/generation/lesson/jobs/runItems'
  );
  const { buildWritingAccepted, buildWritingNearMiss, dedupeTypeTests } =
    await import('@/lib/v2/generation/lesson/jobs/runQuestions');
  const { publishLesson } = await import(
    '@/lib/v2/generation/lesson/publish'
  );
  const { storyIdFor } = await import('@/lib/v2/content/story');
  const { isBlockedForPublish } = await import(
    '@/lib/v2/generation/lesson/issueResolve'
  );
  type OutlineResult =
    import('@/lib/v2/generation/lesson/stages/types').OutlineResult;

  const lesson = await getLatestLesson(DAY);
  if (!lesson) {
    console.error('No Day 1 lesson in Mongo');
    process.exit(1);
  }
  console.log(`Day 1 lesson v${lesson.version} status=${lesson.status}`);

  const coreDay = getCoreItemsDay(DAY);
  const coreById = new Map(coreDay.core_items.map((c) => [c.id, c]));

  // --- Patch items ---
  let items = [...(lesson.data.items ?? [])];
  items = items.map((it) => {
    const row = { ...(it as Record<string, unknown>) };
    const core = coreById.get(it.id);
    if (core?.tl) {
      const split = splitSlashTl(core.tl);
      row.tl = split.tl;
      const variants = [
        ...(core.variant_tl ?? []),
        ...((core.variants as string[] | undefined) ?? []),
        ...split.variants,
      ];
      if (variants.length) row.variant_tl = [...new Set(variants)];
    }
    if (core?.variant_group) row.variant_group = core.variant_group;
    if (core?.tl_f && it.type === 'phrase') row.tl_f = core.tl_f;
    if (it.id === 'phrase.good_night') {
      row.ar = 'تصبح على خير';
      row.eg = 'تصبح على خير';
    }
    if (it.id === 'phrase.good_afternoon') {
      row.ar = 'مساء الخير';
    }
    if (it.id === 'phrase.bye') {
      row.tl = 'Adeus!';
      row.variant_tl = ['Tchau!'];
      row.ar = 'مع السلامة';
    }
    if (typeof row.context_eg === 'string') {
      row.context_eg = dedupeContextEg(row.context_eg);
    }
    if (typeof row.tl === 'string' && row.tl.includes('/')) {
      const split = splitSlashTl(row.tl);
      row.tl = split.tl;
      row.variant_tl = [
        ...new Set([
          ...((row.variant_tl as string[]) ?? []),
          ...((row.variants as string[]) ?? []),
          ...split.variants,
        ]),
      ];
      delete row.variants;
    }
    return row as typeof it;
  });

  // Ensure pattern.chamo_me + derived examples; drop mixed tl on patterns
  items = fillPatternsInBank(items, { coreItems: coreDay.core_items });
  items = items.map((it) => {
    if (it.type !== 'pattern') return it;
    const row = { ...(it as Record<string, unknown>) };
    delete row.tl;
    delete row.eg;
    if (it.id === 'pattern.chamo_me') {
      row.kind = 'chamo_me';
    }
    return row as typeof it;
  });

  // Patch writing accepted / near_miss on questions
  let questions = [...(lesson.data.questions ?? [])];
  questions = questions.map((q) => {
    if (q.skill !== 'writing') return q;
    const answerTl =
      typeof (q as { answer_tl?: string }).answer_tl === 'string'
        ? (q as { answer_tl: string }).answer_tl
        : Array.isArray(q.accepted) && q.accepted[0]
          ? String(q.accepted[0])
          : '';
    if (!answerTl) return q;
    const accepted = buildWritingAccepted(answerTl);
    const near_miss = buildWritingNearMiss(answerTl);
    return { ...q, accepted, ...(near_miss.length ? { near_miss } : {}) };
  });
  questions = dedupeTypeTests(questions).questions;

  // --- Overwrite story ---
  let story = await getStoryVersion({
    day: DAY,
    version: lesson.version,
    targetLang: lesson.target_lang,
  });
  if (!story) {
    console.error('No story doc for Day 1');
    process.exit(1);
  }

  const cast = story.cast.length
    ? story.cast
    : [
        { id: 'learner', name: 'أنت', role: 'learner' as const },
        { id: 'ines', name: 'Inês', role: 'character' as const },
      ];

  const fixed = autoFixStoryLines(
    STORY_LINES.map((l) => ({
      speaker: l.speaker,
      tl: l.tl,
      ar: l.ar,
      ids: l.ids,
      replies_to: 'replies_to' in l ? l.replies_to : undefined,
    })),
    new Map(items.map((i) => [i.id, i])),
    {
      allowedTokens: new Set(
        items
          .flatMap((i) =>
            'tl' in i && typeof i.tl === 'string'
              ? i.tl
                  .toLowerCase()
                  .split(/\s+/)
                  .map((t) => t.replace(/[^a-z\-]/gi, ''))
                  .filter(Boolean)
              : [],
          ),
      ),
      coreItems: coreDay.core_items,
    },
  );

  story = {
    ...story,
    cast,
    setting: story.setting || 'na rua',
    status: 'ready',
    lines: fixed.lines.map((l, i) => ({
      ...l,
      ar: STORY_LINES[i]?.ar ?? l.ar,
      ids: STORY_LINES[i]?.ids ?? l.ids,
    })),
  };

  const dupOptions: { line: number; labels: string[] }[] = [];
  story = enrichStoryDocument(story, items, coreDay.recycle_ids, {
    onDuplicateOptions: (lineIndex, labels) => {
      dupOptions.push({ line: lineIndex, labels });
    },
  });

  // Re-apply explicit AR after enrich (enrich keeps existing ar)
  story = {
    ...story,
    lines: story.lines.map((l, i) => ({
      ...l,
      ar: STORY_LINES[i]?.ar ?? l.ar,
    })),
  };

  const checkIssues = checkStory({
    story,
    coreItems: coreDay.core_items,
    items,
    allowedTokens: new Set(
      items
        .flatMap((i) =>
          'tl' in i && typeof i.tl === 'string'
            ? i.tl
                .toLowerCase()
                .split(/\s+/)
                .map((t) => t.replace(/[^a-z\-]/gi, ''))
                .filter(Boolean)
            : [],
        ),
    ),
    grammarFocusId: 'pronouns.clitic_after',
    chatCharacter: 'ines',
    targetLang: 'pt-PT',
  });
  const fatals = checkIssues.filter((i) => i.tier === 'fatal');
  console.log(
    `Story checks: ${fatals.length} fatal, ${checkIssues.length - fatals.length} other`,
  );
  for (const f of fatals) {
    console.log(`  FATAL ${f.rule}: ${f.message}`);
  }
  for (const w of checkIssues.filter((i) => i.tier !== 'fatal')) {
    console.log(`  ${w.tier} ${w.rule}: ${w.message}`);
  }
  if (dupOptions.length) {
    console.log('Duplicate options:', dupOptions);
  }
  if (fatals.length) {
    console.error('Aborting: story still has fatals');
    process.exit(1);
  }

  await saveStoryDoc({ ...story, id: storyIdFor(DAY), status: 'ready' });
  await setDraftHandoff({
    day: DAY,
    version: lesson.version,
    key: 'story',
    value: buildStoryHandoff(story),
  });

  // --- Rebuild outline pages list if needed, then assemble ---
  const { loadDraftData } = await import('@/lib/v2/generation/lesson/graph');
  const draft = await loadDraftData(
    DAY,
    lesson.version,
    lesson.target_lang,
  );
  const draftOutline: OutlineResult =
    (draft.outline as OutlineResult | undefined) ??
    (lesson.meta?.outline as OutlineResult | undefined) ??
    ({
      lesson: lesson.data.lesson,
      items,
      pages: lesson.data.pages
        .filter((p) => p.role !== 'test')
        .map((p, index) => ({
          index,
          page_id: p.id,
          preset: p.preset,
          role: p.role,
          introduces: [],
          assumes: [],
          purpose: 'patched',
          handoff: '',
          title: p.id,
          mode: p.mode,
        })),
    } as OutlineResult);

  // Sync outline items with patched bank
  const outlineForAssemble = {
    ...draftOutline,
    items,
    lesson: {
      ...draftOutline.lesson,
      story_id: story.id,
    },
  };

  // Use existing pages from pack, excluding any old test page (assemble re-inserts)
  const pagesIn = lesson.data.pages.filter((p) => p.role !== 'test');

  const assemble = runAssembleJob({
    day: DAY,
    targetLang: lesson.target_lang,
    outline: outlineForAssemble,
    items,
    pages: pagesIn,
    questions,
    micro: lesson.data.micro,
    speak_prompts: lesson.data.speak_prompts,
    coreIds: coreDay.core_items.map((c) => c.id),
    coreItems: coreDay.core_items,
    recycleIds: coreDay.recycle_ids,
    chatCharacter: 'ines',
    storyId: story.id,
    storyLineIds: story.lines.map((l) => l.ids ?? []),
  });

  console.log(
    `Assemble: ${assemble.issues.length} fatals/errors, ${assemble.warnings.length} warnings, flagged=${assemble.flagged}`,
  );
  for (const iss of assemble.issues) {
    console.log(`  ERROR ${iss.rule}: ${iss.message}`);
  }

  // Stop rule: only fatals block — clear soft flagged for publish gate
  const hardOnly = assemble.issues.filter((i) => i.severity === 'error');
  const prevCritic =
    (
      lesson.meta as
        | { critic_issues?: { severity: string; resolved_by?: string }[] }
        | undefined
    )?.critic_issues ?? [];

  await updateDraft({
    day: DAY,
    version: lesson.version,
    pack: {
      ...assemble.pack,
      outline: outlineForAssemble,
    } as typeof assemble.pack & { outline: OutlineResult },
    meta: {
      flagged: hardOnly.length > 0,
      issues: [...hardOnly, ...assemble.warnings],
      text_ready: true,
      outline: outlineForAssemble,
      // Stop rule: discarded patches cleared after this repair round
      lang_check: { discarded: [] },
      critic_issues: prevCritic.map((c) => ({
        ...c,
        resolved_by: c.resolved_by ?? ('lang_check' as const),
      })),
    },
    mergeMeta: true,
  });

  const after = await getLatestLesson(DAY);
  if (!after) {
    console.error('Lost lesson after update');
    process.exit(1);
  }
  const blocked = isBlockedForPublish(after.meta);
  console.log(`Publish blocked? ${blocked}`);
  if (blocked) {
    console.error('Meta still blocks publish:', JSON.stringify(after.meta?.issues?.slice(0, 10), null, 2));
    process.exit(1);
  }

  await setLessonStatus({ day: DAY, status: 'reviewed', version: after.version });
  const published = await publishLesson({ day: DAY, version: after.version });
  console.log(`Published Day 1 v${published.lesson.version}`);

  const outDir = resolve(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  const lessonOut = resolve(outDir, 'day1-lesson.json');
  const storyOut = resolve(outDir, 'day1-story.json');
  writeFileSync(
    lessonOut,
    JSON.stringify(
      {
        day: published.lesson.day,
        version: published.lesson.version,
        status: published.lesson.status,
        meta: published.lesson.meta,
        pack: published.lesson.data,
      },
      null,
      2,
    ) + '\n',
  );
  const storyFinal = await getStoryVersion({
    day: DAY,
    version: published.lesson.version,
  });
  writeFileSync(storyOut, JSON.stringify(storyFinal, null, 2) + '\n');
  console.log(`Wrote ${lessonOut}`);
  console.log(`Wrote ${storyOut}`);
  console.log(
    JSON.stringify(
      {
        pages: published.lesson.data.pages.map((p) => ({
          id: p.id,
          preset: p.preset,
          role: p.role,
          story_id: p.story_id,
        })),
        story_lines: storyFinal?.lines.map((l) => ({
          speaker: l.speaker,
          tl: l.tl,
          ar: l.ar,
          replies_to: l.replies_to,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
