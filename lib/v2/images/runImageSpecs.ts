import { z } from 'zod';
import type { Item } from '@/lib/v2/content/items';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { StoryDoc } from '@/lib/v2/content/story';
import { descriptionForPrompt } from '@/lib/v2/characters/registry';
import { type ImageSpec } from '@/lib/v2/generation/images/templates';
import { buildLessonBrief } from '@/lib/v2/generation/lesson/brief';
import { callJobTool } from '@/lib/v2/generation/lesson/jobs/call';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import {
  buildImageSpecsSystemPrompt,
  buildShotPlanRepairPrompt,
} from '@/lib/v2/generation/lesson/prompts/imageSpecs';
import {
  assignRotatedPairs,
  pickLessonCast,
  placeTextForDay,
  weekCharacterUsage,
} from './castRotation';
import { mergeMustAvoid } from './forbidden';
import {
  buildImageManifest,
  type ManifestEntry,
} from './manifest';
import { storySceneKey } from './keys';
import {
  resolveImageScene,
  specFromAuthoredScene,
  type ResolvedImageScene,
} from './resolveScene';
import {
  INTERACTIONS,
  SPOTS,
  ShotPlanRowSchema,
  autoRotateShotPlan,
  findShotPlanConflicts,
  framingForShot,
  isShotPlanValid,
  lightForTime,
  type ShotPlanRow,
  type TimeOfDay,
} from './shotPlan';

const SpecOutSchema = z.object({
  key: z.string(),
  type: z.enum(['object', 'action', 'emotion', 'place', 'scene', 'story_panel']),
  subject: z.string(),
  characters: z.array(z.string()).optional(),
  pose: z.string().optional(),
  expression: z.string().optional(),
  setting: z.string().optional(),
  framing: z.string().optional(),
  light: z.string().optional(),
  must_show: z.union([z.string(), z.array(z.string())]).optional(),
  must_avoid: z.union([z.string(), z.array(z.string())]).optional(),
  intent: z.string().optional(),
});

const VisualBriefSchema = z.object({
  place: z.string(),
  cast_outfits: z.string(),
  light_by_time: z.string(),
  theme_line: z.string(),
  shot_plan: z.array(ShotPlanRowSchema).optional(),
});

const ImageSpecsResultSchema = z.object({
  visual_brief: VisualBriefSchema,
  specs: z.array(SpecOutSchema),
});

export type VisualBrief = z.infer<typeof VisualBriefSchema>;
export type LessonAwareSpec = ImageSpec & { key: string; intent?: string };

const SLEEP_RE = /\b(sleep|sleeping|asleep|bed|pillow|nightgown|pajama|pyjama)\b/i;
const NIGHT_LIGHT_RE = /\b(night|evening|street\s*light|dusk|dark)\b/i;

/** Phrase → time_of_day. Neutral greetings default to daytime. */
export function inferTimeOfDay(
  tl: string,
  id?: string,
  storyHint?: TimeOfDay | null,
): TimeOfDay {
  const s = `${id ?? ''} ${tl}`.toLowerCase();
  if (/bom\s*dia|good_morning|good morning/.test(s)) return 'morning';
  if (/boa\s*tarde|good_afternoon|good afternoon/.test(s)) return 'afternoon';
  if (/boa\s*noite|good_night|good night/.test(s)) return 'evening';
  if (storyHint) return storyHint;
  return 'daytime';
}

function castIds(
  story: StoryDoc | null | undefined,
  lessonCast?: string[],
): string[] {
  if (lessonCast?.length) return lessonCast;
  if (!story?.cast?.length) return ['yassin', 'ines'];
  return story.cast.map((c) => {
    if (c.role === 'learner') return 'yassin';
    return c.id === 'learner' ? 'yassin' : c.id;
  });
}

function normalizeCharacters(
  chars: string[] | undefined,
  allowed: Set<string>,
  fallback: string[],
): string[] {
  const mapped = (chars ?? [])
    .map((id) => (id === 'learner' ? 'yassin' : id))
    .filter((id) => allowed.has(id));
  if (mapped.length) return [...new Set(mapped)];
  return fallback.filter((id) => allowed.has(id));
}

function forceType(
  entry: ManifestEntry,
  item: Item | undefined,
): ImageSpec['type'] {
  if (entry.source === 'story_scene' || entry.source === 'scene_page') {
    return 'scene';
  }
  if (entry.itemType === 'phrase' || item?.type === 'phrase') return 'scene';
  if (item?.type === 'form') return 'action';
  if (item?.type === 'word') {
    const pos =
      'pos' in item && typeof item.pos === 'string' ? item.pos.toLowerCase() : '';
    if (/adj|emotion/.test(pos)) return 'emotion';
    if (/verb/.test(pos)) return 'action';
    if (/place/.test(pos)) return 'place';
    return 'object';
  }
  return entry.expectedType;
}

function storyTimeHint(
  story: StoryDoc | null | undefined,
  itemId: string,
): TimeOfDay | null {
  if (!story?.lines) return null;
  for (const line of story.lines) {
    if (line.ids?.includes(itemId)) {
      const t = inferTimeOfDay(line.tl);
      if (t !== 'daytime') return t;
    }
  }
  return null;
}

function defaultShotRow(
  entry: ManifestEntry,
  item: Item | undefined,
  index: number,
  story: StoryDoc | null,
): ShotPlanRow {
  const tl = item && 'tl' in item ? String(item.tl) : entry.key;
  const time = inferTimeOfDay(
    tl,
    item?.id,
    item ? storyTimeHint(story, item.id) : null,
  );
  return {
    key: entry.key,
    moment:
      time === 'morning'
        ? 'arriving with coffee in the morning'
        : time === 'afternoon'
          ? 'back from lunch by the lift'
          : time === 'evening'
            ? 'leaving at night with coats on'
            : 'a daytime greeting in the office',
    spot: SPOTS[index % SPOTS.length]!,
    shot: index === 0 ? 'wide' : index % 2 === 0 ? 'close_two_shot' : 'over_shoulder',
    interaction: INTERACTIONS[index % INTERACTIONS.length]!,
    emotion:
      time === 'evening'
        ? 'tired but friendly'
        : index % 3 === 0
          ? 'shy first meeting'
          : 'warm smile',
    detail_prop: ['visitor badge', 'coffee cup', 'laptop bag', 'umbrella'][
      index % 4
    ]!,
    time_of_day: time,
  };
}

function applyShotToSpec(
  base: LessonAwareSpec,
  row: ShotPlanRow,
  place: string,
): LessonAwareSpec {
  const spotLabel = row.spot.replace(/_/g, ' ');
  const setting = `${place}, at the ${spotLabel}`;
  let light = lightForTime(row.time_of_day, place);
  if (
    (row.time_of_day === 'daytime' ||
      row.time_of_day === 'morning' ||
      row.time_of_day === 'afternoon') &&
    NIGHT_LIGHT_RE.test(light)
  ) {
    light = lightForTime(row.time_of_day, place);
  }
  const pose = [
    'facing each other, making eye contact',
    `interaction: ${row.interaction.replace(/_/g, ' ')}`,
    row.moment,
    row.shot === 'wide' ? 'full body ok' : 'waist-up, faces large and readable',
    'learner on the left, character on the right',
  ].join('; ');

  return {
    ...base,
    subject: `${row.moment}; ${row.interaction.replace(/_/g, ' ')}; ${row.emotion}`,
    pose,
    expression: row.emotion,
    setting,
    framing: framingForShot(row.shot),
    light,
    must_show: mergeMustAvoid(
      [
        'eye contact between the two people',
        'expressive readable faces',
        row.detail_prop,
        'bodies turned toward each other',
      ],
      { scene: true },
    ).slice(0, 6),
    must_avoid: mergeMustAvoid(base.must_avoid, { scene: true }),
    intent:
      base.intent ||
      `${row.moment} — two colleagues ${row.interaction.replace(/_/g, ' ')} (${row.emotion}) at the ${spotLabel}`,
  };
}

function defaultSpecForEntry(opts: {
  entry: ManifestEntry;
  item?: Item;
  brief: VisualBrief;
  cast: string[];
  allowed: Set<string>;
  shot?: ShotPlanRow;
}): LessonAwareSpec {
  const { entry, item, brief, cast, allowed, shot } = opts;
  const type = forceType(entry, item);
  const tl = item && 'tl' in item ? String(item.tl) : entry.key;
  const pair = normalizeCharacters(cast.slice(0, 2), allowed, ['yassin', 'ines']);
  const place = brief.place;

  let base: LessonAwareSpec;
  if (type === 'scene') {
    base = {
      key: entry.key,
      type: 'scene',
      subject: `${pair.join(' and ')} interacting in ${place}`,
      characters: pair,
      pose: 'facing each other, eye contact, mid-conversation',
      setting: place,
      framing:
        entry.source === 'story_scene'
          ? framingForShot('wide')
          : framingForShot(shot?.shot ?? 'close_two_shot'),
      light: lightForTime(shot?.time_of_day ?? 'daytime', place),
      must_show: ['eye contact', 'readable faces', 'both people'],
      must_avoid: mergeMustAvoid([], { scene: true }),
      intent: `two colleagues interacting in ${place}`,
    };
  } else {
    base = {
      key: entry.key,
      type,
      subject: tl,
      characters: type === 'object' ? [] : pair.slice(0, 1),
      setting: place,
      must_show: [tl],
      must_avoid: mergeMustAvoid([]),
      intent: `${tl} in use at ${place}`,
    };
  }

  if (shot && type === 'scene') return applyShotToSpec(base, shot, place);
  return base;
}

function enforceSpec(opts: {
  raw: z.infer<typeof SpecOutSchema>;
  entry: ManifestEntry;
  item?: Item;
  brief: VisualBrief;
  cast: string[];
  allowed: Set<string>;
  shot?: ShotPlanRow;
}): LessonAwareSpec {
  const type = forceType(opts.entry, opts.item);
  const fallback = defaultSpecForEntry({
    entry: opts.entry,
    item: opts.item,
    brief: opts.brief,
    cast: opts.cast,
    allowed: opts.allowed,
    shot: opts.shot,
  });
  let characters = normalizeCharacters(
    opts.raw.characters,
    opts.allowed,
    fallback.characters ?? opts.cast,
  );
  if (type === 'object' && !opts.raw.characters?.length) characters = [];
  else if (type === 'scene' && characters.length < 2) {
    characters = normalizeCharacters(opts.cast, opts.allowed, ['yassin', 'ines']);
  }

  let subject = opts.raw.subject || fallback.subject;
  let pose = opts.raw.pose || fallback.pose;
  let light = opts.raw.light || fallback.light;
  let intent = opts.raw.intent || fallback.intent;
  const time = opts.shot?.time_of_day ?? 'daytime';

  if (time === 'evening') {
    if (SLEEP_RE.test(subject) || SLEEP_RE.test(pose ?? '') || SLEEP_RE.test(intent ?? '')) {
      subject = fallback.subject;
      pose = fallback.pose;
      intent = fallback.intent;
      light = fallback.light;
    }
  }
  if (time !== 'evening' && NIGHT_LIGHT_RE.test(light ?? '')) {
    light = lightForTime(time, opts.brief.place);
  }

  let spec: LessonAwareSpec = {
    key: opts.entry.key,
    type,
    subject,
    characters,
    pose,
    expression: opts.raw.expression || fallback.expression || opts.shot?.emotion,
    setting: opts.raw.setting || fallback.setting,
    framing: opts.raw.framing || fallback.framing,
    light,
    must_show: opts.raw.must_show || fallback.must_show,
    must_avoid: mergeMustAvoid(opts.raw.must_avoid, { scene: type === 'scene' }),
    intent,
  };

  if (opts.shot && type === 'scene') {
    spec = applyShotToSpec(spec, opts.shot, opts.brief.place);
  }
  return spec;
}

function storyLinesForItem(
  story: StoryDoc | null | undefined,
  itemId: string,
): { speaker: string; tl: string; listener?: string }[] {
  if (!story?.lines?.length) return [];
  const out: { speaker: string; tl: string; listener?: string }[] = [];
  story.lines.forEach((line, i) => {
    if (line.ids?.includes(itemId)) {
      const next = story.lines[i + 1];
      out.push({
        speaker: line.speaker,
        tl: line.tl,
        listener: next?.speaker,
      });
    }
  });
  return out;
}

function buildUserPayload(opts: {
  pack: LessonPack;
  story: StoryDoc | null;
  day: number;
  entries: ManifestEntry[];
  repairNote?: string;
  lessonCast?: string[];
}): string {
  const lessonCast = opts.lessonCast?.length
    ? opts.lessonCast
    : castIds(opts.story);
  const castPayload = lessonCast.map((id) => ({
    id,
    role: id === 'yassin' ? 'learner' : 'character',
    name: id,
    sheet: descriptionForPrompt(id),
  }));
  const lines = (opts.story?.lines ?? []).map((l) => ({
    speaker: l.speaker === 'learner' ? 'yassin' : l.speaker,
    tl: l.tl,
    ids: l.ids ?? [],
    time_of_day: inferTimeOfDay(l.tl),
  }));

  const itemsById = new Map((opts.pack.items ?? []).map((i) => [i.id, i]));
  const keys = opts.entries.map((e) => {
    const item = e.itemId ? itemsById.get(e.itemId) : undefined;
    const tl = item && 'tl' in item ? String(item.tl) : e.key;
    return {
      key: e.key,
      source: e.source,
      expected_type: e.expectedType,
      aspect: e.aspect,
      forced_time_of_day: item
        ? inferTimeOfDay(tl, item.id, storyTimeHint(opts.story, item.id))
        : e.source === 'story_scene'
          ? 'daytime'
          : 'daytime',
      item: item
        ? {
            id: item.id,
            type: item.type,
            tl: 'tl' in item ? item.tl : undefined,
            ar: 'ar' in item ? item.ar : undefined,
            context_eg:
              'context_eg' in item
                ? (item as { context_eg?: string }).context_eg
                : undefined,
            replies_to:
              'replies_to' in item
                ? (item as { replies_to?: string }).replies_to
                : undefined,
            story_lines: storyLinesForItem(opts.story, item.id),
          }
        : null,
    };
  });

  const situation =
    opts.pack.lesson?.situation?.eg ||
    opts.pack.lesson?.situation?.tl ||
    '';

  return JSON.stringify(
    {
      day: opts.day,
      situation,
      story_setting: opts.story?.setting ?? '',
      cast: castPayload,
      story_lines: lines,
      keys,
      ...(opts.repairNote ? { repair: opts.repairNote } : {}),
    },
    null,
    2,
  );
}

function resolveWantedEntries(opts: {
  pack: LessonPack;
  story: StoryDoc | null;
  day: number;
  keys?: string[];
}): ManifestEntry[] {
  const entries = buildImageManifest({
    pack: opts.pack,
    story: opts.story,
    day: opts.day,
    targetLang: opts.story?.target_lang,
  });
  const itemsById = new Map((opts.pack.items ?? []).map((i) => [i.id, i]));
  let wanted = opts.keys?.length
    ? entries.filter((e) => opts.keys!.includes(e.key))
    : entries;
  if (opts.keys?.length) {
    const have = new Set(wanted.map((e) => e.key));
    for (const key of opts.keys) {
      if (have.has(key)) continue;
      const item = itemsById.get(key);
      if (key.startsWith('story.')) {
        wanted.push({
          key,
          aspect: '16:9',
          expectedType: 'scene',
          source: 'story_scene',
        });
      } else if (item?.type === 'phrase') {
        wanted.push({
          key,
          aspect: '4:3',
          expectedType: 'scene',
          itemId: item.id,
          itemType: 'phrase',
          source: 'phrase',
        });
      } else if (item) {
        wanted.push({
          key,
          aspect: '1:1',
          expectedType: 'object',
          itemId: item.id,
          itemType: item.type,
          source: 'word',
        });
      } else {
        wanted.push({
          key,
          aspect: key.startsWith('phrase.') ? '4:3' : '1:1',
          expectedType: key.startsWith('phrase.') ? 'scene' : 'object',
          itemId: key,
          itemType: key.startsWith('phrase.') ? 'phrase' : 'word',
          source: key.startsWith('phrase.') ? 'phrase' : 'word',
        });
      }
    }
  }
  return wanted;
}

function ensureShotPlan(
  brief: VisualBrief,
  wanted: ManifestEntry[],
  itemsById: Map<string, Item>,
  story: StoryDoc | null,
): ShotPlanRow[] {
  const existing = (brief.shot_plan ?? []).filter((r) =>
    wanted.some((e) => e.key === r.key),
  );
  const byKey = new Map(existing.map((r) => [r.key, r]));
  const keys = wanted.map((e) => e.key);
  const filled = keys.map((key, i) => {
    const entry = wanted[i]!;
    const item = entry.itemId ? itemsById.get(entry.itemId) : undefined;
    const row = byKey.get(key) ?? defaultShotRow(entry, item, i, story);
    const tl = item && 'tl' in item ? String(item.tl) : key;
    const forced = inferTimeOfDay(
      tl,
      item?.id,
      item ? storyTimeHint(story, item.id) : null,
    );
    return { ...row, key, time_of_day: forced };
  });
  if (isShotPlanValid(filled)) return filled;
  return autoRotateShotPlan(filled, keys);
}

export type RunImageSpecsResult = {
  visual_brief: VisualBrief;
  specs: LessonAwareSpec[];
  byKey: Map<string, LessonAwareSpec>;
  fromModel: boolean;
};

/**
 * One model call per lesson for keys that need specs (+ optional repair).
 * Non-fatal: on failure, code defaults fill every requested key.
 */
export async function runImageSpecs(opts: {
  day: number;
  pack: LessonPack;
  story?: StoryDoc | null;
  keys?: string[];
  brief?: ReturnType<typeof buildLessonBrief>;
}): Promise<RunImageSpecsResult> {
  const story = opts.story ?? null;
  const wantedAll = resolveWantedEntries({
    pack: opts.pack,
    story,
    day: opts.day,
    keys: opts.keys,
  });

  const authoredByKey = new Map<string, ResolvedImageScene>();
  for (const entry of wantedAll) {
    const resolved = await resolveImageScene({
      day: opts.day,
      key: entry.key,
      itemId: entry.itemId,
      targetLang: story?.target_lang,
    });
    if (resolved.skipSpecs && resolved.scenePrompt) {
      authoredByKey.set(entry.key, resolved);
    }
  }

  const wanted = wantedAll.filter((e) => !authoredByKey.has(e.key));

  const dayPlan = getDayPlan(opts.day);
  const place = placeTextForDay(opts.day, story?.setting);
  const lessonCast = pickLessonCast({
    place,
    chatCharacter: dayPlan?.generation?.chat_character,
    max: 4,
  });
  // Merge story cast partners so existing dialogue speakers stay allowed.
  for (const id of castIds(story)) {
    if (!lessonCast.includes(id)) lessonCast.push(id);
  }
  const cast = lessonCast.slice(0, 4);
  const allowed = new Set(cast);
  allowed.add('yassin');

  const weekUsage = await weekCharacterUsage({
    day: opts.day,
    targetLang: story?.target_lang,
  });

  const fallbackBrief: VisualBrief = {
    place: story?.setting || 'a Lisbon office',
    cast_outfits: cast.map((id) => descriptionForPrompt(id) || id).join('; '),
    light_by_time: 'morning bright, afternoon warm, evening soft, daytime clear',
    theme_line: 'greetings and introductions at work on the first day',
    shot_plan: [],
  };

  const itemsById = new Map((opts.pack.items ?? []).map((i) => [i.id, i]));

  const buildSpecs = (
    brief: VisualBrief,
    plan: ShotPlanRow[],
    rawSpecs?: z.infer<typeof SpecOutSchema>[],
  ): LessonAwareSpec[] => {
    const planByKey = new Map(plan.map((r) => [r.key, r]));
    const byRaw = new Map((rawSpecs ?? []).map((s) => [s.key, s]));
    return wanted.map((entry) => {
      const shot = planByKey.get(entry.key);
      const raw = byRaw.get(entry.key);
      if (!raw) {
        return defaultSpecForEntry({
          entry,
          item: entry.itemId ? itemsById.get(entry.itemId) : undefined,
          brief,
          cast,
          allowed,
          shot,
        });
      }
      return enforceSpec({
        raw,
        entry,
        item: entry.itemId ? itemsById.get(entry.itemId) : undefined,
        brief,
        cast,
        allowed,
        shot,
      });
    });
  };

  const authoredSpecs: LessonAwareSpec[] = [...authoredByKey.entries()].map(
    ([key, resolved]) => ({
      key,
      ...specFromAuthoredScene({
        scenePrompt: resolved.scenePrompt!,
        characters: resolved.characters,
        ratio: resolved.ratio,
      }),
    }),
  );

  let fromModel = false;
  let visual_brief = fallbackBrief;
  let plan = ensureShotPlan(fallbackBrief, wanted, itemsById, story);
  visual_brief = { ...fallbackBrief, shot_plan: plan };
  let specs = [...authoredSpecs, ...buildSpecs(visual_brief, plan)];

  if (wanted.length === 0) {
    const byKey = new Map(specs.map((s) => [s.key, s]));
    return { visual_brief, specs, byKey, fromModel: false };
  }

  try {
    const lessonBrief =
      opts.brief ??
      (dayPlan
        ? buildLessonBrief(dayPlan)
        : ({
            day: opts.day,
            phase: 1,
            week: 1,
            title_tl: '',
            title_ar: '',
            situation_eg: fallbackBrief.theme_line,
            rule_eg: '',
            grammar_focus: '',
            max_words: 7,
            chat_character: cast.find((c) => c !== 'yassin') || 'ines',
            early_chunks_tl: [],
            core_items: [],
            core_items_tl: [],
            core_items_source: 'core_file',
            recycle_ids: [],
            no_new_items: false,
            planned_presets: [],
            yesterday: null,
            yesterday_missing: false,
            micro_step: '',
            warnings: [],
          } as ReturnType<typeof buildLessonBrief>));

    const callOnce = async (repairNote?: string) =>
      callJobTool({
        label: repairNote ? 'image_specs_repair' : 'image_specs',
        kind: 'image_specs',
        systemPrompt: buildImageSpecsSystemPrompt(),
        brief: lessonBrief,
        userBody: buildUserPayload({
          pack: opts.pack,
          story,
          day: opts.day,
          entries: wanted,
          repairNote,
          lessonCast: cast,
        }),
        toolName: 'image_specs',
        toolDescription: 'Lesson visual brief, shot_plan, and image specs',
        schema: ImageSpecsResultSchema,
        maxTokens: 5000,
      });

    let result = await callOnce();
    let parsed = ImageSpecsResultSchema.safeParse(result.data);

    if (parsed.success) {
      fromModel = true;
      visual_brief = parsed.data.visual_brief;
      let rows = ensureShotPlan(visual_brief, wanted, itemsById, story);
      const conflicts = findShotPlanConflicts(rows);
      if (conflicts.length) {
        console.warn('[image_specs] shot_plan conflicts', conflicts);
        result = await callOnce(buildShotPlanRepairPrompt(conflicts));
        parsed = ImageSpecsResultSchema.safeParse(result.data);
        if (parsed.success) {
          visual_brief = parsed.data.visual_brief;
          rows = ensureShotPlan(visual_brief, wanted, itemsById, story);
        }
        if (!isShotPlanValid(rows)) {
          rows = autoRotateShotPlan(rows, wanted.map((e) => e.key));
        }
      }
      plan = rows;
      visual_brief = { ...visual_brief, shot_plan: plan };
      specs = [
        ...authoredSpecs,
        ...buildSpecs(
          visual_brief,
          plan,
          parsed.success ? parsed.data.specs : undefined,
        ),
      ];
    }
  } catch (err) {
    console.warn(
      '[image_specs] model failed; using code defaults',
      err instanceof Error ? err.message : err,
    );
    plan = ensureShotPlan(fallbackBrief, wanted, itemsById, story);
    visual_brief = { ...fallbackBrief, shot_plan: plan };
    specs = [...authoredSpecs, ...buildSpecs(visual_brief, plan)];
  }

  if (story && (!opts.keys || opts.keys.some((k) => k.startsWith('story.')))) {
    const sk = storySceneKey(opts.day, story.target_lang);
    if (!specs.some((s) => s.key === sk) && wanted.some((e) => e.key === sk)) {
      const shot = plan.find((r) => r.key === sk);
      specs.push(
        defaultSpecForEntry({
          entry: {
            key: sk,
            aspect: '16:9',
            expectedType: 'scene',
            source: 'story_scene',
          },
          brief: visual_brief,
          cast,
          allowed,
          shot,
        }),
      );
    }
  }

  // Enforce §10 pair rotation on generated (non-authored) specs.
  const fixedByKey = new Map<string, string[]>();
  for (const [key, resolved] of authoredByKey) {
    if (resolved.characters?.length) fixedByKey.set(key, resolved.characters);
  }
  const rotated = assignRotatedPairs({
    keys: specs.map((s) => s.key),
    lessonCast: cast,
    fixedByKey,
    weekCounts: weekUsage.counts,
    weekTotalImages: weekUsage.totalImages,
  });
  specs = specs.map((s) => {
    if (authoredByKey.has(s.key)) return s;
    const chars = rotated.byKey.get(s.key);
    if (!chars?.length) return s;
    return { ...s, characters: chars };
  });

  const byKey = new Map(specs.map((s) => [s.key, s]));
  return { visual_brief, specs, byKey, fromModel };
}

export function specWithoutKey(spec: LessonAwareSpec): ImageSpec {
  const { key: _k, ...rest } = spec;
  return rest;
}
