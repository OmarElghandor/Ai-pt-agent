import { loadPlan, type DayPlan } from '@/lib/v2/generation/lesson/plan';
import {
  loadCoreItemsFile,
  type CoreItemsDay,
} from '@/lib/v2/generation/lesson/coreItems';
import type {
  TopicsFile,
  TopicsFileTheme,
  TopicsFileTopic,
} from './types';

export type TopicOverride = Partial<
  Pick<
    TopicsFileTopic,
    | 'id'
    | 'title_tl'
    | 'title_ar'
    | 'character_id'
    | 'free_topic_id'
    | 'item_ids'
  >
> & {
  day: number;
  theme_id?: string;
  /** Optional Egyptian subtitle override. */
  subtitle_eg?: string;
};

function packIdFor(day: number, targetLang: string): string {
  return `${targetLang}.day-${day}`;
}

function topicFromDay(
  dayPlan: DayPlan,
  core: CoreItemsDay | undefined,
  targetLang: string,
  override?: TopicOverride,
): TopicsFileTopic {
  const day = dayPlan.day;
  const item_ids =
    override?.item_ids ??
    (core?.core_items ?? []).map((c) => c.id);
  return {
    id: override?.id ?? `day-${day}`,
    title_tl: override?.title_tl ?? dayPlan.title_tl,
    title_ar: override?.title_ar ?? dayPlan.title_ar,
    day,
    pack_id: packIdFor(day, targetLang),
    item_ids: [...item_ids],
    ...(override?.character_id
      ? { character_id: override.character_id }
      : dayPlan.generation?.chat_character
        ? { character_id: dayPlan.generation.chat_character }
        : {}),
    ...(override?.free_topic_id
      ? { free_topic_id: override.free_topic_id }
      : {}),
    ...(override?.subtitle_eg
      ? { subtitle_eg: override.subtitle_eg }
      : dayPlan.situation_eg
        ? { subtitle_eg: dayPlan.situation_eg }
        : {}),
  };
}

/**
 * Build the Learn catalog from the curriculum (days + core-items).
 * `overridesFile` (topics.pt-PT.json) supplies theme grouping + field overrides only.
 */
export function buildTopicsFromCurriculum(opts?: {
  targetLang?: string;
  overridesFile?: TopicsFile;
}): TopicsFile {
  const targetLang = opts?.targetLang ?? 'pt-PT';
  const plan = loadPlan();
  const coreFile = loadCoreItemsFile();
  const coreByDay = new Map(
    coreFile.days.map((d) => [d.day, d] as const),
  );

  const overridesFile = opts?.overridesFile;
  const overrideByDay = new Map<number, TopicOverride>();
  const themeOfDay = new Map<number, string>();
  const themeMeta = new Map<
    string,
    { id: string; title_tl: string; title_ar: string }
  >();

  if (overridesFile) {
    for (const theme of overridesFile.themes) {
      themeMeta.set(theme.id, {
        id: theme.id,
        title_tl: theme.title_tl,
        title_ar: theme.title_ar,
      });
      for (const t of theme.topics) {
        themeOfDay.set(t.day, theme.id);
        overrideByDay.set(t.day, {
          day: t.day,
          id: t.id,
          title_tl: t.title_tl,
          title_ar: t.title_ar,
          character_id: t.character_id,
          free_topic_id: t.free_topic_id,
          theme_id: theme.id,
          // item_ids from overrides are ignored — core items win (P8).
        });
      }
    }
  }

  const topicsByTheme = new Map<string, TopicsFileTopic[]>();
  const ensureTheme = (id: string) => {
    if (!topicsByTheme.has(id)) topicsByTheme.set(id, []);
  };

  for (const dayPlan of plan.days) {
    // Skip test-only / empty core days that cannot back a conversation.
    const core = coreByDay.get(dayPlan.day);
    if (!core || core.is_test) continue;
    if (!core.core_items?.length && !overrideByDay.has(dayPlan.day)) {
      continue;
    }

    const override = overrideByDay.get(dayPlan.day);
    const topic = topicFromDay(dayPlan, core, targetLang, override);
    const themeId =
      override?.theme_id ??
      themeOfDay.get(dayPlan.day) ??
      'path';
    ensureTheme(themeId);
    if (!themeMeta.has(themeId)) {
      themeMeta.set(themeId, {
        id: themeId,
        title_tl: themeId === 'path' ? 'Percurso' : themeId,
        title_ar: themeId === 'path' ? 'المسار' : themeId,
      });
    }
    topicsByTheme.get(themeId)!.push(topic);
  }

  // Preserve theme order from overrides, then any leftover themes.
  const orderedThemeIds: string[] = [];
  if (overridesFile) {
    for (const th of overridesFile.themes) {
      if (topicsByTheme.has(th.id)) orderedThemeIds.push(th.id);
    }
  }
  for (const id of topicsByTheme.keys()) {
    if (!orderedThemeIds.includes(id)) orderedThemeIds.push(id);
  }

  const themes: TopicsFileTheme[] = orderedThemeIds.map((id) => {
    const meta = themeMeta.get(id)!;
    const topics = (topicsByTheme.get(id) ?? []).sort(
      (a, b) => a.day - b.day,
    );
    return {
      id: meta.id,
      title_tl: meta.title_tl,
      title_ar: meta.title_ar,
      topics,
    };
  });

  return { target_lang: targetLang, themes };
}
