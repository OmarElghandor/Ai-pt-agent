import type { LessonPack } from '@/lib/v2/content/lesson';
import type { ConvoGroup, ConvoVisual } from '@/lib/v2/convo/pack/schema';
import {
  buildLessonBrief,
  formatLessonBrief,
} from '@/lib/v2/generation/lesson/brief';
import { callJobTool } from '@/lib/v2/generation/lesson/jobs/call';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { day18ItemsExampleSnippet } from './day18Example';
import { ConvoItemsToolSchema, type ConvoItemsResult } from './itemsSchema';
import { CONVO_ITEMS_SYSTEM } from './prompts/items';
import { surfacesForDay } from './itemSurfaces';

export type RunConvoItemsResult = {
  result: ConvoItemsResult;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
};

export async function runConvoItemsJob(opts: {
  day: number;
  lesson: LessonPack;
  group: ConvoGroup;
  visual: ConvoVisual;
  allGroupItemIds: string[];
}): Promise<RunConvoItemsResult> {
  const dayPlan = getDayPlan(opts.day);
  const brief = buildLessonBrief(dayPlan);
  const surfaces = surfacesForDay(opts.day, opts.lesson);
  const surfaceLines = opts.group.item_ids
    .map((id) => {
      const s = surfaces.find((x) => x.id === id);
      return `${id}: ${s?.tl ?? '(missing tl)'}`;
    })
    .join('\n');

  const mapSteps =
    opts.visual.type === 'map'
      ? opts.visual.route
          .map((s) => `${s.step_id} (${s.from}→${s.to}, item=${s.item_id})`)
          .join('\n')
      : '(not a map)';
  const hotspots =
    opts.visual.type === 'scene_card'
      ? opts.visual.hotspots
          .map((h) => `${h.id} → ${h.item_id}`)
          .join('\n') || '(none)'
      : '(not scene_card)';

  const userBody = `STAGE: CONVO_ITEMS for one group
Return { group_id, items } via submit_convo_items.
group_id MUST be "${opts.group.id}".
Write banks ONLY for GROUP_ITEM_IDS.

GROUP_ITEM_IDS
${opts.group.item_ids.join(', ')}

ITEM_SURFACES
${surfaceLines}

OTHER_PACK_ITEM_IDS (valid choice distractors)
${opts.allGroupItemIds.filter((id) => !opts.group.item_ids.includes(id)).join(', ') || '(none)'}

VISUAL_TYPE: ${opts.visual.type}
MAP_STEPS
${mapSteps}
HOTSPOTS
${hotspots}

EXAMPLE_SHAPE (hand-written day 18 — match this depth)
${day18ItemsExampleSnippet()}

DAY_BRIEF
${formatLessonBrief(brief)}
`;

  const callOpts = {
    label: 'convo_items',
    kind: 'convo_items' as const,
    systemPrompt: CONVO_ITEMS_SYSTEM,
    brief,
    userBody,
    toolName: 'submit_convo_items',
    toolDescription: 'Item banks for one conversation group',
    schema: ConvoItemsToolSchema,
    systemModules: [{ name: 'convo_items', version: '1' }],
    cachedExtra: day18ItemsExampleSnippet(),
    cachedExampleName: 'pt-PT.day-18.json',
  };

  let call: Awaited<ReturnType<typeof callJobTool>>;
  try {
    call = await callJobTool(callOpts);
  } catch (err) {
    // One retry (09 §4.1 fail → one retry).
    console.warn(
      '[convo_items] retry after',
      err instanceof Error ? err.message : err,
    );
    call = await callJobTool(callOpts);
  }

  const parsed = ConvoItemsToolSchema.safeParse(call.data);
  if (!parsed.success) {
    throw new Error(
      `convo_items schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }

  // Force group_id; stub any missing banks (model sometimes omits one).
  const items: ConvoItemsResult['items'] = {};
  for (const id of opts.group.item_ids) {
    const bank = parsed.data.items[id];
    const surface = surfaces.find((s) => s.id === id)?.tl ?? id;
    items[id] = bank ?? {
      coach_intro_eg: `عشان نقول كده بنقول ${surface}`,
      choice_questions: [
        {
          id: `q_${id.replace(/\W+/g, '_')}_choice`,
          tl: `${surface}?`,
          option_ids: [id, opts.group.item_ids.find((x) => x !== id) ?? id],
          correct_id: id,
        },
      ],
      open_questions: [
        {
          id: `q_${id.replace(/\W+/g, '_')}_open`,
          tl: 'E agora?',
          item_id: id,
          help_ladder: {
            step1_reask_tl: 'Como?',
            step2_hint_eg: `بتبدأ بـ ${surface.slice(0, 3)}…`,
          },
        },
      ],
      common_mistakes: [],
    };
  }

  return {
    result: { group_id: opts.group.id, items },
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
  };
}
