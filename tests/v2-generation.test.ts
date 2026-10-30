import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import {
  LessonPackSchema,
  validateLessonPack,
  hasErrors,
  type LessonPack,
} from '../lib/v2/content';
import { PRONUNCIATION_TABLE } from '../lib/v2/generation/lists';
import {
  buildDayRequest,
  buildSystemPrompt,
  canGenerate,
  formatCompactDayHeader,
  getDayPlan,
  loadPlan,
  mergePhrasesWithEarlyChunks,
  systemPromptContainsPages,
  verifiedLemmas,
} from '../lib/v2/generation/lesson';
import { runGenerationChecks } from '../lib/v2/generation/lesson/generationChecks';
import { MicroSchema, SpeakPromptSchema } from '../lib/v2/content/lesson';

describe('v2 generation · plan', () => {
  it('loads days 1–30 from pt-PT.days.json', () => {
    const plan = loadPlan();
    assert.equal(plan.target_lang, 'pt-PT');
    assert.equal(plan.days.length, 30);
    assert.equal(plan.days[0]!.day, 1);
    assert.equal(plan.days[29]!.day, 30);
  });

  it('day 1 has grammar-first title fields', () => {
    const plan = getDayPlan(1);
    assert.equal(plan.title_tl, 'Apresentar-se');
    assert.equal(plan.title_ar, 'تقديم نفسك');
    assert.ok(Array.isArray(plan.extra_units_tl));
    assert.ok(Array.isArray(plan.early_chunks_tl));
    assert.ok(plan.early_chunks_tl.includes('Muito prazer'));
  });

  it('day 11 is ESTAR (gold pack day)', () => {
    const plan = getDayPlan(11);
    assert.equal(plan.title_tl, 'Verbos Ser e Estar 2');
    assert.equal(plan.situation_eg, 'حاسس بإيه');
    assert.ok(plan.rule_eg.includes('ESTAR'));
    assert.equal(plan.week, 2);
  });

  it('days 1–3 are ready to generate', () => {
    for (const day of [1, 2, 3]) {
      const plan = getDayPlan(day);
      const ready = canGenerate(plan);
      assert.equal(ready.ok, true, `day ${day}: ${JSON.stringify(ready)}`);
      assert.ok((plan.generation?.new_items?.phrases?.length ?? 0) > 0);
      assert.ok((plan.generation?.page_plan?.length ?? 0) >= 4);
    }
  });

  it('day 4 is ready (core items from pt-PT.core-items.json)', () => {
    const plan = getDayPlan(4);
    const ready = canGenerate(plan);
    assert.equal(ready.ok, true, JSON.stringify(ready));
  });

  it('refuses generate when a day has no page_plan (synthetic empty day)', () => {
    // No core items + empty new_items is not enough alone — canGenerate
    // requires a page_plan. Synthetic row with neither content nor pages.
    const synthetic = {
      day: 99,
      week: 1,
      title_tl: 'Empty',
      title_ar: 'فارغ',
      situation_eg: 'مفيش',
      example_tl: '—',
      rule_eg: '—',
      extra_units_tl: [] as string[],
      early_chunks_tl: [] as string[],
      book_pages: [] as string[],
      is_story: false,
      generation: {
        new_items: { words: [] as string[], phrases: [] as string[] },
        page_plan: [] as { preset: string }[],
      },
    };
    const ready = canGenerate(synthetic);
    assert.equal(ready.ok, false);
  });
});

describe('v2 generation · system prompt', () => {
  it('contains PAGES and not PAGE STEPS', () => {
    assert.equal(systemPromptContainsPages(), true);
    const prompt = buildSystemPrompt();
    assert.ok(prompt.includes('PAGES'));
    assert.ok(!prompt.includes('PAGE STEPS'));
    assert.ok(prompt.includes('verb.<lemma>:<tense>:<person>'));
  });

  it('FORMAT is stage-aware and TEACHING RULES cover early chunks', () => {
    const prompt = buildSystemPrompt();
    assert.ok(prompt.includes('The assembled lesson has keys lesson, items, pages, questions, micro, speak_prompts'));
    assert.ok(prompt.includes('Each stage returns only the part its STAGE instructions ask for'));
    assert.ok(prompt.includes('Early chunks (early_chunks_tl) are taught as ready-made phrases'));
    assert.ok(!prompt.includes('Return a single JSON object with keys: lesson, items, pages, questions'));
  });
});

describe('v2 generation · lists', () => {
  it('nasal vowels line has õe and no U+FFFD', () => {
    assert.ok(PRONUNCIATION_TABLE.includes('ão, ãe, õe, im, om, um'));
    assert.ok(!PRONUNCIATION_TABLE.includes('\uFFFD'));
  });
});

describe('v2 generation · buildRequest', () => {
  it('day 3 request includes VERB_TABLE (verified only), PAGE_PLAN, no conjugated surface forms table', () => {
    const dayPlan = getDayPlan(3);
    const verified = verifiedLemmas();
    assert.ok(verified.includes('ser'));
    assert.ok(verified.includes('ficar'));
    assert.ok(!verified.includes('gostar'), 'gostar is unverified');

    const req = buildDayRequest({ dayPlan, knownItems: [], existingImageKeys: [] });
    assert.ok(req.includes('VERB_TABLE'));
    assert.ok(req.includes('PAGE_PLAN'));
    assert.ok(req.includes('title: Gramática Básica'));
    assert.ok(req.includes('early_chunks_tl:'));
    assert.ok(req.includes('O que é isto?'));
    assert.ok(req.includes('articles.definite'));
    assert.ok(req.includes('dictionary'));
    assert.ok(req.includes('compare'));
    assert.ok(!req.includes('GOLD EXAMPLE'), 'gold example must not be in day request');

    // early chunks merged into NEW_ITEMS.phrases
    const phrasesBlock = req.slice(req.indexOf('NEW_ITEMS'), req.indexOf('KNOWN_ITEMS'));
    assert.ok(phrasesBlock.includes('O que é isto?'));
    assert.ok(phrasesBlock.includes('Quanto custa isso?'));

    for (const lemma of verified) {
      assert.ok(req.includes(lemma), `missing verified lemma ${lemma}`);
    }

    // Must not embed conjugated paradigms (eu sou / tu és …) — lemmas only
    assert.ok(!/eu:\s*sou/i.test(req));
    assert.ok(!req.includes('verb.ser:pres:eu'));
  });

  it('merges early chunks into phrases without duplicating near-matches', () => {
    const merged = mergePhrasesWithEarlyChunks(
      ['Muito prazer!', 'Olá!'],
      ['Muito prazer', 'Gosto de café'],
    );
    assert.deepEqual(merged, ['Muito prazer!', 'Olá!', 'Gosto de café']);
  });

  it('compact DAY header has the required fields', () => {
    const header = formatCompactDayHeader(getDayPlan(2));
    assert.ok(header.startsWith('DAY\n'));
    assert.ok(header.includes('day: 2'));
    assert.ok(header.includes('title_tl: Conversação Básica'));
    assert.ok(header.includes('title_ar:'));
    assert.ok(header.includes('situation_eg:'));
    assert.ok(header.includes('rule_eg:'));
    assert.ok(header.includes('grammar_focus:'));
    assert.ok(header.includes('early_chunks_tl:'));
    assert.ok(header.includes('Gosto de café'));
    assert.ok(header.includes('chat_character: manuel'));
  });
});

describe('v2 generation · strict validator on day1-shaped fixture', () => {
  it('minimal 4-page pack with valid refs passes strict mode', () => {
    const pack = minimalDayPack(1);
    const parsed = LessonPackSchema.safeParse(pack);
    assert.equal(
      parsed.success,
      true,
      parsed.success ? '' : parsed.error.message,
    );
    if (!parsed.success) return;
    const result = validateLessonPack(parsed.data, { mode: 'strict' });
    assert.equal(
      hasErrors(result),
      false,
      result.issues.map((i) => `${i.severity}:${i.rule}:${i.path}:${i.message}`).join(' | '),
    );
  });

  it('bad form id fails strict mode', () => {
    const pack = minimalDayPack(1);
    const page = pack.pages[0]!;
    const cards = page.blocks.find((b) => b.type === 'cards');
    assert.ok(cards && cards.type === 'cards');
    cards.items[0] = 'verb.ser:pres:vós';
    const result = validateLessonPack(pack as LessonPack, { mode: 'strict' });
    assert.ok(
      result.issues.some((i) => i.rule === 'bad_form_id' || i.rule === 'bad_ref'),
      JSON.stringify(result.issues),
    );
  });

  it('generation checks warn on Brazilian forms', () => {
    const pack = minimalDayPack(1);
    pack.items[0] = {
      ...(pack.items[0] as object),
      tl: 'O ônibus chegou.',
    } as LessonPack['items'][number];
    const warnings = runGenerationChecks(pack as LessonPack);
    assert.ok(warnings.some((w) => w.rule === 'brazilian'));
  });
});

describe('v2 generation · gold example still loads', () => {
  it('day06 example parses after LessonPackSchema micro fields', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'examples/day06-example.json'), 'utf8'),
    );
    const parsed = LessonPackSchema.parse(raw);
    assert.equal(parsed.lesson.day, 11);
  });

  it('day03-generated micro and speak_prompts match schemas', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'examples/day03-generated.json'), 'utf8'),
    );
    const micro = MicroSchema.parse(raw.micro);
    assert.equal(micro.morning.phrase, 'phrase.where_is_milk');
    const speak = SpeakPromptSchema.array().min(3).max(4).parse(raw.speak_prompts);
    assert.ok(speak.length >= 3);
  });

  for (const day of [1, 2, 3]) {
    it(`day${String(day).padStart(2, '0')} gold passes strict validation`, () => {
      const raw = JSON.parse(
        readFileSync(
          resolve(process.cwd(), `examples/day${String(day).padStart(2, '0')}-example.json`),
          'utf8',
        ),
      );
      const parsed = LessonPackSchema.parse(raw);
      const result = validateLessonPack(parsed, { mode: 'strict' });
      assert.equal(hasErrors(result), false, JSON.stringify(result.issues));
    });
  }
});

function minimalDayPack(day: number): LessonPack {
  return {
    lesson: {
      id: `pt-PT.d${String(day).padStart(2, '0')}`,
      target_lang: 'pt-PT',
      day,
      phase: 1,
      week: 1,
      kind: 'lesson',
      situation: { tl: 'Olá', eg: 'أهلا' },
      can_do: [{ eg: 'تسلم', proves: ['phrase.hello'] }],
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
        type: 'sentence',
        id: 'sentence.pleasure',
        tl: 'Muito prazer!',
        ar: 'تشرفت.',
        say: 'مويتو پرازير',
        marks: [{ text: 'prazer', group: 'neutral' }],
      },
    ],
    pages: [
      staticPage('p1', 'phrases', 'phrase.hello', 'phrase.my_name'),
      guidedPage('p2', 'pattern', 'phrase.my_name', 'sentence.pleasure'),
      staticPage('p3', 'dictionary', 'word.nome'),
      staticPage('p4', 'phrases', 'phrase.hello'),
    ],
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        skill: 'reading',
        tests: ['phrase.hello'],
        prompt: [{ text: 'إيه معنى Olá؟', lang: 'eg' }],
        options: [
          { label: [{ text: 'مرحبا', lang: 'ar' }], correct: true },
          { label: [{ text: 'وداعا', lang: 'ar' }], correct: false },
        ],
      },
    ],
  };
}

function guidedPage(
  id: string,
  preset: 'phrases' | 'pattern',
  refA: string,
  refB: string,
): LessonPack['pages'][number] {
  const blocks = [
    {
      id: 'b1',
      type: 'heading' as const,
      text: [{ text: 'جمل', lang: 'eg' as const }],
    },
    {
      id: 'b2',
      type: 'cards' as const,
      items: [refA, refB],
    },
    {
      id: 'b3',
      type: 'tip' as const,
      kind: 'rule' as const,
      title: [{ text: 'ملاحظة', lang: 'eg' as const }],
      body: [{ text: 'الضمير بعد الفعل', lang: 'eg' as const }],
    },
  ];
  const steps = [
    { target: 'b1', kind: 'reveal' as const, tip: [{ text: 'شوف العنوان', lang: 'eg' as const }] },
    { target: 'b2', kind: 'reveal' as const, tip: [{ text: 'الجمل', lang: 'eg' as const }] },
    { target: 'b3', kind: 'reveal' as const, tip: [{ text: 'الملاحظة', lang: 'eg' as const }] },
    {
      target: 'b2',
      kind: 'ask' as const,
      ask: {
        question: [{ text: 'إيه أول جملة؟', lang: 'eg' as const }],
        options: [
          { label: [{ text: 'Olá!', lang: 'tl' as const }], correct: true },
          { label: [{ text: 'Adeus!', lang: 'tl' as const }], correct: false },
        ],
      },
    },
    { target: 'b2', kind: 'reveal' as const, tip: [{ text: 'كمل', lang: 'eg' as const }] },
    { target: 'b2', kind: 'reveal' as const, tip: [{ text: 'كمل تاني', lang: 'eg' as const }] },
    { target: 'b2', kind: 'reveal' as const, tip: [{ text: 'كمل تالت', lang: 'eg' as const }] },
    {
      target: 'b2',
      kind: 'ask' as const,
      ask: {
        question: [{ text: 'Chamo-me معناها إيه؟', lang: 'eg' as const }],
        options: [
          { label: [{ text: 'اسمي', lang: 'ar' as const }], correct: true },
          { label: [{ text: 'شكرا', lang: 'ar' as const }], correct: false },
        ],
      },
    },
    { target: 'b3', kind: 'reveal' as const, tip: [{ text: 'راجع', lang: 'eg' as const }] },
    { target: 'b1', kind: 'reveal' as const, tip: [{ text: 'راجع تاني', lang: 'eg' as const }] },
    { target: 'b2', kind: 'reveal' as const, tip: [{ text: 'آخر جملة', lang: 'eg' as const }] },
    {
      target: 'b2',
      kind: 'ask' as const,
      ask: {
        question: [{ text: 'الحمد لله خلصنا؟', lang: 'eg' as const }],
        options: [
          { label: [{ text: 'أيوه', lang: 'eg' as const }], correct: true },
          { label: [{ text: 'لأ', lang: 'eg' as const }], correct: false },
        ],
      },
    },
  ];
  return {
    id,
    preset,
    mode: 'guided' as const,
    title: [{ text: id, lang: 'tl' }],
    blocks,
    steps,
  };
}

function staticPage(
  id: string,
  preset: 'dictionary' | 'phrases',
  ref: string,
  refB?: string,
): LessonPack['pages'][number] {
  return {
    id,
    preset,
    mode: 'static',
    title: [{ text: id, lang: 'tl' }],
    blocks: [
      {
        id: 'b1',
        type: 'heading',
        text: [{ text: 'صفحة', lang: 'eg' }],
      },
      {
        id: 'b2',
        type: 'cards',
        items: refB ? [ref, refB] : [ref],
      },
    ],
  };
}
