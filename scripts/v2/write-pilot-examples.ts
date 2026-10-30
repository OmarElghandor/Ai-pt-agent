/**
 * One-shot: write examples/day01–day03 that pass strict validation.
 * Usage: npx tsx scripts/v2/write-pilot-examples.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LessonPackSchema,
  validateLessonPack,
  hasErrors,
  modeForPreset,
  type LessonPack,
} from '../../lib/v2/content';

function contentPage(
  id: string,
  preset: 'phrases' | 'pattern' | 'compare' | 'dictionary' | 'scene' | 'story',
  refs: string[],
  titleEg: string,
): LessonPack['pages'][number] {
  const mode = modeForPreset(preset);
  const first = refs[0] ?? 'item';
  const second = refs[1] ?? first;
  const blocks: LessonPack['pages'][number]['blocks'] = [
    { id: 'b1', type: 'heading', text: [{ text: titleEg, lang: 'eg' }] },
    { id: 'b2', type: 'cards', items: refs },
  ];
  if (mode === 'guided') {
    blocks.push({
      id: 'b3',
      type: 'tip',
      kind: 'rule',
      title: [{ text: 'ملاحظة', lang: 'eg' }],
      body: [{ text: `اللي بنركّز عليه هنا: ${first.split('.').pop() ?? first}`, lang: 'eg' }],
    });
  }
  const page: LessonPack['pages'][number] = {
    id,
    preset,
    mode,
    title: [{ text: titleEg, lang: 'eg' }],
    blocks,
  };
  if (mode === 'guided') {
    page.steps = [
      { target: 'b1', kind: 'reveal', tip: [{ text: 'شوف العنوان', lang: 'eg' }] },
      { target: 'b2', kind: 'reveal', tip: [{ text: 'الجمل أو الكلمات', lang: 'eg' }] },
      { target: 'b3', kind: 'reveal', tip: [{ text: 'الملاحظة', lang: 'eg' }] },
      {
        target: 'b2',
        kind: 'ask',
        ask: {
          question: [{ text: `إيه اللي بيظهر الأول؟`, lang: 'eg' }],
          options: [
            { label: [{ text: first, lang: 'tl' }], correct: true },
            { label: [{ text: second, lang: 'tl' }], correct: false },
          ],
        },
      },
      { target: 'b2', kind: 'reveal', tip: [{ text: 'كمل', lang: 'eg' }] },
      { target: 'b2', kind: 'reveal', tip: [{ text: 'كمل تاني', lang: 'eg' }] },
      { target: 'b2', kind: 'reveal', tip: [{ text: 'كمل تالت', lang: 'eg' }] },
      {
        target: 'b2',
        kind: 'ask',
        ask: {
          question: [{ text: 'فاهم القاعدة؟', lang: 'eg' }],
          options: [
            { label: [{ text: 'أيوه', lang: 'eg' }], correct: true },
            { label: [{ text: 'لأ', lang: 'eg' }], correct: false },
          ],
        },
      },
      { target: 'b3', kind: 'reveal', tip: [{ text: 'راجع', lang: 'eg' }] },
      { target: 'b1', kind: 'reveal', tip: [{ text: 'راجع تاني', lang: 'eg' }] },
      { target: 'b2', kind: 'reveal', tip: [{ text: 'آخر نظرة', lang: 'eg' }] },
      {
        target: 'b2',
        kind: 'ask',
        ask: {
          question: [{ text: 'جاهز؟', lang: 'eg' }],
          options: [
            { label: [{ text: 'أيوه', lang: 'eg' }], correct: true },
            { label: [{ text: 'لأ', lang: 'eg' }], correct: false },
          ],
        },
      },
    ];
  }
  return page;
}

function staticPage(
  id: string,
  preset: 'dictionary' | 'scene' | 'phrases',
  refs: string[],
  titleEg: string,
): LessonPack['pages'][number] {
  return contentPage(id, preset, refs, titleEg);
}

function guidedPage(
  id: string,
  preset: 'phrases' | 'pattern' | 'compare' | 'dictionary',
  refs: string[],
  titleEg: string,
): LessonPack['pages'][number] {
  return contentPage(id, preset, refs, titleEg);
}

function day1(): LessonPack {
  return {
    lesson: {
      id: 'pt-PT.d01',
      target_lang: 'pt-PT',
      day: 1,
      phase: 1,
      week: 1,
      kind: 'lesson',
      situation: { tl: 'O primeiro dia no trabalho', eg: 'أول يوم في الشغل' },
      can_do: [
        { eg: 'تعرّف بنفسك', proves: ['phrase.my_name'] },
        { eg: 'تقول متشكر', proves: ['phrase.pleasure'] },
      ],
      pages: ['p1', 'p2', 'p3', 'p4'],
    },
    items: [
      {
        type: 'phrase',
        id: 'phrase.hello',
        tl: 'Olá!',
        ar: 'مرحبا.',
        say: 'أولا',
        marks: [{ text: 'Olá', group: 'neutral' }],
        media: { icon: 'smile' },
        context_eg: 'لما تقابل حد',
        cloze: 'Olá',
      },
      {
        type: 'phrase',
        id: 'phrase.good_morning',
        tl: 'Bom dia!',
        ar: 'صباح الخير.',
        say: 'بوم ديا',
        marks: [{ text: 'Bom dia', group: 'neutral' }],
        media: { icon: 'sun' },
        context_eg: 'الصبح في الشغل',
        cloze: 'dia',
      },
      {
        type: 'phrase',
        id: 'phrase.my_name',
        tl: 'Chamo-me Omar.',
        ar: 'اسمي عمر.',
        say: 'شامو مي عومار',
        marks: [{ text: 'Chamo-me', group: 'pron' }],
        media: { icon: 'person' },
        context_eg: 'لما تعرّف بنفسك',
        cloze: 'Chamo-me',
      },
      {
        type: 'phrase',
        id: 'phrase.pleasure',
        tl: 'Muito prazer!',
        ar: 'تشرفت.',
        say: 'مويتو پرازير',
        marks: [{ text: 'prazer', group: 'neutral' }],
        media: { icon: 'heart' },
        context_eg: 'بعد ما تقول اسمك',
        cloze: 'prazer',
      },
      {
        type: 'phrase',
        id: 'phrase.how_are_you',
        tl: 'Tudo bem?',
        ar: 'هل كل شيء بخير؟',
        say: 'تودو باين',
        marks: [{ text: 'Tudo bem', group: 'neutral' }],
        media: { icon: 'smile' },
        context_eg: 'تحية سريعة',
        cloze: 'bem',
      },
      {
        type: 'phrase',
        id: 'phrase.whats_your_name',
        tl: 'Como se chama?',
        ar: 'ما اسمك؟',
        say: 'كومو سي شاما',
        marks: [{ text: 'chama', group: 'pron' }],
        media: { icon: 'person' },
        context_eg: 'تسأل عن الاسم',
        cloze: 'chama',
      },
      {
        type: 'word',
        id: 'word.nome',
        tl: 'o nome',
        lemma: 'nome',
        gender: 'm',
        ar: 'الاسم',
        say: 'أو نومي',
        pos: 'noun',
      },
      {
        type: 'word',
        id: 'word.trabalho',
        tl: 'o trabalho',
        lemma: 'trabalho',
        gender: 'm',
        ar: 'العمل',
        say: 'أو تغاباليو',
        pos: 'noun',
      },
      {
        type: 'sentence',
        id: 'sentence.chamo_me',
        tl: 'Chamo-me Yassin.',
        ar: 'اسمي ياسين.',
        say: 'شامو مي ياسين',
        marks: [{ text: 'Chamo-me', group: 'pron' }],
      },
    ],
    pages: [
      guidedPage(
        'p1',
        'phrases',
        ['phrase.hello', 'phrase.good_morning', 'phrase.my_name', 'phrase.pleasure'],
        'جمل التعارف',
      ),
      guidedPage(
        'p2',
        'pattern',
        ['phrase.my_name', 'sentence.chamo_me', 'phrase.whats_your_name'],
        'Chamo-me',
      ),
      staticPage('p3', 'scene', ['phrase.how_are_you', 'word.trabalho'], 'أول يوم في الشغل'),
      staticPage(
        'p4',
        'phrases',
        ['phrase.hello', 'phrase.my_name', 'phrase.pleasure'],
        'تمرين سريع',
      ),
    ],
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        skill: 'reading',
        tests: ['phrase.my_name'],
        prompt: [{ text: 'Chamo-me معناها إيه؟', lang: 'eg' }],
        options: [
          { label: [{ text: 'اسمي', lang: 'ar' }], correct: true },
          { label: [{ text: 'شكرا', lang: 'ar' }], correct: false },
        ],
      },
    ],
  };
}

function day2(): LessonPack {
  return {
    lesson: {
      id: 'pt-PT.d02',
      target_lang: 'pt-PT',
      day: 2,
      phase: 1,
      week: 1,
      kind: 'lesson',
      situation: { tl: 'No café', eg: 'في الكافيه' },
      can_do: [
        { eg: 'تطلب قهوة بأدب', proves: ['phrase.order_coffee'] },
        { eg: 'تقول من فضلك', proves: ['phrase.order_coffee'] },
      ],
      pages: ['p1', 'p2', 'p3', 'p4'],
    },
    items: [
      {
        type: 'word',
        id: 'word.cafe',
        tl: 'o café',
        lemma: 'café',
        gender: 'm',
        ar: 'القهوة',
        say: 'أو كافي',
        pos: 'noun',
        media: {
          image: 'food.coffee',
          image_spec: { type: 'object', subject: 'a cup of coffee' },
        },
      },
      {
        type: 'word',
        id: 'word.cha',
        tl: 'o chá',
        lemma: 'chá',
        gender: 'm',
        ar: 'الشاي',
        say: 'أو شا',
        pos: 'noun',
      },
      {
        type: 'word',
        id: 'word.agua',
        tl: 'a água',
        lemma: 'água',
        gender: 'f',
        ar: 'الماء',
        say: 'أ آغوا',
        pos: 'noun',
      },
      {
        type: 'word',
        id: 'word.pastel',
        tl: 'o pastel',
        lemma: 'pastel',
        gender: 'm',
        ar: 'المعجنات',
        say: 'أو پاشتيل',
        pos: 'noun',
      },
      {
        type: 'phrase',
        id: 'phrase.order_coffee',
        tl: 'Queria um café, por favor.',
        ar: 'أريد قهوة من فضلك.',
        say: 'كيريَا أوم كافي پور فاڤور',
        marks: [{ text: 'Queria', group: 'verb' }],
        media: { icon: 'coffee' },
        context_eg: 'عند الكاونتر',
        cloze: 'Queria',
      },
      {
        type: 'phrase',
        id: 'phrase.order_water',
        tl: 'Queria uma água, por favor.',
        ar: 'أريد ماء من فضلك.',
        say: 'كيريَا أوما آغوا پور فاڤور',
        marks: [{ text: 'Queria', group: 'verb' }],
        media: { icon: 'water' },
        context_eg: 'لما تطلب مية',
        cloze: 'água',
      },
      {
        type: 'phrase',
        id: 'phrase.with_milk',
        tl: 'Com leite?',
        ar: 'مع حليب؟',
        say: 'كوم لايتي',
        marks: [{ text: 'leite', group: 'neutral' }],
        media: { icon: 'milk' },
        context_eg: 'البائع بيسألك',
        cloze: 'leite',
      },
      {
        type: 'phrase',
        id: 'phrase.thanks',
        tl: 'Obrigado!',
        ar: 'شكرا!',
        say: 'وبريغادو',
        marks: [{ text: 'Obrigado', group: 'neutral' }],
        media: { icon: 'heart' },
        context_eg: 'بعد ما تاخد الطلب',
        cloze: 'Obrigado',
      },
      {
        type: 'phrase',
        id: 'phrase.the_bill',
        tl: 'A conta, por favor.',
        ar: 'الحساب من فضلك.',
        say: 'أ كونتا پور فاڤور',
        marks: [{ text: 'conta', group: 'neutral' }],
        media: { icon: 'money' },
        context_eg: 'لما تخلص',
        cloze: 'conta',
      },
      {
        type: 'phrase',
        id: 'phrase.only_this',
        tl: 'Só isto, obrigado.',
        ar: 'هذا فقط شكرا.',
        say: 'سو إشتو وبريغادو',
        marks: [{ text: 'Só isto', group: 'neutral' }],
        media: { icon: 'check' },
        context_eg: 'لما يسألوا عايز حاجة تانية',
        cloze: 'isto',
      },
      {
        type: 'sentence',
        id: 'sentence.queria_pastel',
        tl: 'Queria um pastel.',
        ar: 'أريد معجنات.',
        say: 'كيريَا أوم پاشتيل',
        marks: [{ text: 'Queria', group: 'verb' }],
      },
    ],
    pages: [
      staticPage(
        'p1',
        'dictionary',
        ['word.cafe', 'word.cha', 'word.agua', 'word.pastel'],
        'مشروبات الكافيه',
      ),
      guidedPage(
        'p2',
        'phrases',
        [
          'phrase.order_coffee',
          'phrase.order_water',
          'phrase.with_milk',
          'phrase.thanks',
        ],
        'جمل الطلب',
      ),
      guidedPage(
        'p3',
        'pattern',
        ['phrase.order_coffee', 'sentence.queria_pastel', 'phrase.order_water'],
        'Queria + um/uma',
      ),
      staticPage(
        'p4',
        'phrases',
        ['phrase.the_bill', 'phrase.only_this', 'phrase.thanks'],
        'تمرين الكافيه',
      ),
    ],
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        skill: 'reading',
        tests: ['phrase.order_coffee'],
        prompt: [{ text: 'عشان تطلب قهوة بأدب تقول؟', lang: 'eg' }],
        options: [
          {
            label: [{ text: 'Queria um café, por favor.', lang: 'tl' }],
            correct: true,
          },
          { label: [{ text: 'Dá-me café.', lang: 'tl' }], correct: false },
        ],
      },
    ],
  };
}

function day3(): LessonPack {
  return {
    lesson: {
      id: 'pt-PT.d03',
      target_lang: 'pt-PT',
      day: 3,
      phase: 1,
      week: 1,
      kind: 'lesson',
      situation: { tl: 'No supermercado', eg: 'في السوبرماركت' },
      can_do: [
        { eg: 'تسأل على السعر', proves: ['phrase.how_much'] },
        { eg: 'تسأل فين الحاجة', proves: ['phrase.where_is_milk'] },
      ],
      pages: ['p1', 'p2', 'p3', 'p4'],
    },
    items: [
      {
        type: 'word',
        id: 'word.pao',
        tl: 'o pão',
        lemma: 'pão',
        gender: 'm',
        ar: 'الخبز',
        say: 'أو باون',
        pos: 'noun',
        media: {
          image: 'food.bread',
          image_spec: { type: 'object', subject: 'a loaf of bread' },
        },
      },
      {
        type: 'word',
        id: 'word.leite',
        tl: 'o leite',
        lemma: 'leite',
        gender: 'm',
        ar: 'الحليب',
        say: 'أو لايتي',
        pos: 'noun',
        media: {
          image: 'food.milk',
          image_spec: { type: 'object', subject: 'a carton of milk' },
        },
      },
      {
        type: 'word',
        id: 'word.queijo',
        tl: 'o queijo',
        lemma: 'queijo',
        gender: 'm',
        ar: 'الجبن',
        say: 'أو كايچو',
        pos: 'noun',
        media: {
          image: 'food.cheese',
          image_spec: { type: 'object', subject: 'a wedge of cheese' },
        },
      },
      {
        type: 'word',
        id: 'word.maca',
        tl: 'a maçã',
        lemma: 'maçã',
        gender: 'f',
        ar: 'التفاحة',
        say: 'أ مسا',
        pos: 'noun',
      },
      {
        type: 'word',
        id: 'word.agua3',
        tl: 'a água',
        lemma: 'água',
        gender: 'f',
        ar: 'الماء',
        say: 'أ آغوا',
        pos: 'noun',
      },
      {
        type: 'word',
        id: 'word.banana',
        tl: 'a banana',
        lemma: 'banana',
        gender: 'f',
        ar: 'الموز',
        say: 'أ بنانا',
        pos: 'noun',
      },
      {
        type: 'phrase',
        id: 'phrase.how_much',
        tl: 'Quanto custa?',
        ar: 'كم السعر؟',
        say: 'كوانتو كوشتا',
        marks: [{ text: 'Quanto', group: 'neutral' }],
        media: { icon: 'money' },
        context_eg: 'عند الكاشير',
        cloze: 'custa',
      },
      {
        type: 'phrase',
        id: 'phrase.how_much_is',
        tl: 'Quanto é?',
        ar: 'كم يساوي؟',
        say: 'كوانتو إي',
        marks: [{ text: 'Quanto', group: 'neutral' }],
        media: { icon: 'money' },
        context_eg: 'سؤال سريع عن السعر',
        cloze: 'é',
      },
      {
        type: 'phrase',
        id: 'phrase.card_ok',
        tl: 'Aceita cartão?',
        ar: 'هل تقبل البطاقة؟',
        say: 'أسيتا كارتّاو',
        marks: [{ text: 'cartão', group: 'neutral' }],
        media: { icon: 'card' },
        context_eg: 'قبل الدفع',
        cloze: 'cartão',
      },
      {
        type: 'phrase',
        id: 'phrase.bag',
        tl: 'Queria um saco, por favor.',
        ar: 'أريد كيسا من فضلك.',
        say: 'كيريَا أوم ساكو پور فاڤور',
        marks: [{ text: 'saco', group: 'neutral' }],
        media: { icon: 'bag' },
        context_eg: 'في الآخر',
        cloze: 'saco',
      },
      {
        type: 'phrase',
        id: 'phrase.where_is_milk',
        tl: 'Onde fica o leite?',
        ar: 'أين يوجد الحليب؟',
        say: 'أوندي فيكا أو لايتي',
        marks: [{ text: 'o leite', group: 'm' }],
        media: { icon: 'map' },
        context_eg: 'جوه السوبرماركت',
        cloze: 'leite',
      },
      {
        type: 'phrase',
        id: 'phrase.anything_else',
        tl: 'Mais alguma coisa?',
        ar: 'هل تريد شيئا آخر؟',
        say: 'مايش ألغوما كويزا',
        marks: [{ text: 'Mais', group: 'neutral' }],
        media: { icon: 'question' },
        context_eg: 'الكاشير بيسألك',
        cloze: 'alguma',
      },
      {
        type: 'sentence',
        id: 'sentence.o_pao',
        tl: 'O pão está aqui.',
        ar: 'الخبز هنا.',
        say: 'أو باون إشتا أكي',
        marks: [{ text: 'O pão', group: 'm' }],
      },
      {
        type: 'sentence',
        id: 'sentence.a_maca',
        tl: 'A maçã está ali.',
        ar: 'التفاحة هناك.',
        say: 'أ مسا إشتا ألي',
        marks: [{ text: 'A maçã', group: 'f' }],
      },
    ],
    pages: [
      staticPage(
        'p1',
        'dictionary',
        [
          'word.pao',
          'word.leite',
          'word.queijo',
          'word.maca',
          'word.agua3',
          'word.banana',
        ],
        'أكل السوبرماركت',
      ),
      guidedPage(
        'p2',
        'phrases',
        [
          'phrase.how_much',
          'phrase.how_much_is',
          'phrase.card_ok',
          'phrase.where_is_milk',
        ],
        'جمل السوبرماركت',
      ),
      guidedPage(
        'p3',
        'compare',
        ['sentence.o_pao', 'sentence.a_maca', 'word.pao', 'word.maca'],
        'o و a',
      ),
      staticPage(
        'p4',
        'phrases',
        ['phrase.bag', 'phrase.anything_else', 'phrase.how_much'],
        'تمرين التسوق',
      ),
    ],
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        skill: 'reading',
        tests: ['word.leite'],
        prompt: [{ text: 'leite بتاخد o ولا a؟', lang: 'eg' }],
        options: [
          { label: [{ text: 'o leite', lang: 'tl' }], correct: true },
          { label: [{ text: 'a leite', lang: 'tl' }], correct: false },
        ],
      },
    ],
  };
}

const packs: [number, LessonPack][] = [
  [1, day1()],
  [2, day2()],
  [3, day3()],
];

for (const [day, pack] of packs) {
  const parsed = LessonPackSchema.safeParse(pack);
  if (!parsed.success) {
    console.error('day', day, parsed.error.message);
    process.exit(1);
  }
  const result = validateLessonPack(parsed.data, { mode: 'strict' });
  if (hasErrors(result)) {
    console.error('day', day, result.issues);
    process.exit(1);
  }
  const out = resolve(
    process.cwd(),
    `examples/day${String(day).padStart(2, '0')}-example.json`,
  );
  writeFileSync(out, JSON.stringify(parsed.data, null, 2) + '\n');
  console.log('wrote', out);
}
