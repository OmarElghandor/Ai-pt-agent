import type { CoreItem } from '@/lib/v2/generation/lesson/coreItems';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { keywordsFromExamples } from './keywords';
import { resolveLessonDayBank } from './loadLessonDay';
import type {
  ConvoGoal,
  ConvoGoalBank,
  ConvoScene,
  ConvoSceneTimeOfDay,
} from './types';
import { validateGoals } from './validate';

const GREETING_BY_TIME: Record<
  ConvoSceneTimeOfDay,
  { id: string; tl: string; eg: string }
> = {
  morning: {
    id: 'phrase.good_morning',
    tl: 'Bom dia!',
    eg: 'صباح الخير',
  },
  afternoon: {
    id: 'phrase.good_afternoon',
    tl: 'Boa tarde!',
    eg: 'مساء الخير (بعد الضهر)',
  },
  evening: {
    id: 'phrase.good_night',
    tl: 'Boa noite!',
    eg: 'تصبح على خير',
  },
  night: {
    id: 'phrase.good_night',
    tl: 'Boa noite!',
    eg: 'تصبح على خير',
  },
};

function stripPunct(tl: string): string {
  return tl.replace(/[!?.,:;]+$/g, '').trim();
}

function phraseGoal(
  item: CoreItem,
  extras: string[] = [],
): ConvoGoal {
  const examples = [
    item.tl,
    ...(item.variant_tl ?? []),
    ...extras,
  ]
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);
  const frameBase = stripPunct(item.tl) || item.tl;
  return {
    id: item.id,
    intent_eg: item.eg || item.tl,
    examples_tl: examples,
    keywords: keywordsFromExamples(examples),
    help: {
      frame_tl: frameBase.includes(' ')
        ? frameBase.replace(/\S+$/, '___')
        : `${frameBase} ___`,
      eg: item.eg || 'قولها كده',
      chips: examples.slice(0, 4),
    },
  };
}

function buildGreetGoal(
  items: CoreItem[],
  timeOfDay: ConvoSceneTimeOfDay,
): ConvoGoal {
  const timed = GREETING_BY_TIME[timeOfDay];
  const hello = items.find((i) => i.id === 'phrase.hello');
  const variants = items.filter(
    (i) => i.variant_group === 'greeting.time_of_day',
  );
  const preferred =
    variants.find((v) => v.id === timed.id) ??
    variants[0] ??
    hello;
  const examples = [
    preferred?.tl,
    hello?.tl,
    timed.tl,
    'Olá, bom dia!',
  ]
    .map((t) => (t ?? '').trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);

  return {
    id: 'day.greet',
    intent_eg: 'يحيّي بالتحية المناسبة للوقت',
    intent_en: 'greet with the right greeting for the time of day',
    examples_tl: examples,
    keywords: keywordsFromExamples([
      ...examples,
      'ola',
      'olá',
      'bom',
      'dia',
      'tarde',
      'noite',
    ]),
    seed_tl: preferred?.tl ?? timed.tl,
    help: {
      frame_tl: stripPunct(preferred?.tl ?? timed.tl) || 'Bom dia',
      eg: preferred?.eg ?? timed.eg,
      chips: examples.slice(0, 4),
    },
  };
}

function generalDayGoals(items: CoreItem[]): {
  goals: ConvoGoal[];
  suggested_words: string[];
} {
  const suggested_words: string[] = [];
  const goals: ConvoGoal[] = [];
  const seenVariant = new Set<string>();

  for (const item of items) {
    if (item.kind === 'word' || item.kind === 'verb') {
      suggested_words.push(item.tl.replace(/^(o|a|os|as)\s+/i, '').trim());
      continue;
    }
    if (item.variant_group === 'greeting.time_of_day') {
      if (seenVariant.has(item.variant_group)) continue;
      seenVariant.add(item.variant_group);
      goals.push(buildGreetGoal(items, 'morning'));
      continue;
    }
    if (item.kind === 'phrase' || item.kind === 'pattern') {
      goals.push(phraseGoal(item));
    }
  }
  return { goals, suggested_words };
}

export function sceneForDay(
  day: number,
  timeOfDay: ConvoSceneTimeOfDay = 'morning',
): ConvoScene {
  let character_id = 'ines';
  let place: string | undefined;
  try {
    const plan = getDayPlan(day);
    character_id = plan.generation?.chat_character ?? 'ines';
    place = plan.situation_eg || plan.generation?.situation_tl;
  } catch {
    /* plan optional in tests */
  }
  return { character_id, place, time_of_day: timeOfDay };
}

/**
 * Core-items fallback only (no authored file / cache).
 * Words → suggested_words; phrases/patterns → goals.
 */
export function loadGoalsForDayCore(
  day: number,
  opts?: { timeOfDay?: ConvoSceneTimeOfDay },
): ConvoGoalBank {
  const timeOfDay = opts?.timeOfDay ?? 'morning';
  const entry = getCoreItemsDay(day);
  const items = entry.core_items;
  const built = generalDayGoals(items);
  const { ok, issues } = validateGoals(built.goals);
  if (!ok) {
    throw new Error(
      `Invalid goals for day ${day}: ${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
    );
  }

  return {
    source: 'lesson',
    day,
    goals: built.goals,
    suggested_words: built.suggested_words,
    scene: sceneForDay(day, timeOfDay),
  };
}

/**
 * Lesson-day goals: authored file → cached generated → core-items.
 */
export function loadGoalsForDay(
  day: number,
  opts?: { timeOfDay?: ConvoSceneTimeOfDay; baseDir?: string },
): ConvoGoalBank {
  const resolved = resolveLessonDayBank(day, {
    ...(opts?.baseDir ? { baseDir: opts.baseDir } : {}),
  });
  if (resolved) {
    if (
      opts?.timeOfDay &&
      resolved.scene &&
      !resolved.goals.some((g) => g.time_of_day)
    ) {
      return {
        ...resolved,
        scene: { ...resolved.scene, time_of_day: opts.timeOfDay },
      };
    }
    return resolved;
  }
  return loadGoalsForDayCore(day, { timeOfDay: opts?.timeOfDay });
}
