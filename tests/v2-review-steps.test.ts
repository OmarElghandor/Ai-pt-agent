import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  buildPracticeWindow,
  buildReviewSession,
  buildReviewStep,
  buildSentenceTiles,
  canBuildFindImageBlock,
  grammarTimeShare,
  persistBuiltStep,
  type BankItem,
  type CoveragePlan,
} from '../lib/v2/practice';
import {
  clearMemoryPracticeQuestions,
  memoryPracticeQuestionStore,
  setPracticeQuestionStore,
} from '../lib/v2/review/questions';

const items: BankItem[] = [
  {
    id: 'food.cheese',
    type: 'word',
    tl: 'o queijo',
    ar: 'الجبن',
    day: 1,
    has_card: true,
    image_url: 'https://x/1',
  },
  {
    id: 'phrase.bom_dia',
    type: 'phrase',
    tl: 'Bom dia',
    ar: 'صباح الخير',
    day: 1,
    has_card: true,
    image_url: 'https://x/2',
  },
  {
    id: 'pattern.ser',
    type: 'pattern',
    tl: 'ser',
    ar: 'يكون',
    day: 3,
  },
  {
    id: 'phrase.estou',
    type: 'phrase',
    tl: 'Eu estou bem',
    ar: 'أنا بخير',
    day: 22,
  },
];

describe('v2 practice · step builders (16 §5.6)', () => {
  it('every pair kind in days 1, 3 and 22 gets a step', () => {
    for (const item of items) {
      for (const skill of [
        'listening',
        'writing',
        'building',
        'recognition',
        'speaking',
      ] as const) {
        if (item.type === 'word' && (skill === 'building' || skill === 'speaking')) {
          continue;
        }
        if (item.type === 'pattern' && skill === 'listening') continue;
        const step = buildReviewStep({
          item,
          skill,
          taughtItems: items,
          currentDay: 22,
        });
        assert.ok(step, `expected step for ${item.id} ${skill}`);
      }
    }
  });

  it('tiles always rebuild the exact sentence', () => {
    const sentence = 'Eu estou bem';
    const { tiles, answer } = buildSentenceTiles(sentence, ['me', 'de']);
    const rebuilt = answer.map((i) => tiles[i]).join(' ');
    assert.equal(rebuilt, sentence);
  });

  it('distractor tiles come only from known mistake pairs or taught items', () => {
    const step = buildReviewStep({
      item: items[3]!,
      skill: 'building',
      taughtItems: items,
      currentDay: 22,
      knownMistakeTiles: ['me'],
    });
    assert.ok(step);
    const tiles = (step!.payload.tiles as string[]) ?? [];
    assert.ok(tiles.includes('Eu') || tiles.includes('estou'));
    assert.ok(tiles.includes('me'));
    // Only sentence tokens + known mistake — not arbitrary junk
    for (const t of tiles) {
      assert.ok(
        ['Eu', 'estou', 'bem', 'me'].includes(t),
        `unexpected tile ${t}`,
      );
    }
  });

  it('no future-day distractors', () => {
    const future: BankItem = {
      id: 'future.word',
      type: 'word',
      tl: 'amanhã',
      ar: 'بكرة',
      day: 99,
      has_card: true,
      image_url: 'https://x/future',
    };
    const step = buildReviewStep({
      item: items[0]!,
      skill: 'listening',
      taughtItems: [...items, future],
      currentDay: 5,
    });
    assert.ok(step);
    const options = (step!.payload.options as { label?: string; id?: string }[]) ?? [];
    assert.ok(!options.some((o) => o.label === 'بكرة' || o.id === 'future.word'));
  });

  it('building the same step for two users creates one stored question', async () => {
    setPracticeQuestionStore(memoryPracticeQuestionStore);
    clearMemoryPracticeQuestions();
    const a = buildReviewStep({
      item: items[0]!,
      skill: 'writing',
      taughtItems: items,
      currentDay: 5,
    });
    const b = buildReviewStep({
      item: items[0]!,
      skill: 'writing',
      taughtItems: items,
      currentDay: 5,
    });
    assert.ok(a && b);
    const savedA = await persistBuiltStep(a!);
    const savedB = await persistBuiltStep(b!);
    assert.equal(savedA.question_id, savedB.question_id);
    assert.ok(savedA.question_id?.startsWith('pq.'));
    setPracticeQuestionStore(null);
  });

  it('لاقي الصورة only with at least 4 carded items', () => {
    assert.equal(canBuildFindImageBlock(items.slice(0, 2)), false);
    const many = Array.from({ length: 4 }, (_, i) => ({
      ...items[0]!,
      id: `w${i}`,
      image_url: `https://x/${i}`,
      has_card: true,
    }));
    assert.equal(canBuildFindImageBlock(many), true);
  });

  it('use: lesson never picked', () => {
    const step = buildReviewStep({
      item: items[0]!,
      skill: 'listening',
      taughtItems: items,
      currentDay: 5,
      crafted: [
        {
          id: 'q1',
          type: 'listen_meaning',
          tests: ['food.cheese'],
          use: 'lesson',
        },
      ],
    });
    assert.ok(step);
    assert.notEqual(step!.payload.origin, 'crafted');
  });

  afterEach(() => {
    setPracticeQuestionStore(null);
    clearMemoryPracticeQuestions();
  });
});

describe('v2 practice · review session (16 §5.3–5.8)', () => {
  it('grammar steps take at least 40% of planned time', () => {
    const window = [
      { day: 4, position: 1 as const },
      { day: 3, position: 2 as const },
      { day: 2, position: 3 as const },
    ];
    const plans: CoveragePlan[] = [4, 3, 2].map((day) => ({
      user_id: 'u1',
      lesson_day: day,
      pairs: [
        { item_id: 'pattern.ser', skill: 'recognition', status: 'open' },
        { item_id: 'pattern.ser', skill: 'building', status: 'open' },
        { item_id: 'phrase.bom_dia', skill: 'building', status: 'open' },
        { item_id: 'phrase.bom_dia', skill: 'writing', status: 'open' },
        { item_id: 'food.cheese', skill: 'listening', status: 'open' },
        { item_id: 'food.cheese', skill: 'writing', status: 'open' },
      ],
    }));
    const itemsByDay = new Map([
      [2, items],
      [3, items],
      [4, items],
    ]);
    const session = buildReviewSession({
      window,
      budgetMinutes: 14,
      plans,
      itemsByDay,
      craftedByDay: new Map(),
      taughtItems: items,
      currentDay: 5,
      olderPatterns: [items[2]!],
    });
    assert.ok(session.steps.length > 0);
    assert.ok(grammarTimeShare(session.steps) >= 0.4);
    assert.ok(session.rounds_total >= 2);
    for (let r = 1; r <= session.rounds_total; r++) {
      const roundSteps = session.steps.filter((s) => s.round === r);
      if (roundSteps.length) {
        assert.ok(
          roundSteps.some(
            (s) =>
              s.slot_reason === 'grammar' ||
              s.slot_reason === 'cumulative_grammar' ||
              s.type === 'build_sentence' ||
              s.type === 'fill_blank_choice',
          ),
          `round ${r} needs a grammar step`,
        );
      }
    }
  });

  it('budget respected within one step', () => {
    const session = buildReviewSession({
      window: [{ day: 3, position: 1 }],
      budgetMinutes: 2,
      plans: [
        {
          user_id: 'u1',
          lesson_day: 3,
          pairs: items.flatMap((i) => [
            { item_id: i.id, skill: 'listening' as const, status: 'open' as const },
            { item_id: i.id, skill: 'writing' as const, status: 'open' as const },
          ]),
        },
      ],
      itemsByDay: new Map([[3, items]]),
      craftedByDay: new Map(),
      taughtItems: items,
      currentDay: 4,
    });
    const total = session.steps.reduce((s, x) => s + x.estimated_seconds, 0);
    assert.ok(total <= 2 * 60 + 45);
  });

  it('the same question id is not picked within 3 days', () => {
    const plans: CoveragePlan[] = [
      {
        user_id: 'u1',
        lesson_day: 3,
        pairs: [
          { item_id: 'food.cheese', skill: 'writing', status: 'open' },
        ],
      },
    ];
    const first = buildReviewSession({
      window: [{ day: 3, position: 2 }],
      budgetMinutes: 5,
      plans,
      itemsByDay: new Map([[3, items]]),
      craftedByDay: new Map(),
      taughtItems: items,
      currentDay: 5,
    });
    const qid = first.steps[0]?.question_id;
    assert.ok(qid);
    const second = buildReviewSession({
      window: [{ day: 3, position: 2 }],
      budgetMinutes: 5,
      plans,
      itemsByDay: new Map([[3, items]]),
      craftedByDay: new Map(),
      taughtItems: items,
      currentDay: 5,
      recentQuestionIds: new Set([qid!]),
    });
    assert.ok(!second.steps.some((s) => s.question_id === qid));
  });

  it('a flagged question is never picked', () => {
    const craftedId = 'crafted.flagged.1';
    const session = buildReviewSession({
      window: [{ day: 3, position: 1 }],
      budgetMinutes: 5,
      plans: [
        {
          user_id: 'u1',
          lesson_day: 3,
          pairs: [
            { item_id: 'food.cheese', skill: 'listening', status: 'open' },
          ],
        },
      ],
      itemsByDay: new Map([[3, items]]),
      craftedByDay: new Map([
        [
          3,
          [
            {
              id: craftedId,
              type: 'listen_meaning',
              tests: ['food.cheese'],
              use: 'practice',
            },
          ],
        ],
      ]),
      taughtItems: items,
      currentDay: 5,
      flaggedQuestionIds: new Set([craftedId]),
    });
    assert.ok(!session.steps.some((s) => s.question_id === craftedId));
  });
});

describe('v2 practice · review empty window (16 §8)', () => {
  it('day 1 window is empty so nothing should be saved', () => {
    const window = buildPracticeWindow({
      currentDay: 1,
      completedDays: [],
    });
    assert.deepEqual(window, []);
  });
});

