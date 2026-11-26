import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import type { Question } from '../lib/v2/content/lesson';
import {
  applyCorePluralTl,
  injectPatternFillWords,
} from '../lib/v2/generation/lesson/patternBankHydrate';
import {
  assembleSlotQuestion,
  hydratePatternBankForQuestions,
} from '../lib/v2/generation/lesson/jobs/runQuestions';
import { fillPatternsInBank } from '../lib/v2/generation/lesson/patternFill';
import {
  resolvePatternKind,
  slotsForKind,
  type PatternKind,
} from '../lib/v2/generation/lesson/patternTemplates';
import type { LessonBrief } from '../lib/v2/generation/lesson/brief';
import {
  imageFallbackType,
  promptHasVariantContext,
  arabicOptionsAreNearDupes,
} from '../lib/v2/generation/lesson/questionTypes';
import {
  planQuestionSlots,
  resolveGrammarTestsId,
  slotTargetFor,
  validateDayQuestionQuotas,
  validatePlannedGrammarCoverage,
} from '../lib/v2/generation/lesson/questionSlots';
import type { OutlineResult } from '../lib/v2/generation/lesson/stages/types';
import { fillSectionsCheck } from '../lib/v2/generation/lesson/stages/assemble';
import {
  findCoreItemById,
  loadCoreItemsFile,
  type CoreItem,
} from '../lib/v2/generation/lesson/coreItems';
import { loadPlan } from '../lib/v2/generation/lesson/plan';
import { resolveGrammarFocusPatternIds } from '../lib/v2/generation/lesson/grammarFocus';

const day1Items: Item[] = [
  {
    type: 'phrase',
    id: 'phrase.hello',
    tl: 'Olá!',
    ar: 'أهلاً',
    context_eg: 'تحية',
    cloze: 'Olá',
  },
  {
    type: 'phrase',
    id: 'phrase.good_morning',
    tl: 'Bom dia!',
    ar: 'صباح الخير',
    context_eg: 'صباح',
    cloze: 'Bom',
    variant_group: 'greeting.time_of_day',
  },
  {
    type: 'phrase',
    id: 'phrase.good_afternoon',
    tl: 'Boa tarde!',
    ar: 'مساء الخير',
    context_eg: 'بعد الضهر',
    cloze: 'Boa',
    variant_group: 'greeting.time_of_day',
  },
  {
    type: 'phrase',
    id: 'phrase.good_night',
    tl: 'Boa noite!',
    ar: 'تصبح على خير',
    context_eg: 'ليل',
    cloze: 'noite',
    variant_group: 'greeting.time_of_day',
  },
  {
    type: 'phrase',
    id: 'phrase.my_name_is',
    tl: 'Chamo-me Omar.',
    ar: 'اسمي عمر',
    context_eg: 'تعريف',
    cloze: 'Chamo-me',
  },
  {
    type: 'phrase',
    id: 'phrase.whats_your_name',
    tl: 'Como se chama?',
    ar: 'اسمك إيه',
    context_eg: 'سؤال',
    cloze: 'chama',
  },
  {
    type: 'phrase',
    id: 'phrase.nice_to_meet',
    tl: 'Muito prazer!',
    ar: 'اتشرفنا',
    context_eg: 'تعارف',
    cloze: 'prazer',
    role: 'heard',
  },
  {
    type: 'phrase',
    id: 'phrase.likewise',
    tl: 'Igualmente.',
    ar: 'وأنا كمان',
    context_eg: 'رد',
    cloze: 'Igualmente',
    role: 'said',
    replies_to: 'phrase.nice_to_meet',
  },
  {
    type: 'phrase',
    id: 'phrase.how_are_you',
    tl: 'Como está?',
    ar: 'كيف حالك؟',
    context_eg: 'سؤال',
    cloze: 'Como',
  },
  {
    type: 'phrase',
    id: 'phrase.im_fine',
    tl: 'Estou bem.',
    ar: 'بخير',
    context_eg: 'رد',
    cloze: 'Estou',
  },
  {
    type: 'phrase',
    id: 'phrase.goodbye',
    tl: 'Adeus.',
    ar: 'وداعاً',
    context_eg: 'وداع',
    cloze: 'Adeus',
  },
  {
    type: 'phrase',
    id: 'phrase.see_you',
    tl: 'Até logo.',
    ar: 'إلى اللقاء',
    context_eg: 'وداع',
    cloze: 'Até',
  },
  {
    type: 'pattern',
    id: 'pattern.chamo_me',
    tl: 'Chamo-me + اسم',
    ar: 'الضمير بعد الفعل',
    examples: [
      'pattern.chamo_me.ex.1',
      'pattern.chamo_me.ex.2',
      'pattern.chamo_me.ex.3',
    ],
  },
  {
    type: 'phrase',
    id: 'pattern.chamo_me.ex.1',
    tl: 'Chamo-me Omar.',
    ar: 'اسمي عمر',
    context_eg: 'مثال',
    cloze: 'Chamo-me',
  },
  {
    type: 'phrase',
    id: 'pattern.chamo_me.ex.2',
    tl: 'Chamo-me Rita.',
    ar: 'اسمي ريتا',
    context_eg: 'مثال',
    cloze: 'Chamo-me',
  },
  {
    type: 'phrase',
    id: 'pattern.chamo_me.ex.3',
    tl: 'Chamo-me Inês.',
    ar: 'اسمي إينيس',
    context_eg: 'مثال',
    cloze: 'Chamo-me',
  },
];

const outline: OutlineResult = {
  items: day1Items,
  pages: [
    {
      index: 0,
      page_id: 'p0',
      preset: 'story',
      mode: 'static',
      role: 'intro',
      title: 'قصة',
      purpose: 'intro',
      introduces: [],
      assumes: [],
      handoff: '',
    },
    {
      index: 1,
      page_id: 'p1',
      preset: 'phrases',
      mode: 'static',
      title: 'تحيات',
      purpose: 'phrases',
      introduces: day1Items.filter((i) => i.type === 'phrase' && !i.id.includes('.ex.')).map((i) => i.id),
      assumes: [],
      handoff: '',
    },
    {
      index: 2,
      page_id: 'p2',
      preset: 'pattern',
      mode: 'sections',
      title: 'Chamo-me',
      purpose: 'pattern',
      introduces: ['pattern.chamo_me'],
      assumes: ['phrase.my_name_is'],
      handoff: '',
    },
  ],
};

const day1CoreCount = day1Items.filter(
  (i) => !i.id.includes('.ex.'),
).length;
const day1SlotTarget = slotTargetFor(day1CoreCount);

describe('day question set planner', () => {
  it('plans clamp(core) slots with skill quotas and Chamo-me build_sentence', () => {
    const { slots, warnings } = planQuestionSlots({
      outline,
      items: day1Items,
      preferBuildSentenceFor: ['pattern.chamo_me'],
    });
    assert.equal(slots.length, day1SlotTarget, `got ${slots.length}`);
    const bySkill = {
      listening: slots.filter((s) => s.skill === 'listening').length,
      writing: slots.filter((s) => s.skill === 'writing').length,
      speaking: slots.filter((s) => s.skill === 'speaking').length,
      grammar: slots.filter((s) => s.skill === 'grammar').length,
    };
    // Grammar is hard; L/W/S spread is best-effort on a small fixture.
    assert.ok(bySkill.listening >= 1, `L=${bySkill.listening}`);
    assert.ok(bySkill.writing >= 1, `W=${bySkill.writing}`);
    assert.ok(bySkill.speaking >= 1, `S=${bySkill.speaking}`);
    assert.ok(bySkill.grammar >= 2, `G=${bySkill.grammar}`);
    assert.ok(
      !warnings.some((w) => w.startsWith('grammar_coverage_shortfall')),
      warnings.join('; '),
    );
    const planFatals = validatePlannedGrammarCoverage(slots, [
      'pattern.chamo_me',
    ]);
    assert.equal(planFatals.length, 0, planFatals.join('; '));
    assert.ok(
      slots.some(
        (s) =>
          s.type === 'build_sentence' &&
          s.tests.startsWith('pattern.chamo_me.ex.'),
      ),
      'expected build_sentence for pattern.chamo_me.ex',
    );
    assert.ok(
      !slots.some(
        (s) =>
          (s.type === 'build_sentence' || s.type === 'fill_blank_choice') &&
          (s.tests === 'phrase.my_name_is' || s.tests === 'pattern.chamo_me'),
      ),
      'grammar must test .ex, not phrase.my_name_is or bare root',
    );
    const build = slots.find((s) => s.type === 'build_sentence');
    assert.ok(build);
    assert.notEqual(build!.tests, 'pattern.chamo_me.ex.1'); // not Omar/phrases copy
  });

  it('imageFallbackType maps to same-skill non-image types', () => {
    assert.equal(imageFallbackType('listen_pick_image'), 'listen_meaning');
    assert.equal(imageFallbackType('describe_image_write'), 'translate_write');
    assert.equal(imageFallbackType('describe_image_speak'), 'say_it');
    // Whole-lesson planner does not inject story-only image slots
    const { slots } = planQuestionSlots({
      outline,
      items: day1Items,
      imageReady: () => false,
    });
    assert.equal(slots.length, day1SlotTarget);
    assert.ok(
      !slots.some(
        (s) =>
          s.type === 'listen_pick_image' ||
          s.type === 'describe_image_speak' ||
          s.type === 'describe_image_write',
      ),
      'day-1 cover rotation is non-image lesson types',
    );
  });

  it('assembles build_sentence tiles with clitic split for Chamo-me', () => {
    const built = assembleSlotQuestion(
      {
        slot_id: 's0',
        type: 'build_sentence',
        skill: 'grammar',
        tests: 'pattern.chamo_me.ex.2',
        page_index: 2,
        page_id: 'p2',
        use: 'lesson',
      },
      { slot_id: 's0', prompt_eg: 'رتّب' },
      { bank: day1Items, index: 0, commonMistakeTls: ['Me', 'chamo'] },
    );
    assert.ok(built.question);
    assert.equal(built.question!.type, 'build_sentence');
    assert.equal(built.question!.skill, 'grammar');
    const tiles = (built.question as { tiles?: string[] }).tiles ?? [];
    assert.ok(tiles.includes('Chamo'), `tiles=${tiles.join('|')}`);
    assert.ok(tiles.includes('-me'), `tiles=${tiles.join('|')}`);
    assert.ok(tiles.includes('Rita'), `tiles=${tiles.join('|')}`);
    assert.ok(!tiles.some((t) => /[?!.]/.test(t)), 'no punctuation tiles');
    assert.ok(
      tiles.some((t) => t === 'Me' || t === 'chamo'),
      'expected common_mistakes distractors',
    );
    assert.ok(Array.isArray(built.question!.answer));
  });

  it('reply_speak audio_ref is the heard line (replies_to)', () => {
    const built = assembleSlotQuestion(
      {
        slot_id: 's7',
        type: 'reply_speak',
        skill: 'speaking',
        tests: 'phrase.likewise',
        page_index: 1,
        page_id: 'p1',
        use: 'both',
      },
      { slot_id: 's7', prompt_eg: 'رد' },
      { bank: day1Items, index: 7 },
    );
    assert.ok(built.question);
    const prompt = built.question!.prompt as { audio_ref?: string };
    assert.equal(prompt.audio_ref, 'phrase.nice_to_meet');
    assert.deepEqual(built.question!.tests, ['phrase.likewise']);
  });

  it('fill_blank_write hint comes from the blanked word', () => {
    const built = assembleSlotQuestion(
      {
        slot_id: 's6',
        type: 'fill_blank_write',
        skill: 'writing',
        tests: 'phrase.whats_your_name',
        page_index: 1,
        page_id: 'p1',
        use: 'both',
      },
      { slot_id: 's6', prompt_eg: 'كمّل', rubric_eg: 'model rubric must not be hint' },
      { bank: day1Items, index: 6 },
    );
    assert.ok(built.question);
    const hint = (built.question as { hint?: string }).hint ?? '';
    assert.ok(hint.includes('اسمك') || hint.includes('بتبدأ'), hint);
    assert.ok(!hint.includes('model rubric'));
  });

  it('validates phrase/pattern coverage and skill quotas', () => {
    const { slots } = planQuestionSlots({
      outline,
      items: day1Items,
      preferBuildSentenceFor: ['pattern.chamo_me'],
    });
    const questions: Question[] = [];
    for (const [i, slot] of slots.entries()) {
      const built = assembleSlotQuestion(
        slot,
        { slot_id: slot.slot_id, prompt_eg: 'السؤال' },
        { bank: day1Items, index: i },
      );
      if (built.question) questions.push(built.question);
    }
    const coreIds = day1Items
      .filter((i) => !i.id.includes('.ex.'))
      .map((i) => i.id);
    const result = validateDayQuestionQuotas(questions, coreIds, {
      items: day1Items,
      plannedCount: slots.length,
    });
    // Grammar + phrase coverage must hold; L/W/S mins can soft-miss on small banks.
    const nonSkillFatals = result.fatals.filter(
      (f) =>
        !/^(listening|writing|speaking) \d+ </.test(f),
    );
    assert.equal(nonSkillFatals.length, 0, nonSkillFatals.join('; '));
    assert.equal(questions.length, day1SlotTarget);
    assert.ok(questions.filter((q) => q.skill === 'grammar').length >= 2);
    assert.ok(
      questions.some((q) => q.type === 'build_sentence'),
      'need build_sentence',
    );
    assert.ok(
      !questions.some(
        (q) =>
          (q.type === 'build_sentence' || q.type === 'fill_blank_choice') &&
          Array.isArray(q.tests) &&
          q.tests.includes('pattern.chamo_me'),
      ),
      'assembled grammar must not test bare pattern root',
    );
  });

  it('covers day-2 core phrases before recycle despite a large word bank', () => {
    const day2CoreIds = [
      'word.coffee',
      'word.galao',
      'word.water',
      'word.milk',
      'word.tea',
      'word.pastel_de_nata',
      'word.toast',
      'word.sugar',
      'word.juice',
      'word.cake',
      'word.glass',
      'phrase.order_coffee',
      'phrase.with_milk',
      'phrase.anything_else',
      'phrase.thats_all',
      'phrase.how_much_is_it',
      'phrase.i_like_coffee',
      'phrase.youre_welcome',
      'phrase.excuse_me_pass',
      'pattern.queria_um_uma',
    ];
    const todayPhrases = [
      'phrase.order_coffee',
      'phrase.with_milk',
      'phrase.anything_else',
      'phrase.thats_all',
      'phrase.how_much_is_it',
      'phrase.i_like_coffee',
      'phrase.youre_welcome',
      'phrase.excuse_me_pass',
    ];
    // Recycle-first bank order (mirrors mergeRecycleAndVerbs).
    const day2Items: Item[] = [
      {
        type: 'phrase',
        id: 'phrase.hello',
        tl: 'Olá!',
        ar: 'أهلاً',
        context_eg: 'تحية',
        cloze: 'Olá',
      },
      {
        type: 'phrase',
        id: 'phrase.good_morning',
        tl: 'Bom dia!',
        ar: 'صباح الخير',
        context_eg: 'صباح',
        cloze: 'Bom',
      },
      {
        type: 'phrase',
        id: 'phrase.fine_thanks',
        tl: 'Tudo bem, obrigado.',
        ar: 'تمام شكرا',
        context_eg: 'رد',
        cloze: 'obrigado',
      },
      {
        type: 'word',
        id: 'word.coffee',
        tl: 'o café',
        ar: 'القهوة',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.galao',
        tl: 'o galão',
        ar: 'جالاو',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.water',
        tl: 'a água',
        ar: 'المية',
        gender: 'f',
      },
      {
        type: 'word',
        id: 'word.milk',
        tl: 'o leite',
        ar: 'اللبن',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.tea',
        tl: 'o chá',
        ar: 'الشاي',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.pastel_de_nata',
        tl: 'o pastel de nata',
        ar: 'باستيل',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.toast',
        tl: 'a torrada',
        ar: 'توست',
        gender: 'f',
      },
      {
        type: 'word',
        id: 'word.sugar',
        tl: 'o açúcar',
        ar: 'سكر',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.juice',
        tl: 'o sumo',
        ar: 'عصير',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.cake',
        tl: 'o bolo',
        ar: 'كيكة',
        gender: 'm',
      },
      {
        type: 'word',
        id: 'word.glass',
        tl: 'o copo',
        ar: 'كوباية',
        gender: 'm',
      },
      {
        type: 'phrase',
        id: 'phrase.order_coffee',
        tl: 'Queria um café, por favor.',
        ar: 'عايز قهوة',
        context_eg: 'طلب',
        cloze: 'Queria',
        role: 'said',
      },
      {
        type: 'phrase',
        id: 'phrase.with_milk',
        tl: 'Com leite?',
        ar: 'بلبن؟',
        context_eg: 'سؤال',
        cloze: 'leite',
        role: 'heard',
      },
      {
        type: 'phrase',
        id: 'phrase.anything_else',
        tl: 'Mais alguma coisa?',
        ar: 'حاجة تانية؟',
        context_eg: 'سؤال',
        cloze: 'Mais',
        role: 'heard',
      },
      {
        type: 'phrase',
        id: 'phrase.thats_all',
        tl: 'Só isto, obrigado.',
        ar: 'بس كده',
        context_eg: 'رد',
        cloze: 'Só',
        role: 'said',
      },
      {
        type: 'phrase',
        id: 'phrase.how_much_is_it',
        tl: 'Quanto é?',
        ar: 'كام؟',
        context_eg: 'حساب',
        cloze: 'Quanto',
        role: 'said',
      },
      {
        type: 'phrase',
        id: 'phrase.i_like_coffee',
        tl: 'Gosto de café.',
        ar: 'بحب القهوة',
        context_eg: 'تفضيل',
        cloze: 'Gosto',
        role: 'said',
      },
      {
        type: 'phrase',
        id: 'phrase.youre_welcome',
        tl: 'De nada.',
        ar: 'العفو',
        context_eg: 'رد',
        cloze: 'nada',
      },
      {
        type: 'phrase',
        id: 'phrase.excuse_me_pass',
        tl: 'Com licença.',
        ar: 'لو سمحت',
        context_eg: 'مرور',
        cloze: 'licença',
      },
      {
        type: 'pattern',
        id: 'pattern.queria_um_uma',
        tl: 'Queria + um/uma + حاجة, por favor.',
        ar: 'الطلب بأدب',
        examples: ['pattern.queria_um_uma.ex.1'],
      },
      {
        type: 'phrase',
        id: 'pattern.queria_um_uma.ex.1',
        tl: 'Queria um café, por favor.',
        ar: 'عايز قهوة',
        context_eg: 'مثال',
        cloze: 'Queria',
        derived: true,
      },
    ];

    const day2Outline: OutlineResult = {
      items: day2Items,
      pages: [
        {
          index: 0,
          page_id: 'p0',
          preset: 'story',
          mode: 'static',
          role: 'intro',
          title: 'قصة',
          purpose: 'intro',
          introduces: [],
          assumes: [],
          handoff: '',
        },
        {
          index: 1,
          page_id: 'p1',
          preset: 'dictionary',
          mode: 'static',
          title: 'كلمات',
          purpose: 'vocab',
          introduces: day2CoreIds.filter((id) => id.startsWith('word.')),
          assumes: [],
          handoff: '',
        },
        {
          index: 2,
          page_id: 'p2',
          preset: 'phrases',
          mode: 'static',
          title: 'جمل',
          purpose: 'phrases',
          introduces: todayPhrases,
          assumes: [],
          handoff: '',
        },
        {
          index: 3,
          page_id: 'p3',
          preset: 'pattern',
          mode: 'sections',
          title: 'Queria',
          purpose: 'pattern',
          introduces: ['pattern.queria_um_uma'],
          assumes: ['phrase.order_coffee'],
          handoff: '',
        },
      ],
    };

    const { slots } = planQuestionSlots({
      outline: day2Outline,
      items: day2Items,
      priorityIds: day2CoreIds,
    });

    const testedIds = new Set(slots.map((s) => s.tests));
    // Grammar should prefer phrase.order_coffee over derived .ex.1 (same tl).
    assert.ok(
      testedIds.has('phrase.order_coffee') ||
        testedIds.has('pattern.queria_um_uma.ex.1'),
      'order_coffee (or same-tl ex) must be tested',
    );

    for (const id of todayPhrases) {
      const covered =
        testedIds.has(id) ||
        (id === 'phrase.order_coffee' &&
          testedIds.has('pattern.queria_um_uma.ex.1'));
      assert.ok(covered, `missing today phrase ${id}; slots=${[...testedIds].join(',')}`);
    }

    // Recycle must not displace core — every core id covered after assemble+validate.
    const questions: Question[] = [];
    for (const [i, slot] of slots.entries()) {
      const built = assembleSlotQuestion(
        slot,
        { slot_id: slot.slot_id, prompt_eg: 'السؤال' },
        { bank: day2Items, index: i },
      );
      if (built.question) questions.push(built.question);
    }
    const result = validateDayQuestionQuotas(questions, day2CoreIds, {
      items: day2Items,
    });
    assert.equal(result.ok, true, result.fatals.join('; '));
    // clamp(core, 8, 15); untested words are warnings only.
    assert.equal(questions.length, slotTargetFor(day2CoreIds.length));
    assert.ok(
      (result.warnings ?? []).some((w) => w.startsWith('untested word')),
      'words without a slot should warn, not fail',
    );
  });

  it('grammar slots prefer today’s core pattern over recycle (day-33 style)', () => {
    const corePhrase = {
      type: 'phrase' as const,
      id: 'phrase.where_is_station',
      tl: 'Onde fica a estação?',
      ar: 'أين تقع المحطة؟',
      context_eg: 'في الشارع',
      cloze: 'estação',
    };
    const items: Item[] = [
      corePhrase,
      {
        type: 'phrase',
        id: 'phrase.is_it_near',
        tl: 'É perto?',
        ar: 'هل هو قريب؟',
        context_eg: 'لما تسأل',
        cloze: 'perto',
      },
      {
        type: 'phrase',
        id: 'phrase.its_far',
        tl: 'É longe.',
        ar: 'إنه بعيد.',
        context_eg: 'الرد',
        cloze: 'longe',
      },
      {
        type: 'word',
        id: 'word.station',
        tl: 'a estação',
        gender: 'f',
        ar: 'المحطة',
      },
      {
        type: 'pattern',
        id: 'pattern.onde_fica',
        slots: [
          { tl: 'Onde fica' },
          { name_eg: 'مكان', kind: 'word' },
        ],
        examples: [
          'pattern.onde_fica.ex.1',
          'pattern.onde_fica.ex.2',
        ],
      } as Item,
      {
        type: 'phrase',
        id: 'pattern.onde_fica.ex.1',
        tl: 'Onde fica a estação?',
        ar: 'أين تقع المحطة؟',
        context_eg: 'مثال',
        cloze: 'Onde',
        derived: true,
      },
      {
        type: 'phrase',
        id: 'pattern.onde_fica.ex.2',
        tl: 'Onde fica a rua?',
        ar: 'أين يقع الشارع؟',
        context_eg: 'مثال',
        cloze: 'Onde',
        derived: true,
      },
      // Recycle pattern — must not take grammar budget from today’s core.
      {
        type: 'pattern',
        id: 'pattern.contractions',
        slots: [
          { tl: 'de+o=do' },
          { name_eg: 'كلمة', kind: 'word' },
        ],
        examples: ['pattern.contractions.ex.1', 'pattern.contractions.ex.2'],
      } as Item,
      {
        type: 'phrase',
        id: 'pattern.contractions.ex.1',
        tl: 'do centro',
        ar: 'من الوسط',
        context_eg: 'مثال',
        cloze: 'do',
        derived: true,
      },
      {
        type: 'phrase',
        id: 'pattern.contractions.ex.2',
        tl: 'na estação',
        ar: 'في المحطة',
        context_eg: 'مثال',
        cloze: 'na',
        derived: true,
      },
    ];
    const priorityIds = [
      'phrase.where_is_station',
      'phrase.is_it_near',
      'phrase.its_far',
      'word.station',
      'pattern.onde_fica',
    ];
    const dayOutline: OutlineResult = {
      items,
      pages: [
        {
          index: 0,
          page_id: 'p0',
          preset: 'story',
          mode: 'static',
          role: 'intro',
          title: 'قصة',
          purpose: 'intro',
          introduces: [],
          assumes: [],
          handoff: '',
        },
        {
          index: 1,
          page_id: 'p1',
          preset: 'phrases',
          mode: 'static',
          title: 'جمل',
          purpose: 'phrases',
          introduces: [
            'phrase.where_is_station',
            'phrase.is_it_near',
            'phrase.its_far',
          ],
          assumes: [],
          handoff: '',
        },
        {
          index: 2,
          page_id: 'p2',
          preset: 'pattern',
          mode: 'sections',
          title: 'Onde fica',
          purpose: 'pattern',
          introduces: ['pattern.onde_fica'],
          assumes: [],
          handoff: '',
        },
      ],
    };

    const { slots } = planQuestionSlots({
      outline: dayOutline,
      items,
      priorityIds,
    });

    const grammar = slots.filter((s) => s.skill === 'grammar');
    const ondeGrammar = grammar.filter(
      (s) =>
        s.tests === 'pattern.onde_fica' ||
        s.tests.startsWith('pattern.onde_fica.'),
    );
    assert.ok(
      ondeGrammar.length >= 2,
      `onde_fica grammar=${ondeGrammar.length}; all=${grammar.map((s) => s.tests).join(',')}`,
    );
    assert.ok(
      !grammar.some(
        (s) =>
          s.tests === 'pattern.contractions' ||
          s.tests.startsWith('pattern.contractions.'),
      ),
      'recycle pattern.contractions must not get grammar slots',
    );

    const questions: Question[] = [];
    for (const [i, slot] of slots.entries()) {
      const built = assembleSlotQuestion(
        slot,
        { slot_id: slot.slot_id, prompt_eg: 'السؤال' },
        { bank: items, index: i },
      );
      if (built.question) questions.push(built.question);
    }
    const result = validateDayQuestionQuotas(questions, priorityIds, {
      items,
    });
    assert.equal(
      result.fatals.filter((f) => f.includes('pattern.onde_fica') && f.includes('<2'))
        .length,
      0,
      result.fatals.join('; '),
    );
  });

  it('grammar_focus maps recycle pattern into todayPatterns (day-4 style)', () => {
    // Day 4: polite.queria focus, pattern.queria_um_uma only in recycle — not core.
    const corePhraseIds = [
      'phrase.how_much_is_it',
      'phrase.i_like_coffee',
      'phrase.youre_welcome',
      'phrase.excuse_me_pass',
      'phrase.then_how_much',
      'phrase.ok_thanks',
      'phrase.order_coffee',
      'phrase.with_milk',
      'phrase.hello',
      'phrase.good_morning',
      'phrase.fine_thanks',
    ];
    const items: Item[] = [
      {
        type: 'phrase',
        id: 'phrase.how_much_is_it',
        tl: 'Quanto é?',
        ar: 'كام؟',
        context_eg: 'حساب',
        cloze: 'Quanto',
      },
      {
        type: 'phrase',
        id: 'phrase.i_like_coffee',
        tl: 'Gosto de café.',
        ar: 'بحب القهوة',
        context_eg: 'تفضيل',
        cloze: 'Gosto',
      },
      {
        type: 'phrase',
        id: 'phrase.youre_welcome',
        tl: 'De nada.',
        ar: 'العفو',
        context_eg: 'رد',
        cloze: 'nada',
      },
      {
        type: 'phrase',
        id: 'phrase.excuse_me_pass',
        tl: 'Com licença.',
        ar: 'لو سمحت',
        context_eg: 'مرور',
        cloze: 'licença',
      },
      {
        type: 'phrase',
        id: 'phrase.then_how_much',
        tl: 'Então, quanto é?',
        ar: 'طيب كام؟',
        context_eg: 'حساب',
        cloze: 'Então',
      },
      {
        type: 'phrase',
        id: 'phrase.ok_thanks',
        tl: 'Pronto, obrigado.',
        ar: 'تمام شكراً',
        context_eg: 'ختام',
        cloze: 'Pronto',
      },
      {
        type: 'phrase',
        id: 'phrase.order_coffee',
        tl: 'Queria um café, por favor.',
        ar: 'عايز قهوة',
        context_eg: 'طلب',
        cloze: 'Queria',
      },
      {
        type: 'phrase',
        id: 'phrase.with_milk',
        tl: 'Com leite?',
        ar: 'بلبن؟',
        context_eg: 'سؤال',
        cloze: 'leite',
      },
      {
        type: 'phrase',
        id: 'phrase.hello',
        tl: 'Olá!',
        ar: 'أهلاً',
        context_eg: 'تحية',
        cloze: 'Olá',
      },
      {
        type: 'phrase',
        id: 'phrase.good_morning',
        tl: 'Bom dia!',
        ar: 'صباح الخير',
        context_eg: 'صباح',
        cloze: 'Bom',
      },
      {
        type: 'phrase',
        id: 'phrase.fine_thanks',
        tl: 'Tudo bem, obrigado.',
        ar: 'كويس شكراً',
        context_eg: 'رد',
        cloze: 'Tudo',
      },
      {
        type: 'word',
        id: 'word.toast',
        tl: 'a torrada',
        ar: 'توست',
        gender: 'f',
      },
      {
        type: 'pattern',
        id: 'pattern.queria_um_uma',
        tl: 'Queria + um/uma + حاجة, por favor.',
        ar: 'الطلب بأدب',
        examples: [
          'pattern.queria_um_uma.ex.1',
          'pattern.queria_um_uma.ex.2',
        ],
      },
      {
        type: 'phrase',
        id: 'pattern.queria_um_uma.ex.1',
        tl: 'Queria uma torrada, por favor.',
        ar: 'عايز توست',
        context_eg: 'مثال',
        cloze: 'Queria',
        derived: true,
      },
      {
        type: 'phrase',
        id: 'pattern.queria_um_uma.ex.2',
        tl: 'Queria um sumo, por favor.',
        ar: 'عايز عصير',
        context_eg: 'مثال',
        cloze: 'Queria',
        derived: true,
      },
      // Unrelated recycle pattern — must still not steal grammar budget.
      {
        type: 'pattern',
        id: 'pattern.contractions',
        slots: [{ tl: 'de+o=do' }, { name_eg: 'كلمة', kind: 'word' }],
        examples: ['pattern.contractions.ex.1'],
      } as Item,
      {
        type: 'phrase',
        id: 'pattern.contractions.ex.1',
        tl: 'do centro',
        ar: 'من الوسط',
        context_eg: 'مثال',
        cloze: 'do',
        derived: true,
      },
    ];
    const priorityIds = [...corePhraseIds, 'word.toast'];
    const outline: OutlineResult = {
      items,
      pages: [
        {
          index: 0,
          page_id: 'p0',
          preset: 'story',
          mode: 'static',
          role: 'intro',
          title: 'قصة',
          purpose: 'intro',
          introduces: [],
          assumes: [],
          handoff: '',
        },
        {
          index: 1,
          page_id: 'p1',
          preset: 'phrases',
          mode: 'static',
          title: 'جمل',
          purpose: 'phrases',
          introduces: corePhraseIds,
          assumes: [],
          handoff: '',
        },
        {
          index: 2,
          page_id: 'p2',
          preset: 'pattern',
          mode: 'sections',
          title: 'Queria',
          purpose: 'pattern',
          introduces: ['pattern.queria_um_uma'],
          assumes: ['phrase.order_coffee'],
          handoff: '',
        },
      ],
    };

    const withoutFocus = planQuestionSlots({
      outline,
      items,
      priorityIds,
    });
    assert.equal(
      withoutFocus.slots.filter((s) => s.skill === 'grammar').length,
      0,
      'without grammarFocusId, recycle pattern must not get grammar slots',
    );

    const { slots } = planQuestionSlots({
      outline,
      items,
      priorityIds,
      grammarFocusId: 'polite.queria',
      coreItems: [],
    });
    const grammar = slots.filter((s) => s.skill === 'grammar');
    const queriaGrammar = grammar.filter(
      (s) =>
        s.tests === 'pattern.queria_um_uma' ||
        s.tests.startsWith('pattern.queria_um_uma.'),
    );
    assert.ok(
      queriaGrammar.length >= 2,
      `queria grammar=${queriaGrammar.length}; all=${grammar.map((s) => `${s.type}:${s.tests}`).join(',')}`,
    );
    assert.ok(
      !grammar.some(
        (s) =>
          s.tests === 'pattern.contractions' ||
          s.tests.startsWith('pattern.contractions.'),
      ),
      'unrelated recycle pattern must not get grammar slots',
    );

    const questions: Question[] = [];
    for (const [i, slot] of slots.entries()) {
      const built = assembleSlotQuestion(
        slot,
        { slot_id: slot.slot_id, prompt_eg: 'السؤال' },
        { bank: items, index: i },
      );
      if (built.question) questions.push(built.question);
    }
    const result = validateDayQuestionQuotas(questions, priorityIds, {
      items,
      plannedCount: slots.length,
    });
    assert.ok(
      !result.fatals.some((f) => f.startsWith('grammar ')),
      result.fatals.join('; '),
    );
  });

  it('detects arabic option near-dupes and variant context', () => {
    assert.equal(arabicOptionsAreNearDupes('صباح الخير', 'صباح'), true);
    assert.equal(arabicOptionsAreNearDupes('أهلاً', 'مع السلامة'), false);
    assert.equal(promptHasVariantContext('الساعة ٩ بالليل'), true);
    assert.equal(promptHasVariantContext('قول أهلاً'), false);
  });

  it('fillSectionsCheck prefers grammar skill', () => {
    const pages = fillSectionsCheck(
      [
        {
          id: 'p2',
          mode: 'sections',
          preset: 'pattern',
          title: [{ text: 'x', lang: 'tl' }],
          blocks: [],
        },
      ],
      [
        {
          id: 'q.g1',
          type: 'build_sentence',
          skill: 'grammar',
          page_index: 0,
          use: 'lesson',
          prompt: {},
        },
        {
          id: 'q.g2',
          type: 'fill_blank_choice',
          skill: 'grammar',
          page_index: 0,
          use: 'lesson',
          prompt: {},
        },
        {
          id: 'q.l1',
          type: 'listen_meaning',
          skill: 'listening',
          page_index: 0,
          use: 'both',
          prompt: {},
        },
      ],
    );
    assert.deepEqual(pages[0]!.check, ['q.g1', 'q.g2']);
  });
});

describe('plural_s pattern questions (day-6 shape)', () => {
  const todayWords: Item[] = [
    {
      type: 'word',
      id: 'word.banana',
      tl: 'a banana',
      ar: 'الموز',
      gender: 'f',
      plural_tl: 'bananas',
    },
    {
      type: 'word',
      id: 'word.tomato',
      tl: 'o tomate',
      ar: 'الطماطم',
      gender: 'm',
      plural_tl: 'tomates',
    },
    {
      type: 'word',
      id: 'word.orange',
      tl: 'a laranja',
      ar: 'البرتقالة',
      gender: 'f',
      plural_tl: 'laranjas',
    },
    {
      type: 'phrase',
      id: 'phrase.how_much_does_it_cost',
      tl: 'Quanto custa isso?',
      ar: 'بكم هذا؟',
      context_eg: 'سعر',
      cloze: 'Quanto',
    },
  ];

  const pluralCore: CoreItem[] = [
    {
      id: 'pattern.plural_s',
      kind: 'pattern',
      tl: 'os/as + اسم + s',
      eg: 'الجمع',
      pattern_kind: 'plural_def',
      fills: ['word.apple', 'word.egg', 'word.bag', 'word.bread'],
    },
    {
      id: 'word.banana',
      kind: 'word',
      tl: 'a banana',
      eg: 'الموز',
      plural_tl: 'as bananas',
    },
  ];

  function day6Bank(): Item[] {
    const known = new Map<string, Item>([
      [
        'word.apple',
        {
          type: 'word',
          id: 'word.apple',
          tl: 'a maçã',
          ar: 'التفاحة',
          gender: 'f',
          plural_tl: 'maçãs',
        },
      ],
      [
        'word.egg',
        {
          type: 'word',
          id: 'word.egg',
          tl: 'o ovo',
          ar: 'البيضة',
          gender: 'm',
          plural_tl: 'ovos',
        },
      ],
      [
        'word.bag',
        {
          type: 'word',
          id: 'word.bag',
          tl: 'o saco',
          ar: 'الكيس',
          gender: 'm',
          plural_tl: 'sacos',
        },
      ],
      [
        'word.bread',
        {
          type: 'word',
          id: 'word.bread',
          tl: 'o pão',
          ar: 'العيش',
          gender: 'm',
          plural_tl: 'pães',
        },
      ],
    ]);
    let items: Item[] = [
      ...todayWords,
      {
        type: 'pattern',
        id: 'pattern.plural_s',
        kind: 'plural_def',
        slots: slotsForKind('plural_def'),
        examples: ['pattern.plural_s.ex.1'],
      } as Item,
    ];
    items = injectPatternFillWords(items, pluralCore, known);
    items = applyCorePluralTl(items, pluralCore);
    return fillPatternsInBank(items, { coreItems: pluralCore });
  }

  const pluralOutline: OutlineResult = {
    items: [],
    pages: [
      {
        index: 0,
        page_id: 'p0',
        preset: 'story',
        mode: 'static',
        role: 'intro',
        title: 'قصة',
        purpose: 'intro',
        introduces: [],
        assumes: [],
        handoff: '',
      },
      {
        index: 1,
        page_id: 'p1',
        preset: 'vocab_flow',
        mode: 'static',
        title: 'فواكه',
        purpose: 'vocab',
        introduces: ['word.banana', 'word.tomato', 'word.orange'],
        assumes: [],
        handoff: '',
      },
      {
        index: 2,
        page_id: 'p2',
        preset: 'pattern',
        mode: 'sections',
        title: 'Plurais',
        purpose: 'pattern',
        introduces: ['pattern.plural_s'],
        assumes: [],
        handoff: '',
      },
      {
        index: 3,
        page_id: 'p3',
        preset: 'phrases',
        mode: 'static',
        title: 'جمل',
        purpose: 'phrases',
        introduces: ['phrase.how_much_does_it_cost'],
        assumes: [],
        handoff: '',
      },
    ],
  };

  it('injects prior-day fill words and builds tileable plural examples', () => {
    const bank = day6Bank();
    assert.ok(bank.some((i) => i.id === 'word.apple'), 'injected apple');
    assert.ok(bank.some((i) => i.id === 'word.egg'), 'injected egg');
    const ex = bank.find((i) => i.id === 'pattern.plural_s.ex.1');
    assert.ok(ex && 'tl' in ex);
    assert.match(String(ex.tl), /^(os|as)\s+/);
  });

  it('resolveGrammarTestsId never returns pattern root for build_sentence', () => {
    const bank = day6Bank();
    const id = resolveGrammarTestsId(
      'pattern.plural_s',
      'build_sentence',
      bank,
      new Set(),
      true,
    );
    assert.ok(id);
    assert.match(id!, /^pattern\.plural_s\.ex\.\d+$/);
    assert.notEqual(id, 'pattern.plural_s');
  });

  it('planner never schedules build_sentence on pattern.plural_s root', () => {
    const bank = day6Bank();
    const outline = { ...pluralOutline, items: bank };
    const { slots } = planQuestionSlots({
      outline,
      items: bank,
      coreItems: pluralCore,
    });
    const grammar = slots.filter((s) => s.skill === 'grammar');
    assert.ok(grammar.length >= 2, `grammar=${grammar.length}`);
    assert.ok(
      !slots.some(
        (s) =>
          s.type === 'build_sentence' && s.tests === 'pattern.plural_s',
      ),
      'build_sentence must not test pattern root',
    );
    const build = slots.find((s) => s.type === 'build_sentence');
    if (build) {
      assert.match(build.tests, /^pattern\.plural_s\.ex\.\d+$/);
    }
  });

  it('assembles build_sentence tiles from plural example and passes quotas', () => {
    const bank = day6Bank();
    const outline = { ...pluralOutline, items: bank };
    const { slots } = planQuestionSlots({
      outline,
      items: bank,
      coreItems: pluralCore,
    });
    const questions: Question[] = [];
    for (const [i, slot] of slots.entries()) {
      const built = assembleSlotQuestion(
        slot,
        { slot_id: slot.slot_id, prompt_eg: 'اختبار' },
        { bank, index: i },
      );
      assert.ok(
        built.question,
        `slot ${slot.slot_id} ${slot.type} tests=${slot.tests} dropped: ${built.warnings.map((w) => w.message).join('; ')}`,
      );
      questions.push(built.question!);
    }
    assert.equal(questions.length, slots.length);
    const buildQ = questions.find((q) => q.type === 'build_sentence');
    assert.ok(buildQ, 'expected a build_sentence question');
    const tiles = (buildQ as { tiles?: string[] }).tiles ?? [];
    assert.ok(tiles.length >= 2, `tiles=${tiles.join('|')}`);
    const result = validateDayQuestionQuotas(
      questions,
      [
        'pattern.plural_s',
        'phrase.how_much_does_it_cost',
        'word.banana',
      ],
      { plannedCount: slots.length, bank },
    );
    assert.equal(result.ok, true, result.fatals.join('; '));
  });

  it('falls back to today’s plural words when listed fills lack plural_tl', () => {
    const bank = fillPatternsInBank(
      [
        {
          type: 'word',
          id: 'word.apple',
          tl: 'a maçã',
          ar: 'التفاحة',
          gender: 'f',
        },
        {
          type: 'word',
          id: 'word.egg',
          tl: 'o ovo',
          ar: 'البيضة',
          gender: 'm',
        },
        ...todayWords,
        {
          type: 'pattern',
          id: 'pattern.plural_s',
          kind: 'plural_def',
          slots: slotsForKind('plural_def'),
          examples: [],
        } as Item,
      ],
      { coreItems: pluralCore },
    );
    const plEx = bank.find((i) => i.id === 'pattern.plural_s.ex.1');
    assert.ok(plEx && 'tl' in plEx, 'expected fallback to today’s plural words');
    assert.match(String(plEx.tl), /^(os|as)\s+/);
    assert.match(String(plEx.tl), /(bananas|tomates|laranjas)/);
  });

  it('hydratePatternBankForQuestions repairs a stale draft (no .ex, missing fills)', () => {
    // Saved items bank as questions used to see it: pattern root only, no fill words.
    const stale: Item[] = [
      ...todayWords,
      {
        type: 'pattern',
        id: 'pattern.plural_s',
        kind: 'plural_def',
        slots: slotsForKind('plural_def'),
        examples: ['pattern.plural_s.ex.1'],
      } as Item,
    ];
    assert.equal(
      stale.filter((i) => i.id.startsWith('pattern.plural_s.ex.')).length,
      0,
    );
    const brief = {
      day: 6,
      core_items: pluralCore,
      recycle_ids: [],
      grammar_focus: 'articles.definite.2',
    } as unknown as LessonBrief;
    const hydrated = hydratePatternBankForQuestions(stale, brief);
    const ex = hydrated.find((i) => i.id === 'pattern.plural_s.ex.1');
    assert.ok(ex && 'tl' in ex && String(ex.tl).trim(), 'hydrated .ex.1');
    assert.match(String(ex!.tl), /^(os|as)\s+/);
    const tests = resolveGrammarTestsId(
      'pattern.plural_s',
      'build_sentence',
      hydrated,
      new Set(),
      true,
    );
    assert.ok(tests && tests !== 'pattern.plural_s');
    const built = assembleSlotQuestion(
      {
        slot_id: 's1',
        type: 'build_sentence',
        skill: 'grammar',
        tests: tests!,
        page_index: 2,
        page_id: 'p2',
        use: 'lesson',
      },
      { slot_id: 's1', prompt_eg: 'رتّب' },
      { bank: hydrated, index: 1 },
    );
    assert.ok(built.question, built.warnings.map((w) => w.message).join('; '));
  });
});

const TEMPLATE_KINDS = new Set<PatternKind>([
  'plural_def',
  'article_def',
  'article_indef',
  'polite_request',
  'chamo_me',
]);

function genderFromTl(tl: string): 'm' | 'f' | 'n' {
  if (/^(a|as|uma|umas)\s+/i.test(tl.trim())) return 'f';
  if (/^(o|os|um|uns)\s+/i.test(tl.trim())) return 'm';
  return 'n';
}

function coreItemToBankItem(c: CoreItem): Item | null {
  if (c.kind === 'word') {
    const row: Extract<Item, { type: 'word' }> = {
      type: 'word',
      id: c.id,
      tl: c.tl,
      ar: c.eg || '…',
      gender: genderFromTl(c.tl),
    };
    if (typeof c.plural_tl === 'string' && c.plural_tl.trim()) {
      return { ...row, plural_tl: c.plural_tl };
    }
    return row;
  }
  if (c.kind === 'phrase') {
    return {
      type: 'phrase',
      id: c.id,
      tl: c.tl,
      ar: c.eg || '…',
      context_eg: c.context_eg ?? '…',
      cloze: c.tl.replace(/[…!.?]+$/g, '').trim().split(/\s+/)[0] ?? c.tl,
    };
  }
  if (c.kind === 'verb') {
    return {
      type: 'verb',
      id: c.id,
      tl: c.tl,
      ar: c.eg || '…',
    };
  }
  if (c.kind === 'pattern') {
    const kind =
      c.pattern_kind ??
      resolvePatternKind(c.id) ??
      undefined;
    return {
      type: 'pattern',
      id: c.id,
      ...(kind ? { kind, slots: slotsForKind(kind) } : { slots: [] }),
      examples: [],
    } as Item;
  }
  return null;
}

function minimalOutlineForAudit(items: Item[]): OutlineResult {
  const patterns = items.filter(
    (i) => i.type === 'pattern' && !/\.ex\.\d+$/.test(i.id),
  );
  const others = items.filter(
    (i) =>
      (i.type === 'word' || i.type === 'verb' || i.type === 'phrase') &&
      !/\.ex\.\d+$/.test(i.id),
  );
  return {
    items,
    pages: [
      {
        index: 0,
        page_id: 'p0',
        preset: 'story',
        mode: 'static',
        role: 'intro',
        title: 'قصة',
        purpose: 'intro',
        introduces: [],
        assumes: [],
        handoff: '',
      },
      {
        index: 1,
        page_id: 'p1',
        preset: 'vocab_flow',
        mode: 'static',
        title: 'مفردات',
        purpose: 'vocab',
        introduces: others.map((i) => i.id).slice(0, 12),
        assumes: [],
        handoff: '',
      },
      {
        index: 2,
        page_id: 'p2',
        preset: 'pattern',
        mode: 'sections',
        title: 'قاعدة',
        purpose: 'pattern',
        introduces: patterns.map((i) => i.id),
        assumes: [],
        handoff: '',
      },
    ],
  };
}

describe('curriculum grammar coverage audit', () => {
  const coreFile = loadCoreItemsFile();
  const planFile = loadPlan();

  for (const dayEntry of coreFile.days) {
    if (dayEntry.is_story || dayEntry.is_test) continue;
    const corePatterns = (dayEntry.core_items ?? []).filter(
      (c) => c.kind === 'pattern',
    );
    if (!corePatterns.length) continue;

    it(`day ${dayEntry.day} (${dayEntry.title_tl ?? '?'}) hydrates + plans ≥2 grammar on .ex`, () => {
      const coreItems = [...(dayEntry.core_items ?? [])];
      const known = new Map<string, Item>();
      for (const c of coreItems) {
        if (c.kind !== 'pattern' || !c.fills?.length) continue;
        for (const fillId of c.fills) {
          const prior = findCoreItemById(fillId);
          if (!prior) continue;
          const item = coreItemToBankItem(prior);
          if (item) known.set(fillId, item);
        }
      }
      for (const rid of dayEntry.recycle_ids ?? []) {
        const prior = findCoreItemById(rid);
        if (!prior) continue;
        const item = coreItemToBankItem(prior);
        if (item) known.set(rid, item);
      }

      let items: Item[] = [];
      for (const c of coreItems) {
        const item = coreItemToBankItem(c);
        if (item) items.push(item);
      }
      for (const rid of dayEntry.recycle_ids ?? []) {
        if (items.some((i) => i.id === rid)) continue;
        const fromKnown = known.get(rid);
        if (fromKnown) items.push(fromKnown);
      }

      items = injectPatternFillWords(items, coreItems, known);
      items = applyCorePluralTl(items, coreItems);
      items = fillPatternsInBank(items, { coreItems });

      for (const p of corePatterns) {
        const kind =
          p.pattern_kind ?? resolvePatternKind(p.id) ?? null;
        if (!kind || !TEMPLATE_KINDS.has(kind)) continue;
        const live = items.filter(
          (i) =>
            i.type === 'phrase' &&
            i.id.startsWith(`${p.id}.ex.`) &&
            'tl' in i &&
            String(i.tl).trim(),
        );
        assert.ok(
          live.length >= 1,
          `day ${dayEntry.day} ${p.id} (${kind}) needs ≥1 live .ex`,
        );
      }

      const dayPlan = planFile.days.find((d) => d.day === dayEntry.day);
      const grammarFocusId = dayPlan?.generation?.grammar_focus?.id;
      const outline = minimalOutlineForAudit(items);
      const { slots, warnings } = planQuestionSlots({
        outline,
        items,
        priorityIds: coreItems.map((c) => c.id),
        grammarFocusId,
        coreItems,
        preferBuildSentenceFor: ['pattern.chamo_me'],
      });

      const bankPatternIds = new Set(
        items
          .filter((i) => i.type === 'pattern' && !/\.ex\.\d+$/.test(i.id))
          .map((i) => i.id),
      );
      const todayPatternIds = [
        ...new Set([
          ...coreItems
            .filter((c) => c.kind === 'pattern')
            .map((c) => c.id)
            .filter((id) => bankPatternIds.has(id)),
          ...(grammarFocusId
            ? resolveGrammarFocusPatternIds(grammarFocusId, coreItems).filter(
                (id) => bankPatternIds.has(id),
              )
            : []),
        ]),
      ];

      const planFatals = validatePlannedGrammarCoverage(slots, todayPatternIds);
      assert.equal(
        planFatals.length,
        0,
        `day ${dayEntry.day} plan coverage: ${planFatals.join('; ')} | warnings=${warnings.join('; ')}`,
      );

      const grammar = slots.filter((s) => s.skill === 'grammar');
      assert.ok(grammar.length >= 2, `day ${dayEntry.day} grammar=${grammar.length}`);
      for (const s of grammar) {
        assert.match(
          s.tests,
          /^pattern\..+\.ex\.\d+$/,
          `day ${dayEntry.day} grammar ${s.slot_id} must test .ex, got ${s.tests}`,
        );
      }
    });
  }
});
