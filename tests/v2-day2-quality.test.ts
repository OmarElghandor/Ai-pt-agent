import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import type { Page } from '../lib/v2/content/page';
import { isFlashcardItem } from '../lib/v2/content/flashcards';
import {
  decideCriticRerun,
  mergeCriticMeta,
} from '../lib/v2/generation/lesson/criticFilter';
import {
  mergeBlockRegen,
  parseBlockKeyFromIssue,
  planBlockCriticRerun,
} from '../lib/v2/generation/lesson/blockCritic';
import {
  checkDialoguePage,
  fixDialoguePage,
  hydrateDialogueBlocks,
} from '../lib/v2/generation/lesson/dialogueChecks';
import { ensureHeardReplies } from '../lib/v2/generation/lesson/heardReplies';
import { reorderGuidedSteps } from '../lib/v2/generation/lesson/guidedSteps';
import {
  composePatternExample,
  fillPatternsInBank,
  stripPoliteTail,
} from '../lib/v2/generation/lesson/patternFill';
import { slotsForKind } from '../lib/v2/generation/lesson/patternTemplates';
import { normalizeNounAr } from '../lib/v2/generation/lesson/normalizeAr';
import { validateQuestionShapes } from '../lib/v2/generation/lesson/questionChecks';
import {
  assembleQuestionFromDraft,
  dedupeWritingAnswers,
} from '../lib/v2/generation/lesson/jobs/runQuestions';
import { dropInvalidQuestions } from '../lib/v2/generation/lesson/jobs/runAssemble';
import { LangCheckSchema } from '../lib/v2/generation/lesson/jobs/runLangCheck';
import { applyLangCheckPatches } from '../lib/v2/generation/lesson/langCheckApply';
import { MicroDrillSchema, MicroNoticeOptionSchema } from '../lib/v2/content/lesson';
import { RtSegmentSchema } from '../lib/v2/content/rt';
import { wordCount } from '../lib/v2/generation/lesson/prompts/core';

describe('decideCriticRerun', () => {
  it('high issue gets exactly one rerun', () => {
    const a = decideCriticRerun({ highCount: 1, regenCount: 0 });
    assert.equal(a.requeue, true);
    assert.equal(a.nextRegen, 1);
    const b = decideCriticRerun({ highCount: 1, regenCount: 1 });
    assert.equal(b.requeue, false);
  });

  it('deep-merges critic meta per page', () => {
    const m = mergeCriticMeta(
      { critic_notes: { '0': ['a'] }, critic_regen: { '0': 1 } },
      2,
      { notes: ['b'], regen: 1 },
    );
    assert.deepEqual(m.critic_notes['0'], ['a']);
    assert.deepEqual(m.critic_notes['2'], ['b']);
  });

  it('plans block-level rerun and merges only target blocks', () => {
    const page = {
      id: 'p1',
      preset: 'story',
      mode: 'static',
      title: [{ text: 'x', lang: 'eg' }],
      blocks: [
        { id: 'b0', type: 'heading', text: [{ text: 'keep', lang: 'eg' }] },
        {
          id: 'b1',
          type: 'dialogue',
          lines: [
            { speaker: 'learner', tl: 'bad', ar: '', ids: [] },
          ],
        },
      ],
    } as unknown as Page;
    assert.equal(
      parseBlockKeyFromIssue('blocks[1].lines[0].tl', 'x', page),
      'b1',
    );
    const plan = planBlockCriticRerun({
      pageIndex: 0,
      page,
      highs: [
        {
          severity: 'high',
          path: 'blocks[1].lines[0].tl',
          message: 'Brazilian form',
        },
      ],
    });
    assert.deepEqual(plan.targets, ['b1']);
    assert.equal(plan.meta.critic_regen['0:b1'], 1);

    const merged = mergeBlockRegen(
      page,
      {
        blocks: [
          {
            id: 'b1',
            type: 'dialogue',
            lines: [
              {
                speaker: 'learner',
                tl: 'Queria um café, por favor.',
                ar: '…',
                ids: ['phrase.order_coffee'],
              },
            ],
          } as Page['blocks'][number],
        ],
      },
      ['b1'],
    );
    assert.equal(
      (merged.blocks[0] as { text: { text: string }[] }).text[0]!.text,
      'keep',
    );
    assert.match(
      (merged.blocks[1] as { lines: { tl: string }[] }).lines[0]!.tl,
      /Queria/,
    );
  });

  it('pathless high on p3_story defaults to dialogue and bumps critic_regen', () => {
    const page = {
      id: 'p3_story',
      preset: 'story',
      mode: 'guided',
      title: [{ text: 'قصة', lang: 'eg' }],
      blocks: [
        { id: 'b0', type: 'heading', text: [{ text: 'العنوان', lang: 'eg' }] },
        {
          id: 'b1',
          type: 'dialogue',
          lines: [
            { speaker: 'learner', tl: 'Oi', ar: '…', ids: [] },
          ],
        },
      ],
    } as unknown as Page;
    const plan = planBlockCriticRerun({
      pageIndex: 3,
      page,
      highs: [
        {
          severity: 'high',
          path: 'page',
          message: 'dialogue feels unnatural for A0',
        },
      ],
    });
    assert.deepEqual(plan.targets, ['b1']);
    assert.equal(plan.meta.critic_regen['3:b1'], 1);
    assert.equal(plan.unresolvedHighs.length, 0);
  });
});

describe('normalizeNounAr', () => {
  it('adds ال and strips tashkeel except shadda', () => {
    assert.equal(normalizeNounAr('قَهْوَة'), 'القهوة');
    assert.equal(normalizeNounAr('العيش'), 'العيش');
    // shadda kept
    assert.match(normalizeNounAr('الشَّاي'), /ّ/);
    assert.ok(normalizeNounAr('الشَّاي').startsWith('ال'));
  });
});

describe('pattern templates by kind', () => {
  it('builds article_def and plural_def examples from code', () => {
    const words: Item[] = [
      {
        type: 'word',
        id: 'word.egg',
        tl: 'o ovo',
        ar: 'البيضة',
        gender: 'm',
        plural_tl: 'ovos',
      },
      {
        type: 'word',
        id: 'word.apple',
        tl: 'a maçã',
        ar: 'التفاحة',
        gender: 'f',
        plural_tl: 'maçãs',
      },
      {
        type: 'word',
        id: 'word.bag',
        tl: 'o saco',
        ar: 'الكيس',
        gender: 'm',
        plural_tl: 'sacos',
      },
    ];
    const bank = fillPatternsInBank(
      [
        ...words,
        {
          type: 'pattern',
          id: 'pattern.article_gender',
          kind: 'article_def',
          slots: slotsForKind('article_def'),
          examples: ['pattern.article_gender.ex.1'],
        } as Item,
        {
          type: 'pattern',
          id: 'pattern.plural_s',
          kind: 'plural_def',
          slots: slotsForKind('plural_def'),
          examples: ['pattern.plural_s.ex.1'],
        } as Item,
      ],
      {
        coreItems: [
          {
            id: 'pattern.plural_s',
            kind: 'pattern',
            tl: 'os/as',
            eg: 'جمع',
            pattern_kind: 'plural_def',
            fills: ['word.egg', 'word.apple', 'word.bag'],
          },
        ],
      },
    );
    const defEx = bank.find((i) => i.id === 'pattern.article_gender.ex.1');
    assert.ok(defEx && 'tl' in defEx);
    assert.match(String(defEx.tl), /^(o|a)\s+/);
    const plEx = bank.find((i) => i.id === 'pattern.plural_s.ex.1');
    assert.ok(plEx && 'tl' in plEx);
    assert.match(String(plEx.tl), /^(os|as)\s+/);
  });
});

describe('dropInvalidQuestions', () => {
  it('drops MCQs with empty options', () => {
    const qs = [
      {
        id: 'q1',
        type: 'read_meaning',
        skill: 'reading',
        tests: ['word.egg'],
        prompt: [{ text: 'x', lang: 'eg' }],
        options: [],
        answer: 0,
      },
      {
        id: 'q2',
        type: 'read_meaning',
        skill: 'reading',
        tests: ['word.egg'],
        prompt: [
          { text: 'معناها؟ ', lang: 'eg' },
          { text: 'o ovo', lang: 'tl' },
        ],
        options: [
          [{ text: 'البيضة', lang: 'ar' }],
          [{ text: 'التفاحة', lang: 'ar' }],
        ],
        answer: 0,
      },
    ];
    const issues = validateQuestionShapes(
      qs as unknown as Array<Record<string, unknown>>,
      [
        {
          type: 'word',
          id: 'word.egg',
          tl: 'o ovo',
          ar: 'البيضة',
          gender: 'm',
        },
      ],
    );
    const dropped = dropInvalidQuestions(qs as never, issues);
    assert.equal(dropped.questions.length, 1);
    assert.equal(dropped.questions[0]!.id, 'q2');
  });
});

describe('pattern fills + derived', () => {
  const words: Item[] = [
    {
      type: 'word',
      id: 'word.coffee',
      tl: 'o café',
      ar: 'القهوة',
      gender: 'm',
    },
    {
      type: 'word',
      id: 'word.water',
      tl: 'a água',
      ar: 'الماء',
      gender: 'f',
    },
    {
      type: 'word',
      id: 'word.tea',
      tl: 'o chá',
      ar: 'الشاي',
      gender: 'm',
    },
  ];

  it('uses core fills when present and marks derived', () => {
    const bank: Item[] = [
      ...words,
      {
        type: 'pattern',
        id: 'pattern.queria_um_uma',
        slots: [
          { tl: 'Queria' },
          { name_eg: 'أداة', kind: 'article_um_uma' },
          { name_eg: 'الحاجة', kind: 'word' },
          { tl: ', por favor.' },
        ],
        examples: ['x'],
      } as Item,
    ];
    const out = fillPatternsInBank(bank, {
      coreItems: [
        {
          id: 'pattern.queria_um_uma',
          kind: 'pattern',
          tl: '…',
          eg: '…',
          fills: ['word.coffee', 'word.water', 'word.tea'],
        },
      ],
    });
    const derived = out.filter(
      (i) => i.type === 'phrase' && (i as { derived?: boolean }).derived,
    );
    assert.ok(derived.length >= 3);
    assert.ok(derived.every((d) => !(d as { extra?: boolean }).extra));
    assert.ok(
      derived.some((d) =>
        'tl' in d && /por favor/i.test(String(d.tl)),
      ),
    );
    assert.ok(
      derived.every((d) => !isFlashcardItem(d)),
    );
    assert.equal(stripPoliteTail('Queria um café, por favor.'), 'Queria um café');
  });

  it('água: strips ال + polite ar tail', () => {
    const slots = [
      { tl: 'Queria' },
      { name_eg: 'أداة', kind: 'article_um_uma' as const },
      { name_eg: 'الحاجة', kind: 'word' as const },
      { tl: ', por favor.' },
    ];
    const { tl, ar } = composePatternExample(slots, {
      type: 'word',
      id: 'word.water',
      tl: 'a água',
      ar: 'الماء',
      gender: 'f',
    });
    assert.equal(tl, 'Queria uma água, por favor.');
    assert.equal(ar, 'أريد ماء، من فضلك');
  });
});

describe('heard → said replies', () => {
  it('injects yes_please when heard has no reply', () => {
    const bank: Item[] = [
      {
        type: 'phrase',
        id: 'phrase.with_milk',
        tl: 'Com leite?',
        ar: 'بحليب؟',
        context_eg: 'الباريستا',
        cloze: 'leite',
        role: 'heard',
      },
    ];
    const { items, injected } = ensureHeardReplies(bank, { maxExtras: 2 });
    assert.ok(injected.includes('phrase.yes_please'));
    const reply = items.find((i) => i.id === 'phrase.yes_please') as {
      role?: string;
      replies_to?: string;
      extra?: boolean;
    };
    assert.equal(reply.role, 'said');
    assert.equal(reply.replies_to, 'phrase.with_milk');
    assert.equal(reply.extra, true);
  });
});

describe('dialogue checks', () => {
  const items: Item[] = [
    {
      type: 'phrase',
      id: 'phrase.order_coffee',
      tl: 'Queria um café, por favor.',
      ar: 'أريد قهوة.',
      context_eg: 'عند الكاونتر',
      cloze: 'Queria',
      role: 'said',
    },
    {
      type: 'phrase',
      id: 'phrase.with_milk',
      tl: 'Com leite?',
      ar: 'بحليب؟',
      context_eg: 'الباريستا',
      cloze: 'leite',
      role: 'heard',
    },
  ];

  it('flags heard phrase on learner line', () => {
    const page = {
      id: 'p1',
      preset: 'story',
      mode: 'guided',
      title: [{ text: 'x', lang: 'eg' }],
      blocks: [
        {
          id: 'b1',
          type: 'dialogue',
          lines: [
            {
              speaker: 'learner',
              tl: 'Com leite?',
              ar: '…',
              ids: ['phrase.with_milk'],
            },
          ],
        },
      ],
      steps: [],
    } as unknown as Page;
    const issues = checkDialoguePage({
      page,
      items,
      maxWords: 7,
      day: 2,
      chatCharacter: 'manuel',
    });
    assert.ok(issues.some((i) => /heard phrase/.test(i.message)));
  });

  it('hydrates tl/ar from ids', () => {
    const page = {
      id: 'p1',
      preset: 'story',
      mode: 'static',
      title: [{ text: 'x', lang: 'eg' }],
      blocks: [
        {
          id: 'b1',
          type: 'dialogue',
          lines: [
            {
              speaker: 'learner',
              tl: '',
              ar: '',
              ids: ['phrase.order_coffee'],
            },
          ],
        },
      ],
    } as unknown as Page;
    const h = hydrateDialogueBlocks(page, items);
    const line = (h.blocks[0] as { lines: { tl: string }[] }).lines[0]!;
    assert.match(line.tl, /Queria/);
  });

  it('fixDialoguePage swaps heard learner line for said reply', () => {
    const bank: Item[] = [
      ...items,
      {
        type: 'phrase',
        id: 'phrase.yes_please',
        tl: 'Sim, por favor.',
        ar: 'نعم، من فضلك.',
        context_eg: 'رد',
        cloze: 'Sim',
        role: 'said',
        replies_to: 'phrase.with_milk',
      },
    ];
    const page = {
      id: 'p1',
      preset: 'story',
      mode: 'static',
      title: [{ text: 'x', lang: 'eg' }],
      blocks: [
        {
          id: 'b1',
          type: 'dialogue',
          lines: [
            {
              speaker: 'manuel',
              tl: 'Com leite?',
              ar: '…',
              ids: ['phrase.with_milk'],
            },
            {
              speaker: 'learner',
              tl: 'Com leite?',
              ar: '…',
              ids: ['phrase.with_milk'],
            },
          ],
        },
      ],
    } as unknown as Page;
    const { page: fixed, fixes } = fixDialoguePage(page, bank);
    assert.ok(fixes.some((f) => /replaced heard/.test(f)));
    const learner = (
      fixed.blocks[0] as { lines: { ids: string[]; tl: string }[] }
    ).lines[1]!;
    assert.deepEqual(learner.ids, ['phrase.yes_please']);
    assert.match(learner.tl, /Sim/);
    const leftover = checkDialoguePage({
      page: fixed,
      items: bank,
      maxWords: 7,
      day: 2,
      chatCharacter: 'manuel',
    });
    assert.ok(!leftover.some((i) => /heard phrase/.test(i.message)));
  });
});

describe('questions direction + writing', () => {
  const bank: Item[] = [
    {
      type: 'phrase',
      id: 'phrase.order_coffee',
      tl: 'Queria um café, por favor.',
      ar: 'أريد قهوة من فضلك.',
      context_eg: 'طلب',
      cloze: 'Queria',
    },
    {
      type: 'phrase',
      id: 'phrase.thats_all',
      tl: 'Só isto, obrigado.',
      ar: 'هذا كل شيء.',
      context_eg: 'خلاص',
      cloze: 'Só',
    },
  ];

  it('type-owned: listen/read_meaning/recall_tl + writing', () => {
    const listen = assembleQuestionFromDraft(
      {
        type: 'listen',
        tests: 'phrase.order_coffee',
        prompt: 'إيه اللي سمعته؟',
      },
      { pageIndex: 0, pageId: 'p1', index: 0, bank },
    );
    assert.ok(listen.question);
    assert.equal(listen.question!.type, 'listen');
    assert.equal(listen.question!.skill, 'listening');
    assert.ok(
      listen.question!.prompt &&
        typeof listen.question!.prompt === 'object' &&
        'audio_ref' in (listen.question!.prompt as object),
    );
    assert.match(JSON.stringify(listen.question!.options), /أريد|قهوة|هذا/);

    const reading = assembleQuestionFromDraft(
      {
        type: 'read_meaning',
        tests: 'phrase.order_coffee',
        prompt: 'معناها إيه؟',
      },
      { pageIndex: 0, pageId: 'p1', index: 1, bank },
    );
    assert.ok(reading.question);
    assert.equal(reading.question!.type, 'read_meaning');
    assert.match(JSON.stringify(reading.question!.prompt), /Queria um café/);
    assert.match(JSON.stringify(reading.question!.options), /أريد|قهوة|هذا/);

    const recall = assembleQuestionFromDraft(
      {
        type: 'recall_tl',
        tests: 'phrase.order_coffee',
        prompt: 'بالبرتغالي؟',
      },
      { pageIndex: 0, pageId: 'p1', index: 2, bank },
    );
    assert.ok(recall.question);
    assert.equal(recall.question!.type, 'recall_tl');
    assert.match(JSON.stringify(recall.question!.prompt), /أريد قهوة/);
    assert.match(JSON.stringify(recall.question!.options), /Queria|Só|café/);

    const writing = assembleQuestionFromDraft(
      {
        type: 'writing',
        tests: 'phrase.order_coffee',
        prompt: 'اكتب الطلب',
        answer_tl: 'Queria um café, por favor.',
      },
      { pageIndex: 0, pageId: 'p1', index: 3, bank },
    );
    assert.ok(writing.question?.accepted?.includes('Queria um café'));
  });

  it('rejects writing prompt that leaks say', () => {
    const bad = assembleQuestionFromDraft(
      {
        type: 'writing',
        tests: 'phrase.order_coffee',
        prompt: 'اكتب: كْرِيا أوم كَفيه',
        answer_tl: 'Queria um café',
      },
      { pageIndex: 0, pageId: 'p1', index: 0, bank },
    );
    if (!bad.question) {
      assert.ok(bad.warnings.some((w) => w.rule === 'writing_say_leak'));
    }
  });

  it('dedupes duplicate answer_tl', () => {
    const qs = [
      {
        id: 'q1',
        type: 'w',
        skill: 'writing' as const,
        accepted: ['Queria um café'],
      },
      {
        id: 'q2',
        type: 'w',
        skill: 'writing' as const,
        accepted: ['Queria um café'],
      },
    ];
    const d = dedupeWritingAnswers(qs);
    assert.equal(d.questions.length, 1);
  });

  it('validateQuestionShapes flags missing stimulus', () => {
    const issues = validateQuestionShapes(
      [
        {
          type: 'read_meaning',
          skill: 'reading',
          tests: ['phrase.order_coffee'],
          prompt: [{ text: 'معناها إيه؟', lang: 'eg' }],
          options: [
            [{ text: 'أريد قهوة من فضلك.', lang: 'ar' }],
            [{ text: 'هذا كل شيء.', lang: 'ar' }],
          ],
          answer: 0,
        },
      ],
      bank,
    );
    assert.ok(issues.some((i) => i.rule === 'question_stimulus'));
  });
});

describe('wrong strike + lang_check schema', () => {
  it('rt segment accepts wrong:true', () => {
    const ok = RtSegmentSchema.safeParse({
      text: 'quero',
      lang: 'tl',
      wrong: true,
    });
    assert.equal(ok.success, true);
  });

  it('lang_check schema parses empty and patches', () => {
    assert.equal(LangCheckSchema.safeParse({ patches: [] }).success, true);
    assert.equal(
      LangCheckSchema.safeParse({
        patches: [
          {
            path: 'items[pattern.x.ex.1].tl',
            wrong_tl: 'Quero um café',
            fixed_tl: 'Queria um café, por favor.',
            reason_eg: 'عايزين Queria مش Quero',
          },
        ],
      }).success,
      true,
    );
    assert.equal(
      LangCheckSchema.safeParse({
        patches: Array.from({ length: 6 }, (_, i) => ({
          path: `items[x${i}].tl`,
          wrong_tl: 'a',
          fixed_tl: 'b',
          reason_eg: 'x',
        })),
      }).success,
      false,
    );
  });

  it('applyLangCheckPatches matches wrong_tl and discards stale', () => {
    const pages = [
      {
        id: 'p0',
        preset: 'story',
        mode: 'static',
        title: [{ text: 'x', lang: 'eg' }],
        blocks: [
          {
            id: 'b0',
            type: 'dialogue',
            lines: [
              {
                speaker: 'learner',
                tl: 'Quero um café',
                ar: 'عايز قهوة',
                ids: ['phrase.order_coffee'],
              },
            ],
          },
        ],
      },
    ] as unknown as Page[];
    const items: Item[] = [
      {
        type: 'phrase',
        id: 'pattern.queria_um_uma.ex.1',
        tl: 'Quero uma água',
        ar: 'عايز مية',
        context_eg: 'مثال',
        cloze: 'Quero',
        derived: true,
      },
    ];
    const ok = applyLangCheckPatches(
      pages,
      items,
      [
        {
          path: 'pages[0].blocks[0].lines[0].tl',
          wrong_tl: 'Quero um café',
          fixed_tl: 'Queria um café, por favor.',
          fixed_ar: 'أريد قهوة، من فضلك.',
          reason_eg: 'Queria',
        },
        {
          path: 'items[pattern.queria_um_uma.ex.1].tl',
          wrong_tl: 'Quero uma água',
          fixed_tl: 'Queria uma água, por favor.',
          fixed_ar: 'أريد ماء، من فضلك',
          reason_eg: 'Queria',
        },
        {
          path: 'items[pattern.queria_um_uma.ex.1].tl',
          wrong_tl: 'stale',
          fixed_tl: 'nope',
          reason_eg: 'stale',
        },
      ],
      { max: 5 },
    );
    assert.equal(ok.applied.length, 2);
    assert.equal(ok.discarded.length, 1);
    assert.equal(ok.discarded[0]!.rule, 'lang_check_stale');
    const line = (
      ok.pages[0]!.blocks[0] as { lines: { tl: string }[] }
    ).lines[0]!;
    assert.match(line.tl, /Queria/);
    const derived = ok.items.find(
      (i) => i.id === 'pattern.queria_um_uma.ex.1',
    ) as { tl: string; say?: string };
    assert.match(derived.tl, /Queria/);
    assert.ok(derived.say && derived.say.length > 0);
  });
});

describe('guided reorder', () => {
  it('moves mid-page recap to last step', () => {
    const page = {
      id: 'p1',
      preset: 'pattern',
      mode: 'guided',
      title: [{ text: 'x', lang: 'eg' }],
      blocks: [
        { id: 'b1', type: 'heading', text: [{ text: 'a', lang: 'eg' }] },
        {
          id: 'b2',
          type: 'formula',
          pattern: 'pattern.x',
          examples: ['a'],
        },
      ],
      steps: [
        {
          kind: 'reveal',
          target: 'b1',
          tip: [{ text: '1', lang: 'eg' }],
        },
        {
          kind: 'reveal',
          target: 'b2',
          tip: [{ text: '2', lang: 'eg' }],
        },
        {
          kind: 'reveal',
          target: 'b1',
          tip: [{ text: 'راجع', lang: 'eg' }],
        },
        {
          kind: 'ask',
          target: 'b2',
          ask: {
            question: [{ text: '؟', lang: 'eg' }],
            options: [
              { label: [{ text: 'أ', lang: 'eg' }], correct: true },
              { label: [{ text: 'ب', lang: 'eg' }], correct: false },
            ],
          },
        },
      ],
    } as unknown as Page;
    const { page: next, warnings } = reorderGuidedSteps(page);
    assert.ok(warnings.length);
    assert.equal(next.steps!.at(-1)!.target, 'b1');
  });
});

describe('micro schema + mission length', () => {
  it('pins drill options to {text,correct}', () => {
    const ok = MicroDrillSchema.safeParse({
      prompt: '؟',
      options: [
        { text: 'أ', correct: true },
        { text: 'ب', correct: false },
      ],
    });
    assert.equal(ok.success, true);
    assert.deepEqual(MicroNoticeOptionSchema.shape, MicroDrillSchema.shape.options.element.shape);
  });

  it('mission_eg word count helper', () => {
    assert.ok(wordCount('one two three') === 3);
    assert.ok(wordCount('a '.repeat(26).trim()) === 26);
  });
});
