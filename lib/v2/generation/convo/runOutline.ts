import { charactersForPlace } from '@/lib/v2/characters/registry';
import { validateConvoOutline } from '@/lib/v2/convo/pack/validateOutline';
import {
  buildLessonBrief,
  formatLessonBrief,
} from '@/lib/v2/generation/lesson/brief';
import { callJobTool } from '@/lib/v2/generation/lesson/jobs/call';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import type { LessonPack } from '@/lib/v2/content/lesson';
import {
  ConvoOutlineToolSchema,
  type ConvoOutline,
} from './outlineSchema';
import { CONVO_OUTLINE_SYSTEM } from './prompts/outline';

export type RunConvoOutlineResult = {
  outline: ConvoOutline;
  issues: ReturnType<typeof validateConvoOutline>['issues'];
  ok: boolean;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
};

function placeFromLesson(lesson: LessonPack, dayPlanSituation: string): string {
  const sit = lesson.lesson?.situation;
  if (sit && typeof sit === 'object' && 'tl' in sit && typeof sit.tl === 'string') {
    return sit.tl;
  }
  return dayPlanSituation || 'Lisboa';
}

function allowedIdsForDay(day: number, lesson: LessonPack): string[] {
  const core = getCoreItemsDay(day);
  const fromCore = [
    ...core.core_items.map((c) => c.id),
    ...core.recycle_ids,
  ];
  const fromLesson = (lesson.items ?? []).map((i) => i.id);
  return [...new Set([...fromCore, ...fromLesson])];
}

function itemLines(day: number, lesson: LessonPack): string {
  const core = getCoreItemsDay(day);
  const lines: string[] = [];
  for (const c of core.core_items) {
    lines.push(`CORE ${c.id} (${c.kind}): ${c.tl}`);
  }
  for (const id of core.recycle_ids) {
    const item = (lesson.items ?? []).find((i) => i.id === id);
    lines.push(`RECYCLE ${id}: ${item && 'tl' in item ? item.tl : id}`);
  }
  if (lines.length === 0) {
    for (const i of lesson.items ?? []) {
      if ('tl' in i && typeof i.tl === 'string') {
        lines.push(`ITEM ${i.id} (${i.type}): ${i.tl}`);
      }
    }
  }
  return lines.join('\n') || '(no items)';
}

export async function runConvoOutlineJob(opts: {
  day: number;
  targetLang: string;
  lesson: LessonPack;
}): Promise<RunConvoOutlineResult> {
  const dayPlan = getDayPlan(opts.day);
  const brief = buildLessonBrief(dayPlan);
  const place = placeFromLesson(opts.lesson, dayPlan.situation_eg);
  const allowedChars = charactersForPlace(place, { includeLearner: false });
  const charBlock =
    allowedChars.length > 0
      ? allowedChars.map((c) => `${c.id} — ${c.description}`).join('\n')
      : 'ines — default when no place match';
  const allowedIds = allowedIdsForDay(opts.day, opts.lesson);
  const preferMap =
    /direc|caminho|esquerda|direita|metro|rua|mapa|way|left|right/i.test(
      `${dayPlan.title_tl} ${dayPlan.situation_eg} ${place}`,
    );

  const userBody = `STAGE: CONVO_OUTLINE ONLY
Return scene, visual, groups, recap via submit_convo_outline.

PLACE_HINT: ${place}
PREFER_VISUAL: ${preferMap ? 'map' : 'scene_card'}
CHAT_CHARACTER_HINT: ${dayPlan.generation?.chat_character ?? brief.chat_character}

ALLOWED_CHARACTERS
${charBlock}

CORE_OR_RECYCLE
${itemLines(opts.day, opts.lesson)}

DAY_BRIEF
${formatLessonBrief(brief)}
`;

  const call = await callJobTool({
    label: 'convo_outline',
    kind: 'convo_outline',
    systemPrompt: CONVO_OUTLINE_SYSTEM,
    brief,
    userBody,
    toolName: 'submit_convo_outline',
    toolDescription: 'Conversation pack outline (scene, visual, groups, recap)',
    schema: ConvoOutlineToolSchema,
    systemModules: [{ name: 'convo_outline', version: '1' }],
  });

  const validated = validateConvoOutline(call.data, {
    allowedItemIds: allowedIds,
    placeHint: place,
  });

  if (!validated.ok || !validated.outline) {
    const msg = validated.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.path}: [${i.rule}] ${i.message}`)
      .join('; ');
    throw new Error(`convo_outline validation failed: ${msg || 'unknown'}`);
  }

  // Prefer a place-fitting character when the model drifted.
  let outline = validated.outline;
  const fits = allowedChars.map((c) => c.id);
  if (
    fits.length > 0 &&
    !fits.includes(outline.scene.character_id) &&
    dayPlan.generation?.chat_character &&
    fits.includes(dayPlan.generation.chat_character)
  ) {
    outline = {
      ...outline,
      scene: {
        ...outline.scene,
        character_id: dayPlan.generation.chat_character,
      },
    };
  } else if (fits.length > 0 && !fits.includes(outline.scene.character_id)) {
    outline = {
      ...outline,
      scene: { ...outline.scene, character_id: fits[0]! },
    };
  }

  const recheck = validateConvoOutline(outline, {
    allowedItemIds: allowedIds,
    placeHint: place,
  });

  return {
    outline: recheck.outline ?? outline,
    issues: recheck.issues,
    ok: recheck.ok,
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
  };
}
