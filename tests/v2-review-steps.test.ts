import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  buildPracticeWindow,
  buildReviewSession,
  buildReviewStep,
  buildSentenceTiles,
  canBuildFindImageBlock,
  buildReviewStepVariants,
  pairsForItem,
  familyKey,
  normLabel,
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
              s.type === 'fill_blank_choice' ||
              // a grammar pair (pattern / building / use) in any form
              s.skill === 'building' ||
              s.skill === 'recognition' ||
              s.skill === 'use',
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


describe('v2 practice · chat-ready steps (review fix 2026-11-24)', () => {
  const bank: BankItem[] = [
    { id: 'p.ola', type: 'phrase', tl: 'Olá!', ar: 'مرحباً', day: 1 },
    { id: 'p.boa_tarde', type: 'phrase', tl: 'Boa tarde!', ar: 'مساء الخير', day: 1 },
    { id: 'p.boa_noite', type: 'phrase', tl: 'Boa noite!', ar: 'تصبح على خير', day: 1 },
    { id: 'p.prazer', type: 'phrase', tl: 'Muito prazer!', ar: 'تشرفنا', day: 1 },
    { id: 'p.chamo', type: 'phrase', tl: 'Como se chama?', ar: 'ما اسمك؟', day: 2 },
    { id: 'p.estou', type: 'phrase', tl: 'Eu estou bem hoje', ar: 'أنا بخير النهارده', day: 2 },
    { id: 'pattern.chamo', type: 'pattern', day: 2, examples: ['pattern.chamo.ex.1'] },
    {
      id: 'pattern.chamo.ex.1',
      type: 'phrase',
      tl: 'Chamo-me Omar.',
      ar: 'اسمي عمر',
      day: 2,
      derived: true,
    },
  ];

  it('every code step carries a chat skill and an instruction', () => {
    for (const item of bank.filter((i) => !i.derived)) {
      for (const skill of ['listening', 'writing', 'building', 'recognition', 'speaking', 'use'] as const) {
        const step = buildReviewStep({ item, skill, taughtItems: bank, currentDay: 3 });
        if (!step) continue;
        const p = step.payload;
        assert.ok(
          ['listening', 'reading', 'writing', 'speaking', 'grammar'].includes(String(p.skill)),
          `skill for ${item.id} ${skill}`,
        );
        assert.ok(
          p.prompt_eg || p.prompt_tl || p.situation_eg,
          `instruction for ${item.id} ${skill}`,
        );
      }
    }
  });

  it('choice options are labelled, distinct, and the answer index points at the target', () => {
    const step = buildReviewStep({ item: bank[1]!, skill: 'listening', taughtItems: bank, currentDay: 3 });
    assert.ok(step);
    const opts = step!.payload.options as { label: string; ar?: string }[];
    assert.equal(opts.length, 3);
    assert.ok(opts.every((o) => o.label && o.ar));
    assert.equal(new Set(opts.map((o) => o.label)).size, 3);
    assert.equal(opts[step!.payload.answer as number]!.label, 'مساء الخير');
  });

  it('answer index is not always 0', () => {
    const answers = new Set(
      bank
        .filter((i) => i.type === 'phrase' && !i.derived)
        .map(
          (item) =>
            buildReviewStep({ item, skill: 'listening', taughtItems: bank, currentDay: 3 })!.payload
              .answer,
        ),
    );
    assert.ok(answers.size > 1);
  });

  it('a 1–2 word phrase is never a tile question; it becomes reading (translation)', () => {
    const step = buildReviewStep({ item: bank[1]!, skill: 'building', taughtItems: bank, currentDay: 3 });
    assert.ok(step);
    assert.equal(step!.type, 'pick_meaning');
    assert.equal(step!.payload.skill, 'reading');
    assert.equal(step!.payload.prompt_tl, 'Boa tarde!');
  });

  it('tile questions have the Arabic meaning and shuffled tiles', () => {
    const step = buildReviewStep({ item: bank[5]!, skill: 'building', taughtItems: bank, currentDay: 3 });
    assert.ok(step);
    assert.equal(step!.type, 'build_sentence');
    assert.match(String(step!.payload.prompt_eg), /أنا بخير النهارده/);
    const tiles = step!.payload.tiles as string[];
    const answer = step!.payload.answer as number[];
    assert.equal(answer.map((i) => tiles[i]).join(' '), 'Eu estou bem hoje');
    assert.notDeepEqual(tiles.slice(0, 4), ['Eu', 'estou', 'bem', 'hoje']);
  });

  it('a pattern is tested through its example sentence', () => {
    const step = buildReviewStep({ item: bank[6]!, skill: 'recognition', taughtItems: bank, currentDay: 3 });
    assert.ok(step);
    assert.equal(step!.item_id, 'pattern.chamo');
    assert.equal(step!.payload.prompt_tl, 'Chamo-me Omar.');
  });

  it('a lesson question with rich-text prompt and options is normalised for the chat', () => {
    const step = buildReviewStep({
      item: bank[4]!,
      skill: 'recognition',
      taughtItems: bank,
      currentDay: 3,
      crafted: [
        {
          id: 'q.read',
          type: 'read_meaning',
          tests: ['p.chamo'],
          use: 'both',
          prompt: [
            { text: 'معناها إيه؟ ', lang: 'eg' },
            { text: 'Como se chama?', lang: 'tl' },
          ],
          options: [
            [{ text: 'ما اسمك؟', lang: 'ar' }],
            [{ text: 'كيف حالك؟', lang: 'ar' }],
            [{ text: 'من أين أنت؟', lang: 'ar' }],
          ],
          answer: 0,
        } as never,
      ],
    });
    assert.ok(step);
    assert.equal(step!.payload.origin, 'crafted');
    assert.equal(step!.payload.prompt_tl, 'Como se chama?');
    assert.equal(step!.payload.skill, 'reading');
    const opts = step!.payload.options as { ar?: string }[];
    assert.equal(opts[0]!.ar, 'ما اسمك؟');
  });

  it('a lesson question with an empty option falls back to a code step', () => {
    const step = buildReviewStep({
      item: bank[4]!,
      skill: 'recognition',
      taughtItems: bank,
      currentDay: 3,
      crafted: [
        {
          id: 'q.bad',
          type: 'pick_meaning',
          tests: ['p.chamo'],
          use: 'both',
          prompt: 'Como se chama?',
          options: ['ما اسمك؟', '', ''],
          answer: 0,
        } as never,
      ],
    });
    assert.ok(step);
    assert.equal(step!.payload.origin, 'code');
  });
});

describe('v2 practice · mixed order + regenerate (2026-11-24)', () => {
  const mk = (day: number, n: number): BankItem[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `d${day}.p${i}`,
      type: 'phrase',
      tl: `Frase ${day} numero ${i} aqui`,
      ar: `جملة ${day} رقم ${i}`,
      day,
    }));
  const bank = [...mk(1, 5), ...mk(2, 5), ...mk(3, 5)];
  const window = [
    { day: 3, position: 1 as const },
    { day: 2, position: 2 as const },
    { day: 1, position: 3 as const },
  ];
  const plans: CoveragePlan[] = [1, 2, 3].map((day) => ({
    user_id: 'u',
    lesson_day: day,
    pairs: bank
      .filter((i) => i.day === day)
      .flatMap((i) => [
        { item_id: i.id, skill: 'listening' as const, status: 'open' as const },
        { item_id: i.id, skill: 'writing' as const, status: 'open' as const },
      ]),
  }));
  const itemsByDay = new Map([1, 2, 3].map((d) => [d, bank.filter((i) => i.day === d)]));
  const build = (seed: string) =>
    buildReviewSession({
      window,
      budgetMinutes: 14,
      plans,
      itemsByDay,
      craftedByDay: new Map(),
      taughtItems: bank,
      currentDay: 4,
      seed,
    });

  it('a round mixes lessons instead of walking one lesson', () => {
    const { steps } = build('u:2026-11-24');
    const r1 = steps.filter((s) => s.round === 1);
    assert.ok(new Set(r1.map((s) => s.lesson_day)).size >= 2);
    let sameInARow = 0;
    for (let i = 1; i < steps.length; i++) {
      if (steps[i]!.lesson_day === steps[i - 1]!.lesson_day) sameInARow += 1;
    }
    assert.ok(sameInARow < steps.length / 2, `too many same-lesson neighbours: ${sameInARow}`);
  });

  it('the same item never sits twice in a row', () => {
    const { steps } = build('u:2026-11-24');
    for (let i = 1; i < steps.length; i++) {
      assert.notEqual(steps[i]!.item_id, steps[i - 1]!.item_id);
    }
  });

  it('same seed → same order; a new seed (regenerate) → a new mix of the same steps', () => {
    const a = build('u:2026-11-24').steps.map((s) => `${s.item_id}|${s.type}`);
    const b = build('u:2026-11-24').steps.map((s) => `${s.item_id}|${s.type}`);
    const c = build('u:2026-11-24:1732470000000').steps.map((s) => `${s.item_id}|${s.type}`);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    assert.deepEqual([...a].sort(), [...c].sort());
  });

  it('regenerate is for admins, or anyone outside production', async () => {
    const { canRegenerateReview } = await import('../lib/v2/practice/regenerate');
    assert.equal(canRegenerateReview('admin', 'production'), true);
    assert.equal(canRegenerateReview('learner', 'production'), false);
    assert.equal(canRegenerateReview('learner', 'development'), true);
  });
});

describe('v2 practice · variety and spacing (2026-11-25)', () => {
  const ph = (id: string, tl: string, ar: string, day: number, extra: Partial<BankItem> = {}): BankItem => ({
    id, type: 'phrase', tl, ar, day, ...extra,
  });
  const bank: BankItem[] = [
    ph('p.prazer', 'Muito prazer!', 'تشرفنا', 1),
    ph('p.ola', 'Olá!', 'مرحباً', 1),
    ph('p.bom_dia', 'Bom dia!', 'صباح الخير', 1),
    ph('p.boa_noite', 'Boa noite!', 'تصبح على خير', 1),
    ph('p.tudo', 'Tudo bem, obrigado.', 'كله تمام، شكراً', 2),
    ph('p.como', 'Como está?', 'إزيك؟', 2),
    ph('p.ate', 'Até já!', 'أشوفك كمان شوية', 2),
    ph('p.estou', 'Eu estou muito bem hoje', 'أنا كويس جداً النهارده', 2),
    { id: 'pattern.chamo', type: 'pattern', day: 2, examples: ['pattern.chamo.ex.1', 'pattern.chamo.ex.2', 'pattern.chamo.ex.3'] },
    ph('pattern.chamo.ex.1', 'Chamo-me Omar.', 'اسمي عمر', 2, { derived: true }),
    ph('pattern.chamo.ex.2', 'Chamo-me Rita.', 'اسمي ريتا', 2, { derived: true }),
    ph('pattern.chamo.ex.3', 'Chamo-me Inês.', 'اسمي إينيس', 2, { derived: true }),
    ph('p.onde', 'Onde fica a estação de metro?', 'فين محطة المترو؟', 3),
    ph('p.queria', 'Queria um café com leite', 'عايز قهوة بلبن', 3),
    ph('p.conta', 'A conta, se faz favor.', 'الحساب لو سمحت', 3),
    ph('p.obrigado', 'Obrigado!', 'شكراً', 3),
  ];
  const window = [
    { day: 3, position: 1 as const },
    { day: 2, position: 2 as const },
    { day: 1, position: 3 as const },
  ];
  const pairsFor = (day: number) =>
    bank
      .filter((i) => i.day === day && !i.derived)
      .flatMap((i) =>
        i.type === 'pattern'
          ? (['recognition', 'building', 'writing', 'use'] as const).map((skill) => ({ item_id: i.id, skill, status: 'open' as const }))
          : (['listening', 'building', 'writing', 'speaking'] as const).map((skill) => ({ item_id: i.id, skill, status: 'open' as const })),
      );
  const plans: CoveragePlan[] = [1, 2, 3].map((d) => ({ user_id: 'u', lesson_day: d, pairs: pairsFor(d) }));
  const session = buildReviewSession({
    window,
    budgetMinutes: 21,
    plans,
    itemsByDay: new Map([1, 2, 3].map((d) => [d, bank.filter((i) => i.day === d)])),
    craftedByDay: new Map(),
    taughtItems: bank,
    currentDay: 4,
    seed: 'u:2026-11-25',
  });
  const steps = session.steps;
  const fam = (id: string) => familyKey(id);

  it('an item (or a pattern with its examples) appears at most twice (patterns 3×)', () => {
    const counts = new Map<string, number>();
    for (const s of steps) counts.set(fam(s.item_id), (counts.get(fam(s.item_id)) ?? 0) + 1);
    for (const [f, n] of counts) assert.ok(n <= (f.startsWith('pattern.') ? 3 : 2), `${f} × ${n}`);
  });

  it('an item never gets the same form twice', () => {
    const seen = new Set<string>();
    for (const s of steps) {
      const k = `${fam(s.item_id)}|${s.type}`;
      assert.ok(!seen.has(k), `repeat form ${k}`);
      seen.add(k);
    }
  });

  it('the same item comes back only after a gap (no re-asking while it is on screen)', () => {
    for (let i = 0; i < steps.length; i++) {
      for (let j = Math.max(0, i - 5); j < i; j++) {
        if (fam(steps[j]!.item_id) === fam(steps[i]!.item_id)) {
          assert.fail(`${fam(steps[i]!.item_id)} at ${j} and ${i}`);
        }
      }
    }
  });

  it('the session uses many forms, and no form takes over', () => {
    const types = new Map<string, number>();
    for (const s of steps) types.set(s.type, (types.get(s.type) ?? 0) + 1);
    assert.ok(types.size >= 5, `forms: ${[...types.keys()].join(', ')}`);
    const max = Math.max(...types.values());
    assert.ok(max <= Math.ceil(steps.length * 0.35), `one form ${max}/${steps.length}`);
  });

  it('never the same form twice in a row when avoidable', () => {
    let same = 0;
    for (let i = 1; i < steps.length; i++) if (steps[i]!.type === steps[i - 1]!.type) same += 1;
    assert.ok(same <= 1, `same form in a row: ${same}`);
  });

  it('options never repeat the same label', () => {
    for (const s of steps) {
      const opts = s.payload.options as { label?: string }[] | undefined;
      if (!opts) continue;
      const labels = opts.map((o) => normLabel(String(o.label ?? '')));
      assert.equal(new Set(labels).size, labels.length, `${s.item_id} ${s.type}`);
    }
  });
});

describe('v2 practice · frame families + crafted dedupe (2026-11-25b)', () => {
  const ph = (id: string, tl: string, ar: string, day: number): BankItem => ({ id, type: 'phrase', tl, ar, day });
  // Separate items (not pattern examples) built on the same frame.
  const bank: BankItem[] = [
    ph('p.rita', 'Chamo-me Rita.', 'اسمي ريتا', 1),
    ph('p.omar', 'Chamo-me Omar.', 'اسمي عمر', 1),
    ph('p.ines', 'Chamo-me Inês.', 'اسمي إينيس', 2),
    ph('p.ola', 'Olá!', 'مرحباً', 1),
    ph('p.prazer', 'Muito prazer!', 'تشرفنا', 1),
    ph('p.tudo', 'Tudo bem, obrigado.', 'كله تمام، شكراً', 2),
    ph('p.ate', 'Até já!', 'أشوفك كمان شوية', 2),
    ph('p.estou', 'Eu estou muito bem hoje', 'أنا كويس جداً النهارده', 2),
    ph('p.onde', 'Onde fica a estação de metro?', 'فين محطة المترو؟', 3),
    ph('p.queria', 'Queria um café com leite', 'عايز قهوة بلبن', 3),
    ph('p.conta', 'A conta, se faz favor.', 'الحساب لو سمحت', 3),
    ph('p.obrigado', 'Obrigado!', 'شكراً', 3),
  ];
  const plans: CoveragePlan[] = [1, 2, 3].map((d) => ({
    user_id: 'u',
    lesson_day: d,
    pairs: bank
      .filter((i) => i.day === d)
      .flatMap((i) =>
        (['listening', 'building', 'writing', 'speaking'] as const).map((skill) => ({
          item_id: i.id,
          skill,
          status: 'open' as const,
        })),
      ),
  }));
  const steps = buildReviewSession({
    window: [
      { day: 3, position: 1 },
      { day: 2, position: 2 },
      { day: 1, position: 3 },
    ],
    budgetMinutes: 21,
    plans,
    itemsByDay: new Map([1, 2, 3].map((d) => [d, bank.filter((i) => i.day === d)])),
    craftedByDay: new Map(),
    taughtItems: bank,
    currentDay: 4,
    seed: 'u:frame',
  }).steps;
  const chamo = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => ['p.rita', 'p.omar', 'p.ines'].includes(s.item_id));

  it('Chamo-me Rita / Omar / Inês count as one family (at most 3 steps)', () => {
    assert.ok(chamo.length >= 1 && chamo.length <= 3, `chamo steps: ${chamo.length}`);
  });

  it('…and are spaced like one item', () => {
    for (let k = 1; k < chamo.length; k++) {
      assert.ok(chamo[k]!.i - chamo[k - 1]!.i > 5, `gap ${chamo[k]!.i - chamo[k - 1]!.i}`);
    }
  });

  it('a lesson question with two equal options is not used', () => {
    const step = buildReviewStep({
      item: bank[1]!,
      skill: 'listening',
      taughtItems: bank,
      currentDay: 4,
      crafted: [
        {
          id: 'q.dup',
          type: 'listen_meaning',
          tests: ['p.omar'],
          use: 'both',
          prompt: { audio_ref: 'p.omar' },
          options: ['اسمي مانويل', 'اسمي عمر', 'اسمي عُمر.'],
          answer: 1,
        } as never,
      ],
    });
    assert.ok(step);
    assert.equal(step!.payload.origin, 'code');
  });
});

describe('v2 practice · one picture → pick / write / say (2026-11-25c)', () => {
  const w = (id: string, tl: string, ar: string, img = true): BankItem => ({
    id, type: 'word', tl, ar, day: 1, has_card: true, image_url: img ? `https://img/${id}.png` : null,
  });
  const bank: BankItem[] = [
    w('food.coffee', 'o café', 'القهوة'),
    w('food.cheese', 'o queijo', 'الجبن'),
    w('food.bread', 'o pão', 'الخبز'),
    w('food.milk', 'o leite', 'اللبن'),
    w('food.water', 'a água', 'المياه', false),
    { id: 'p.queria', type: 'phrase', tl: 'Queria um café', ar: 'عايز قهوة', day: 1, has_card: true, image_url: 'https://img/scene.png' },
  ];
  const step = (item: BankItem, skill: 'recognition' | 'writing' | 'speaking') =>
    buildReviewStepVariants({ item, skill, taughtItems: bank, currentDay: 2 });

  it('pick: the picture alone, options in Portuguese, the answer hidden', () => {
    const s = step(bank[0]!, 'recognition')[0]!;
    assert.equal(s.type, 'image_pick_tl');
    assert.equal(s.payload.image_url, 'https://img/food.coffee.png');
    assert.equal(s.payload.skill, 'reading');
    assert.ok(!s.payload.prompt_tl, 'the word must not be shown');
    const opts = s.payload.options as { tl?: string }[];
    assert.equal(opts[s.payload.answer as number]!.tl, 'o café');
  });

  it('write: accepts the word with or without its article', () => {
    const s = step(bank[1]!, 'writing').find((v) => v.type === 'image_write')!;
    assert.ok(s);
    assert.deepEqual(s.payload.accepted, ['o queijo', 'queijo']);
    assert.equal(s.payload.skill, 'writing');
  });

  it('say: speaking from the picture', () => {
    const s = step(bank[2]!, 'speaking')[0]!;
    assert.equal(s.type, 'image_say');
    assert.equal(s.payload.skill, 'speaking');
  });

  it('no picture forms for a word without its own picture, or for a phrase (its picture is a scene)', () => {
    for (const item of [bank[4]!, bank[5]!]) {
      for (const skill of ['recognition', 'writing', 'speaking'] as const) {
        assert.ok(!step(item, skill).some((v) => v.type.startsWith('image_')), `${item.id} ${skill}`);
      }
    }
  });

  it('a word with a picture gets picture pairs in its coverage plan', () => {
    assert.deepEqual(
      pairsForItem({ id: 'food.coffee', kind: 'word', has_image: true }).map((p) => p.skill),
      ['listening', 'writing', 'recognition', 'speaking'],
    );
    assert.deepEqual(
      pairsForItem({ id: 'food.water', kind: 'word' }).map((p) => p.skill),
      ['listening', 'writing'],
    );
  });
});
