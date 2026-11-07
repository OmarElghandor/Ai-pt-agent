import type { CoreItem } from '@/lib/v2/generation/lesson/coreItems';
import { getCoreItemsDay } from '@/lib/v2/generation/lesson/coreItems';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { keywordsFromExamples } from './keywords';
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

/** Day 1 conversational goals (batch done-when). */
function day1Goals(
  items: CoreItem[],
  timeOfDay: ConvoSceneTimeOfDay,
): ConvoGoal[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const greet = buildGreetGoal(items, timeOfDay);

  const nameItem = byId.get('phrase.my_name_is');
  const name: ConvoGoal = nameItem
    ? {
        ...phraseGoal(nameItem, ['Chamo-me Omar.', 'Chamo-me Ana.']),
        id: 'day.name',
        intent_eg: 'يقول اسمه',
        help: {
          frame_tl: 'Chamo-me ___.',
          eg: 'Chamo-me + اسمك',
          chips: ['Chamo-me Omar.', 'Chamo-me Ana.', 'Chamo-me Yassin.'],
        },
        keywords: keywordsFromExamples([
          'Chamo-me Omar.',
          'chamo',
          'nome',
        ]),
      }
    : {
        id: 'day.name',
        intent_eg: 'يقول اسمه',
        examples_tl: ['Chamo-me Omar.', 'Chamo-me Ana.'],
        keywords: ['chamo', 'omar', 'ana'],
        help: {
          frame_tl: 'Chamo-me ___.',
          eg: 'Chamo-me + اسمك',
          chips: ['Chamo-me Omar.', 'Chamo-me Ana.'],
        },
      };

  const askItem = byId.get('phrase.whats_your_name');
  const askName: ConvoGoal = {
    id: 'day.ask_name',
    intent_eg: 'يسألها عن اسمها',
    examples_tl: [
      askItem?.tl ?? 'Como te chamas?',
      'E tu, como te chamas?',
      'Como se chama?',
    ].slice(0, 4),
    keywords: keywordsFromExamples([
      'Como te chamas?',
      'chamas',
      'chama',
      'nome',
    ]),
    help: {
      frame_tl: 'Como te chamas?',
      eg: askItem?.eg ?? 'اسألها اسمها إيه',
      chips: [
        'Como te chamas?',
        'E tu, como te chamas?',
        'Como se chama?',
      ],
    },
  };

  const niceItem = byId.get('phrase.nice_to_meet');
  const nice: ConvoGoal = niceItem
    ? {
        ...phraseGoal(niceItem),
        id: 'day.nice_to_meet',
        intent_eg: 'يقول Muito prazer',
      }
    : {
        id: 'day.nice_to_meet',
        intent_eg: 'يقول Muito prazer',
        examples_tl: ['Muito prazer!', 'Muito prazer.'],
        keywords: ['muito', 'prazer'],
        help: {
          frame_tl: 'Muito prazer!',
          eg: 'اتشرفنا',
          chips: ['Muito prazer!', 'Igualmente.'],
        },
      };

  const goodbye: ConvoGoal = {
    id: 'day.goodbye',
    intent_eg: 'يودّع',
    examples_tl: ['Adeus!', 'Tchau!', 'Até logo!', 'Até amanhã!'],
    keywords: keywordsFromExamples([
      'Adeus!',
      'Tchau!',
      'Até logo!',
      'amanha',
    ]),
    help: {
      frame_tl: 'Adeus!',
      eg: 'مع السلامة',
      chips: ['Adeus!', 'Tchau!', 'Até logo!'],
    },
  };

  return [greet, name, askName, nice, goodbye];
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
 * Build free-talk goals for a lesson day from core-items.
 * Words → suggested_words; phrases/patterns → goals.
 */
export function loadGoalsForDay(
  day: number,
  opts?: { timeOfDay?: ConvoSceneTimeOfDay },
): ConvoGoalBank {
  const timeOfDay = opts?.timeOfDay ?? 'morning';
  const entry = getCoreItemsDay(day);
  const items = entry.core_items;

  let goals: ConvoGoal[];
  let suggested_words: string[];

  if (day === 1) {
    goals = day1Goals(items, timeOfDay);
    suggested_words = items
      .filter((i) => i.kind === 'word' || i.kind === 'verb')
      .map((i) => i.tl);
  } else {
    const built = generalDayGoals(items);
    goals = built.goals;
    suggested_words = built.suggested_words;
  }

  const { ok, issues } = validateGoals(goals);
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
    goals,
    suggested_words,
    scene: sceneForDay(day, timeOfDay),
  };
}
