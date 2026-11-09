import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import type { Question } from '../lib/v2/content/lesson';
import { assembleSlotQuestion } from '../lib/v2/generation/lesson/jobs/runQuestions';
import {
  imageFallbackType,
  promptHasVariantContext,
  arabicOptionsAreNearDupes,
} from '../lib/v2/generation/lesson/questionTypes';
import {
  planQuestionSlots,
  validateDayQuestionQuotas,
} from '../lib/v2/generation/lesson/questionSlots';
import type { OutlineResult } from '../lib/v2/generation/lesson/stages/types';
import { fillSectionsCheck } from '../lib/v2/generation/lesson/stages/assemble';

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

describe('day question set planner', () => {
  it('plans exactly 12 slots with skill quotas and Chamo-me build_sentence', () => {
    const { slots } = planQuestionSlots({
      outline,
      items: day1Items,
      preferBuildSentenceFor: ['pattern.chamo_me'],
    });
    assert.equal(slots.length, 12, `got ${slots.length}`);
    const bySkill = {
      listening: slots.filter((s) => s.skill === 'listening').length,
      writing: slots.filter((s) => s.skill === 'writing').length,
      speaking: slots.filter((s) => s.skill === 'speaking').length,
      grammar: slots.filter((s) => s.skill === 'grammar').length,
    };
    assert.ok(bySkill.listening >= 3, `L=${bySkill.listening}`);
    assert.ok(bySkill.writing >= 3, `W=${bySkill.writing}`);
    assert.ok(bySkill.speaking >= 3, `S=${bySkill.speaking}`);
    assert.ok(bySkill.grammar >= 2, `G=${bySkill.grammar}`);
    assert.ok(
      slots.some(
        (s) =>
          s.type === 'build_sentence' &&
          (s.tests.startsWith('pattern.chamo_me.ex.') ||
            s.tests === 'pattern.chamo_me'),
      ),
      'expected build_sentence for pattern.chamo_me.ex',
    );
    assert.ok(
      !slots.some(
        (s) =>
          (s.type === 'build_sentence' || s.type === 'fill_blank_choice') &&
          s.tests === 'phrase.my_name_is',
      ),
      'grammar must not test phrase.my_name_is',
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
    assert.equal(slots.length, 12);
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
    });
    assert.equal(result.ok, true, result.fatals.join('; '));
    assert.equal(questions.length, 12);
    assert.ok(questions.filter((q) => q.skill === 'listening').length >= 3);
    assert.ok(questions.filter((q) => q.skill === 'writing').length >= 3);
    assert.ok(questions.filter((q) => q.skill === 'speaking').length >= 3);
    assert.ok(questions.filter((q) => q.skill === 'grammar').length >= 2);
    assert.ok(
      questions.some((q) => q.type === 'build_sentence'),
      'need build_sentence',
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
    // >15 core ids → 14-slot target; untested words are warnings only.
    assert.equal(questions.length, 14);
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
