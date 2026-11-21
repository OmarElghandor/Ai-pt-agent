/**
 * Coverage plans per lesson (16 §5.1).
 */

export type CoverageSkill =
  | 'listening'
  | 'writing'
  | 'speaking'
  | 'building'
  | 'recognition'
  | 'use';

export type CoveragePairStatus = 'open' | 'covered' | 'carried_to_weak';

export type CoveragePair = {
  item_id: string;
  skill: CoverageSkill;
  /** Verb form id when skill is per form. */
  form?: string;
  status: CoveragePairStatus;
};

export type CoverageItemKind =
  | 'word'
  | 'verb'
  | 'phrase'
  | 'pattern'
  | 'real_world';

export type CoverageItemInput = {
  id: string;
  kind: CoverageItemKind;
  /** Verb forms taught that day, e.g. ['preciso', 'precisa']. */
  forms?: string[];
};

export type BuildCoveragePlanInput = {
  user_id: string;
  lesson_day: number;
  items: CoverageItemInput[];
  /** Pairs already passed first-try in the lesson — removed from the plan. */
  passedInLesson?: Array<{ item_id: string; skill: CoverageSkill; form?: string }>;
};

export type CoveragePlan = {
  user_id: string;
  lesson_day: number;
  pairs: CoveragePair[];
};

export function pairsForItem(item: CoverageItemInput): CoveragePair[] {
  switch (item.kind) {
    case 'word':
      return [
        { item_id: item.id, skill: 'listening', status: 'open' },
        { item_id: item.id, skill: 'writing', status: 'open' },
      ];
    case 'verb': {
      const forms = item.forms?.length ? item.forms : ['_'];
      const out: CoveragePair[] = [];
      for (const form of forms) {
        out.push({
          item_id: item.id,
          skill: 'listening',
          form,
          status: 'open',
        });
        out.push({
          item_id: item.id,
          skill: 'writing',
          form,
          status: 'open',
        });
      }
      return out;
    }
    case 'phrase':
      return [
        { item_id: item.id, skill: 'listening', status: 'open' },
        { item_id: item.id, skill: 'building', status: 'open' },
        { item_id: item.id, skill: 'writing', status: 'open' },
        { item_id: item.id, skill: 'speaking', status: 'open' },
      ];
    case 'pattern':
      return [
        { item_id: item.id, skill: 'recognition', status: 'open' },
        { item_id: item.id, skill: 'building', status: 'open' },
        { item_id: item.id, skill: 'writing', status: 'open' },
        { item_id: item.id, skill: 'use', status: 'open' },
      ];
    case 'real_world':
      return [{ item_id: item.id, skill: 'listening', status: 'open' }];
    default:
      return [];
  }
}

function pairKey(p: {
  item_id: string;
  skill: CoverageSkill;
  form?: string;
}): string {
  return `${p.item_id}|${p.skill}|${p.form ?? ''}`;
}

export function buildCoveragePlan(input: BuildCoveragePlanInput): CoveragePlan {
  const pairs: CoveragePair[] = [];
  for (const item of input.items) {
    pairs.push(...pairsForItem(item));
  }
  const passed = new Set(
    (input.passedInLesson ?? []).map((p) => pairKey(p)),
  );
  return {
    user_id: input.user_id,
    lesson_day: input.lesson_day,
    pairs: pairs.filter((p) => !passed.has(pairKey(p))),
  };
}

export type CoverResultOpts = {
  plan: CoveragePlan;
  /** Question type that was answered correctly. */
  questionType: string;
  item_id: string;
  /** Core word ids covered by a full-sentence production. */
  coreWordIds?: string[];
  /** Pattern id whose "use" check is covered by full-sentence production. */
  patternId?: string;
  /** Self-rated speaking (covers plan pair only, not SRS — caller handles SRS). */
  selfRatedSpeaking?: boolean;
};

/**
 * Mark pairs covered by a correct answer. Returns updated plan.
 * - dictation on a phrase → listening + writing
 * - full-sentence production → writing of core words + pattern use
 * - self-rated speaking → the speaking pair only
 */
export function applyCoverageResult(opts: CoverResultOpts): CoveragePlan {
  const pairs = opts.plan.pairs.map((p) => ({ ...p }));
  const mark = (item_id: string, skill: CoverageSkill, form?: string) => {
    for (const p of pairs) {
      if (
        p.item_id === item_id &&
        p.skill === skill &&
        (form === undefined || p.form === form) &&
        p.status === 'open'
      ) {
        p.status = 'covered';
      }
    }
  };

  const t = opts.questionType;
  if (t === 'dictation') {
    mark(opts.item_id, 'listening');
    mark(opts.item_id, 'writing');
  } else if (
    t === 'translate_write' ||
    t === 'fill_blank_write' ||
    t === 'reply_write'
  ) {
    mark(opts.item_id, 'writing');
    if (opts.coreWordIds) {
      for (const id of opts.coreWordIds) mark(id, 'writing');
    }
    if (opts.patternId) mark(opts.patternId, 'use');
  } else if (t === 'build_sentence') {
    mark(opts.item_id, 'building');
  } else if (t === 'say_it' || t === 'reply_speak') {
    mark(opts.item_id, 'speaking');
    if (opts.patternId) mark(opts.patternId, 'use');
  } else if (t === 'fill_blank_choice') {
    mark(opts.item_id, 'recognition');
  } else if (t.startsWith('listen_')) {
    mark(opts.item_id, 'listening');
  }

  return { ...opts.plan, pairs };
}

/** On window exit: open pairs → carried_to_weak. */
export function closeCoveragePlan(plan: CoveragePlan): CoveragePlan {
  return {
    ...plan,
    pairs: plan.pairs.map((p) =>
      p.status === 'open' ? { ...p, status: 'carried_to_weak' as const } : p,
    ),
  };
}

export function openPairs(plan: CoveragePlan): CoveragePair[] {
  return plan.pairs.filter((p) => p.status === 'open');
}
