import { z } from 'zod';
import {
  charactersForPlace,
  genderForCharacter,
  getCharacter,
  voiceForCharacter,
} from '@/lib/v2/characters/registry';
import type { Item } from '@/lib/v2/content/items';
import {
  StoryCastEntrySchema,
  StoryExtraSchema,
  storyIdFor,
  type StoryDoc,
} from '@/lib/v2/content/story';
import type { LessonBrief } from '../brief';
import type { KnownIdTl } from '../hash';
import { coreItemsForWeek } from '../coreItems';
import { getDayPlan } from '../plan';
import { resolveGrammarFocusPatternIds } from '../grammarFocus';
import {
  buildMustCover,
  formatMustCoverBlock,
} from '../mustCover';
import { buildStorySystemPrompt } from '../prompts/story';
import {
  buildAllowedPriorDigest,
  buildStoryAllowedVocab,
  buildStoryItemDigestLines,
} from '../storyAllowed';
import { enrichStoryDocument } from '../storyCodeEnrich';
import {
  autoFixStoryLines,
  checkStory,
  formatStoryRetryHints,
  isStoryStructureFatal,
  learnerLineIndexes,
} from '../storyChecks';
import { saveStoryDoc } from '../storySave';
import { warning, type TierIssue } from '../tiers';
import { callJobTool } from './call';
import { wordCount } from '../prompts/core';
import type { StoryReading } from '@/lib/v2/content/story';

/**
 * Tool schema for submit_story — JSON-Schema safe (no transforms).
 * Nullables accept model null; code coerces to undefined when building the doc.
 */
const StoryReadingToolSchema = z.object({
  tl: z.string().min(1),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        type: z.enum(['read_meaning', 'true_false']),
        prompt_eg: z.string().min(1),
        options: z
          .array(
            z.object({
              id: z.string().optional(),
              label: z.string().min(1),
              correct: z.boolean(),
            }),
          )
          .min(2)
          .max(4),
      }),
    )
    .min(3)
    .max(3),
});

export const StoryToolSchema = z.object({
  cast: z.array(StoryCastEntrySchema).min(1),
  setting: z.string().min(1),
  lines: z
    .array(
      z.object({
        speaker: z.string().min(1),
        tl: z.string().min(1),
        en: z.string().min(1).nullable().optional(),
        ids: z.array(z.string()).nullable().optional(),
        extra: z.array(StoryExtraSchema).nullable().optional(),
        replies_to: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .min(1),
  scenes: z
    .array(
      z.object({
        id: z.string(),
        title_eg: z.string().nullable().optional(),
        line_start: z.number().int().nonnegative(),
        line_end: z.number().int().nonnegative(),
      }),
    )
    .nullable()
    .optional(),
  /** Weekly story days only. */
  reading: StoryReadingToolSchema.nullable().optional(),
});

type StoryCastRow = z.infer<typeof StoryToolSchema>['cast'][number] & {
  gender?: 'm' | 'f';
  voice?: string;
};

function ensureLearnerCast(
  cast: z.infer<typeof StoryToolSchema>['cast'],
  opts: { chatCharacter?: string; place?: string },
): StoryCastRow[] {
  const prefer = (opts.chatCharacter ?? 'ines').toLowerCase();
  const place = opts.place ?? '';
  const placeFits = charactersForPlace(place).map((c) => c.id);
  const partnerId =
    (placeFits.includes(prefer) ? prefer : null) ||
    placeFits.find((id) => id !== 'yassin') ||
    prefer;

  const stamp = (entry: StoryCastRow): StoryCastRow => {
    const lookupId =
      entry.role === 'learner' || entry.id === 'learner'
        ? 'yassin'
        : entry.id.toLowerCase();
    const rec = getCharacter(lookupId);
    return {
      ...entry,
      id:
        entry.role === 'learner' || entry.id === 'learner'
          ? entry.id
          : (rec?.id ?? entry.id),
      name: rec?.name ?? entry.name,
      gender: genderForCharacter(lookupId),
      voice: voiceForCharacter(lookupId),
    };
  };

  const hasLearner = cast.some(
    (c) => c.role === 'learner' || c.id === 'learner',
  );
  let next: StoryCastRow[] = cast.map((entry) =>
    stamp({
      ...entry,
      gender: entry.gender ?? undefined,
      voice: entry.voice ?? undefined,
    }),
  );
  if (!hasLearner) {
    next = [
      stamp({ id: 'learner', name: 'أنت', role: 'learner' as const }),
      ...next,
    ];
  }
  const hasCharacter = next.some((c) => c.role === 'character');
  if (!hasCharacter) {
    const rec = getCharacter(partnerId);
    next = [
      ...next,
      stamp({
        id: partnerId,
        name:
          rec?.name ??
          partnerId.charAt(0).toUpperCase() + partnerId.slice(1),
        role: 'character' as const,
      }),
    ];
  }
  return next.map(stamp);
}

export async function runStoryJob(opts: {
  brief: LessonBrief;
  items: Item[];
  known?: KnownIdTl[];
  /** Full known map (prior lessons + core file + registry). */
  knownById?: Map<string, Item>;
  version: number;
  targetLang?: string;
}): Promise<{
  story: StoryDoc | null;
  skipped: boolean;
  issues: string[];
  fatals: TierIssue[];
  fixes: TierIssue[];
  warnings: TierIssue[];
  flagged: boolean;
  retries: number;
  auto_fix_count: number;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  userBody: string;
  systemModules: { name: string; version: string }[];
}> {
  const target_lang = opts.targetLang ?? 'pt-PT';
  const dayPlan = getDayPlan(opts.brief.day);
  const gen = dayPlan.generation ?? {};
  const weekly = Boolean(dayPlan.is_story);
  const chatCharacter = gen.chat_character ?? 'ines';
  const grammarFocusId = gen.grammar_focus?.id;
  const coreItems = opts.brief.core_items;
  const itemsById = new Map(opts.items.map((i) => [i.id, i]));
  const knownById = opts.knownById ?? new Map<string, Item>();

  const allowedTokens = buildStoryAllowedVocab({
    day: opts.brief.day,
    coreItems,
    recycleIds: opts.brief.recycle_ids,
    items: opts.items,
    knownById,
    targetLang: target_lang,
  });

  const coreWordCount = coreItems.filter((c) => c.kind === 'word').length;
  const maxLines = weekly ? 20 : coreWordCount > 8 ? 12 : 10;
  const minLines = weekly ? 12 : 6;
  const maxLineWords = opts.brief.max_words + 3;

  const mustCover = buildMustCover({ coreItems, grammarFocusId });
  const mustCoverBlock = formatMustCoverBlock(mustCover);

  const itemLines = buildStoryItemDigestLines(opts.items, coreItems).join('\n');
  const todayIds = new Set(opts.items.map((i) => i.id));
  for (const c of coreItems) todayIds.add(c.id);
  const priorLines = buildAllowedPriorDigest(knownById, {
    day: opts.brief.day,
    recycleIds: opts.brief.recycle_ids,
    todayIds,
  }).join('\n');

  const lineCountHint = weekly
    ? `WEEKLY STORY DAY: aim ${minLines}–${maxLines} lines in 2–3 scenes (code may split). ALSO write reading (60–120 words + exactly 3 questions) from WEEK_ITEMS only.`
    : `NORMAL DAY: aim ${minLines}–${maxLines} lines (code may split); learner speaks 2–4. Omit reading.`;

  const focusPatternIds = grammarFocusId
    ? resolveGrammarFocusPatternIds(grammarFocusId, coreItems)
    : coreItems.filter((c) => c.kind === 'pattern').map((c) => c.id);
  const focusHint = focusPatternIds.length
    ? `Prefer tagging these pattern ids on ≥2 lines (grammar focus): ${focusPatternIds.join(', ')}. Surfaces with o/a + noun or os/as + plural also count.`
    : '';

  const weekItems = weekly ? coreItemsForWeek(opts.brief.week) : [];
  const weekLines = weekItems
    .map((c) => `${c.id} (${c.kind}): ${c.tl}`)
    .join('\n');

  const user = `STAGE: STORY ONLY
Return cast, setting, and lines via submit_story.
${lineCountHint}
max_words per line: ${maxLineWords} (phase max ${opts.brief.max_words} + 3).
One sentence per line (one trailing .!? only). No "/" in tl.
Cover every id in MUST_COVER. Words are optional — dictionary owns them. Prefer words in natural lists when easy.
Extras OK up to 15% (list in extra[] with ar gloss). Allowed freely: MUST_COVER + RECYCLE + ALLOWED_PRIOR + ITEM_DIGEST.
${focusHint}

CHAT_CHARACTER: ${chatCharacter} (prefer when their home fits; otherwise any CHARACTERS id whose home matches the setting)
SETTING_HINT: ${dayPlan.situation_eg}
PLACE_CAST: ${charactersForPlace(`${dayPlan.situation_eg ?? ''} ${opts.brief.title_tl ?? ''}`)
  .map((c) => c.id)
  .join(', ') || chatCharacter}
GRAMMAR_FOCUS: ${grammarFocusId ? `${grammarFocusId} — ${gen.grammar_focus?.description ?? ''}` : dayPlan.rule_eg}${focusPatternIds.length ? ` → patterns: ${focusPatternIds.join(', ')}` : ''}

MUST_COVER
${mustCoverBlock}

ITEM_DIGEST
${itemLines || '(none)'}

RECYCLE_IDS
${opts.brief.recycle_ids.join(', ') || '(none)'}

ALLOWED_PRIOR (prior days + recycle surfaces — use freely, not extras)
${priorLines || '(none)'}
${
  weekly
    ? `
WEEK_ITEMS (reading must use only these — person/place/day description, 60–120 words + 3 questions)
${weekLines || '(none)'}
`
    : ''
}`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'story', version: '4' },
  ];

  const knownIds = new Set<string>([
    ...opts.items.map((i) => i.id),
    ...coreItems.map((c) => c.id),
  ]);

  const buildStory = (
    data: z.infer<typeof StoryToolSchema>,
  ): {
    story: StoryDoc;
    fixes: TierIssue[];
    fatals: TierIssue[];
    warnings: TierIssue[];
  } => {
    const fixes: TierIssue[] = [];
    const cast = ensureLearnerCast(data.cast, {
      chatCharacter,
      place: `${data.setting ?? ''} ${dayPlan.situation_eg ?? ''}`,
    });
    const rawLines = data.lines.map((line) => ({
      speaker: line.speaker,
      tl: line.tl ?? '',
      ids: line.ids ?? [],
      ...(line.en != null && line.en.trim()
        ? { en: line.en.trim() }
        : {}),
      ...(line.extra != null ? { extra: line.extra } : {}),
      ...(line.replies_to != null ? { replies_to: line.replies_to } : {}),
    }));
    const autofix = autoFixStoryLines(rawLines, itemsById, {
      allowedTokens,
      coreItems,
      knownIds,
    });
    fixes.push(...autofix.fixes);

    let reading: StoryReading | undefined;
    if (weekly && data.reading?.tl) {
      reading = {
        tl: data.reading.tl.trim(),
        questions: data.reading.questions.map((q, qi) => ({
          id: q.id?.trim() || `reading.q${qi + 1}`,
          type: q.type,
          prompt_eg: q.prompt_eg.trim(),
          options: q.options.map((o, oi) => ({
            id: o.id?.trim() || `o${oi + 1}`,
            label: o.label.trim(),
            correct: o.correct,
          })),
        })),
      };
    }

    let story: StoryDoc = {
      id: storyIdFor(opts.brief.day, target_lang),
      day: opts.brief.day,
      target_lang,
      version: opts.version,
      status: 'draft',
      cast,
      setting: data.setting.trim(),
      lines: autofix.lines,
      ...(data.scenes != null
        ? {
            scenes: data.scenes.map((s) => ({
              id: s.id,
              line_start: s.line_start,
              line_end: s.line_end,
              ...(s.title_eg != null ? { title_eg: s.title_eg } : {}),
            })),
          }
        : {}),
      is_weekly: weekly,
      ...(reading ? { reading } : {}),
    };

    // Code owns Arabic and bubble sides — enrich before checks that need them.
    story = enrichStoryDocument(story, opts.items, opts.brief.recycle_ids, {
      knownItems: [...knownById.values()],
    });

    const allIssues = checkStory({
      story,
      coreItems,
      items: opts.items,
      allowedTokens,
      grammarFocusId,
      chatCharacter,
      maxLineWords,
      targetLang: target_lang,
      mustCover,
    });
    const fatals = allIssues.filter((i) => i.tier === 'fatal');
    const warnings = allIssues.filter((i) => i.tier === 'warning');

    if (!weekly) {
      const learnerN = learnerLineIndexes(story).length;
      if (learnerN === 0) {
        warnings.push(
          warning('lines', 'learner_lines', 'learner must speak at least once'),
        );
      }
    }

    if (weekly) {
      if (!story.reading?.tl) {
        warnings.push(
          warning('reading', 'reading_missing', 'weekly story needs reading.tl'),
        );
      } else {
        const wc = wordCount(story.reading.tl);
        if (wc < 60 || wc > 120) {
          warnings.push(
            warning(
              'reading.tl',
              'reading_word_count',
              `reading needs 60–120 words, got ${wc}`,
            ),
          );
        }
        const qn = story.reading.questions?.length ?? 0;
        if (qn !== 3) {
          warnings.push(
            warning(
              'reading.questions',
              'reading_questions',
              `reading needs exactly 3 questions, got ${qn}`,
            ),
          );
        }
      }
    }

    const structureFatals = fatals.filter(isStoryStructureFatal);
    story = {
      ...story,
      status: structureFatals.length ? 'failed' : 'ready',
    };

    return { story, fixes, fatals: structureFatals, warnings: [...warnings, ...fatals.filter((f) => !isStoryStructureFatal(f))] };
  };

  const emptyTiming = {
    label: 'story',
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    usd_estimate: 0,
  };

  let call: Awaited<ReturnType<typeof callJobTool>> | null = null;
  let built: ReturnType<typeof buildStory> | null = null;
  let retries = 0;
  let totalTokens = { system: 0, input: 0, output: 0 };
  let overBudget = false;
  let parseFatals: TierIssue[] = [];

  try {
    call = await callJobTool({
      kind: 'story',
      label: 'story',
      systemPrompt: buildStorySystemPrompt(),
      brief: opts.brief,
      userBody: user,
      toolName: 'submit_story',
      toolDescription: 'Submit the day story cast, setting and lines',
      schema: StoryToolSchema,
      systemModules,
    });
    built = buildStory(call.data as z.infer<typeof StoryToolSchema>);
    totalTokens = call.tokens;
    overBudget = call.over_budget;
  } catch (err) {
    parseFatals = [
      {
        path: 'story',
        rule: 'unparseable',
        message: err instanceof Error ? err.message : String(err),
        tier: 'fatal',
      },
    ];
  }

  const needsRetry =
    parseFatals.length > 0 ||
    (built?.fatals.some(isStoryStructureFatal) ?? false);

  if (needsRetry) {
    retries = 1;
    const hints = formatStoryRetryHints([
      ...parseFatals,
      ...(built?.fatals ?? []),
    ]);
    try {
      call = await callJobTool({
        kind: 'story',
        label: 'story_retry',
        systemPrompt: buildStorySystemPrompt(),
        brief: opts.brief,
        userBody: `${user}\n\nRETRY — fix these structure fatals:\n${hints || 'output must parse with ≥4 lines, non-empty tl, speakers in cast'}`,
        toolName: 'submit_story',
        toolDescription: 'Submit the day story cast, setting and lines',
        schema: StoryToolSchema,
        systemModules,
      });
      built = buildStory(call.data as z.infer<typeof StoryToolSchema>);
      parseFatals = [];
      totalTokens = {
        system: (totalTokens.system ?? 0) + (call.tokens.system ?? 0),
        input: (totalTokens.input ?? 0) + (call.tokens.input ?? 0),
        output: (totalTokens.output ?? 0) + (call.tokens.output ?? 0),
      };
      overBudget = overBudget || call.over_budget;
    } catch (err) {
      parseFatals = [
        {
          path: 'story',
          rule: 'unparseable',
          message: err instanceof Error ? err.message : String(err),
          tier: 'fatal',
        },
      ];
      built = null;
    }
  }

  const structureFatals = [
    ...parseFatals,
    ...(built?.fatals.filter(isStoryStructureFatal) ?? []),
  ];
  const skipped = structureFatals.length > 0;

  if (!skipped && built) {
    await saveStoryDoc(built.story);
  } else if (built) {
    // Persist failed draft for admin inspection; day continues without it.
    await saveStoryDoc({ ...built.story, status: 'failed' });
  }

  const warnings = built?.warnings ?? [];
  const fixes = built?.fixes ?? [];
  const allIssues = [
    ...structureFatals.map((f) => `${f.rule}: ${f.message}`),
    ...warnings.map((w) => `${w.rule}: ${w.message}`),
  ];

  return {
    story: skipped ? null : built!.story,
    skipped,
    issues: allIssues,
    fatals: structureFatals,
    fixes,
    warnings,
    flagged: skipped || warnings.length > 0,
    retries,
    auto_fix_count: fixes.length,
    timing: call?.timing ?? emptyTiming,
    tokens: totalTokens,
    over_budget: overBudget,
    model: call?.model ?? '',
    provider: call?.provider ?? 'anthropic',
    userBody: user,
    systemModules,
  };
}
