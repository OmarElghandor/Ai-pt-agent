import { z } from 'zod';
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
  learnerLineIndexes,
} from '../storyChecks';
import { saveStoryDoc } from '../storySave';
import { fatal, type TierIssue } from '../tiers';
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

function ensureLearnerCast(
  cast: z.infer<typeof StoryToolSchema>['cast'],
  chatCharacter?: string,
): z.infer<typeof StoryToolSchema>['cast'] {
  const hasLearner = cast.some((c) => c.role === 'learner' || c.id === 'learner');
  const charId = (chatCharacter ?? 'ines').toLowerCase();
  let next = [...cast];
  if (!hasLearner) {
    next = [
      { id: 'learner', name: 'أنت', role: 'learner' as const },
      ...next,
    ];
  }
  const hasCharacter = next.some((c) => c.role === 'character');
  if (!hasCharacter) {
    next = [
      ...next,
      {
        id: charId,
        name: charId.charAt(0).toUpperCase() + charId.slice(1),
        role: 'character' as const,
      },
    ];
  }
  return next;
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
  story: StoryDoc;
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

  const itemLines = buildStoryItemDigestLines(opts.items, coreItems).join('\n');
  const coreLines = coreItems
    .map((c) => `${c.id} (${c.kind}): ${c.tl}`)
    .join('\n');
  const todayIds = new Set(opts.items.map((i) => i.id));
  for (const c of coreItems) todayIds.add(c.id);
  const priorLines = buildAllowedPriorDigest(knownById, {
    day: opts.brief.day,
    recycleIds: opts.brief.recycle_ids,
    todayIds,
  }).join('\n');

  const lineCountHint = weekly
    ? `WEEKLY STORY DAY: ${minLines}–${maxLines} lines in 2–3 scenes; recycle + prior only for extras budget. ALSO write reading (60–120 words + exactly 3 questions) from WEEK_ITEMS only.`
    : `NORMAL DAY: ${minLines}–${maxLines} lines${coreWordCount > 8 ? ' (up to 12: more than 8 core words)' : ''}; learner speaks 2–4. Omit reading.`;

  const focusPatternIds = grammarFocusId
    ? resolveGrammarFocusPatternIds(grammarFocusId, coreItems)
    : coreItems.filter((c) => c.kind === 'pattern').map((c) => c.id);
  const focusHint = focusPatternIds.length
    ? `Tag these pattern ids on ≥2 lines (grammar focus): ${focusPatternIds.join(', ')}. Surfaces with o/a + noun or os/as + plural also count.`
    : '';

  const weekItems = weekly ? coreItemsForWeek(opts.brief.week) : [];
  const weekLines = weekItems
    .map((c) => `${c.id} (${c.kind}): ${c.tl}`)
    .join('\n');

  const user = `STAGE: STORY ONLY
Return cast, setting, and lines via submit_story.
${lineCountHint}
max_words per line: ${maxLineWords} (phase max ${opts.brief.max_words} + 3).
Lists are natural ("Tem pão, queijo e ovos."). Plurals count for coverage.
Extras ≤15% of content tokens — allowed = CORE + RECYCLE + ALLOWED_PRIOR. No MAX_NEW_WORDS.
${focusHint}

CHAT_CHARACTER: ${chatCharacter}
SETTING_HINT: ${dayPlan.situation_eg}
GRAMMAR_FOCUS: ${grammarFocusId ? `${grammarFocusId} — ${gen.grammar_focus?.description ?? ''}` : dayPlan.rule_eg}${focusPatternIds.length ? ` → patterns: ${focusPatternIds.join(', ')}` : ''}

CORE_ITEMS
${coreLines || '(none)'}

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
    { name: 'story', version: '1' },
  ];

  const buildStory = (
    data: z.infer<typeof StoryToolSchema>,
  ): {
    story: StoryDoc;
    fixes: TierIssue[];
    fatals: TierIssue[];
    warnings: TierIssue[];
  } => {
    const fixes: TierIssue[] = [];
    const cast = ensureLearnerCast(data.cast, chatCharacter);
    const rawLines = data.lines.map((line) => ({
      speaker: line.speaker,
      tl: line.tl,
      ids: line.ids ?? [],
      ...(line.extra != null ? { extra: line.extra } : {}),
      ...(line.replies_to != null ? { replies_to: line.replies_to } : {}),
    }));
    const autofix = autoFixStoryLines(rawLines, itemsById, {
      allowedTokens,
      coreItems,
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

    // Code owns Arabic, sides, after_questions — enrich before checks that need them.
    story = enrichStoryDocument(story, opts.items, opts.brief.recycle_ids);

    const allIssues = checkStory({
      story,
      coreItems,
      items: opts.items,
      allowedTokens,
      grammarFocusId,
      chatCharacter,
      maxLineWords,
      targetLang: target_lang,
    });
    const fatals = allIssues.filter((i) => i.tier === 'fatal');
    const warnings = allIssues.filter((i) => i.tier === 'warning');

    if (!weekly) {
      const learnerN = learnerLineIndexes(story).length;
      if (learnerN === 0) {
        fatals.push(
          fatal('lines', 'learner_lines', 'learner must speak at least once'),
        );
      }
    }

    const aq = story.after_questions?.length ?? 0;
    if (aq < 3) {
      fatals.push(
        fatal(
          'after_questions',
          'after_questions_short',
          `need ≥3 after_questions, got ${aq}`,
        ),
      );
    }

    if (weekly) {
      if (!story.reading?.tl) {
        fatals.push(
          fatal('reading', 'reading_missing', 'weekly story needs reading.tl'),
        );
      } else {
        const wc = wordCount(story.reading.tl);
        if (wc < 60 || wc > 120) {
          fatals.push(
            fatal(
              'reading.tl',
              'reading_word_count',
              `reading needs 60–120 words, got ${wc}`,
            ),
          );
        }
        const qn = story.reading.questions?.length ?? 0;
        if (qn !== 3) {
          fatals.push(
            fatal(
              'reading.questions',
              'reading_questions',
              `reading needs exactly 3 questions, got ${qn}`,
            ),
          );
        }
      }
    }

    story = {
      ...story,
      status: fatals.length ? 'failed' : 'ready',
    };

    return { story, fixes, fatals, warnings };
  };

  let call = await callJobTool({
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

  let built = buildStory(call.data as z.infer<typeof StoryToolSchema>);
  let retries = 0;
  let totalTokens = call.tokens;
  let overBudget = call.over_budget;

  if (built.fatals.length) {
    retries = 1;
    const hints = formatStoryRetryHints(built.fatals);
    call = await callJobTool({
      kind: 'story',
      label: 'story_retry',
      systemPrompt: buildStorySystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\nRETRY — fix these fatals:\n${hints}`,
      toolName: 'submit_story',
      toolDescription: 'Submit the day story cast, setting and lines',
      schema: StoryToolSchema,
      systemModules,
    });
    built = buildStory(call.data as z.infer<typeof StoryToolSchema>);
    totalTokens = {
      system: (totalTokens.system ?? 0) + (call.tokens.system ?? 0),
      input: (totalTokens.input ?? 0) + (call.tokens.input ?? 0),
      output: (totalTokens.output ?? 0) + (call.tokens.output ?? 0),
    };
    overBudget = overBudget || call.over_budget;
  }

  await saveStoryDoc(built.story);

  return {
    story: built.story,
    issues: built.fatals.map((f) => `${f.rule}: ${f.message}`),
    fatals: built.fatals,
    fixes: built.fixes,
    warnings: built.warnings,
    flagged: built.fatals.length > 0 || built.warnings.length > 0,
    retries,
    auto_fix_count: built.fixes.length,
    timing: call.timing,
    tokens: totalTokens,
    over_budget: overBudget,
    model: call.model,
    provider: call.provider,
    userBody: user,
    systemModules,
  };
}
