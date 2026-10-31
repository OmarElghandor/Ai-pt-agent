import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  modeForPreset,
  PageSchema,
  type Page,
} from '../lib/v2/content/page';
import { validateLessonPack } from '../lib/v2/content/validate';
import type { LessonPack } from '../lib/v2/content/lesson';
import { fillSectionsCheck } from '../lib/v2/generation/lesson/stages/assemble';
import { buildAfterQuestions } from '../lib/v2/generation/lesson/storyCodeEnrich';
import type { StoryDoc } from '../lib/v2/content/story';
import type { Item } from '../lib/v2/content/items';

describe('modeForPreset sections', () => {
  it('maps compare, pattern, conjugation to sections', () => {
    assert.equal(modeForPreset('compare'), 'sections');
    assert.equal(modeForPreset('pattern'), 'sections');
    assert.equal(modeForPreset('conjugation'), 'sections');
    assert.equal(modeForPreset('phrases'), 'static');
  });
});

const day1Pattern: Page = {
  id: 'p1_pattern',
  preset: 'pattern',
  mode: 'sections',
  title: [{ text: 'Chamo-me', lang: 'tl' }],
  explain: [
    { text: 'بنقول ', lang: 'eg' },
    { text: 'Chamo-me', lang: 'tl', bold: true },
    { text: ' وبعدين الاسم. دي التركيبة.', lang: 'eg' },
  ],
  check: ['q.rule.1', 'q.rule.2'],
  blocks: [
    {
      id: 'b1',
      type: 'formula',
      pattern: 'pattern.chamo_me',
      examples: [
        'phrase.chamo_omar',
        'phrase.chamo_ines',
        'phrase.chamo_rita',
      ],
    },
    {
      id: 'b2',
      type: 'examples',
      items: [
        { ref: 'phrase.chamo_omar' },
        { ref: 'phrase.chamo_ines' },
        { ref: 'phrase.chamo_rita' },
      ],
    },
    {
      id: 'b3',
      type: 'tip',
      kind: 'rule',
      title: [{ text: 'خد بالك', lang: 'eg' }],
      body: [{ text: 'متلصقهاش', lang: 'eg' }],
    },
  ],
};

const day3Compare: Page = {
  id: 'p2_compare',
  preset: 'compare',
  mode: 'sections',
  title: [{ text: 'o / a', lang: 'tl' }],
  explain: [
    { text: 'الأدوات بتتغيّر مع الجنس. ', lang: 'eg' },
    { text: 'o', lang: 'tl', bold: true },
    { text: ' للمذكر و ', lang: 'eg' },
    { text: 'a', lang: 'tl', bold: true },
    { text: ' للمؤنث.', lang: 'eg' },
  ],
  check: ['q.cmp.1', 'q.cmp.2', 'q.cmp.3'],
  blocks: [
    {
      id: 'b1',
      type: 'compare',
      columns: [
        {
          head: [{ text: 'o', lang: 'tl' }],
          group: 'a',
          entries: [{ ref: 'food.bread', label: [{ text: 'o pão', lang: 'tl' }] }],
        },
        {
          head: [{ text: 'a', lang: 'tl' }],
          group: 'b',
          entries: [{ ref: 'food.water', label: [{ text: 'a água', lang: 'tl' }] }],
        },
      ],
    },
  ],
};

describe('sections page fixtures', () => {
  it('parses day 1 pattern and day 3 compare as sections', () => {
    assert.equal(PageSchema.parse(day1Pattern).mode, 'sections');
    assert.equal(PageSchema.parse(day3Compare).mode, 'sections');
    assert.ok(!day1Pattern.steps?.length);
    assert.ok((day1Pattern.explain?.length ?? 0) >= 1);
    assert.ok((day1Pattern.check?.length ?? 0) >= 2);
  });

  it('fillSectionsCheck assigns question ids', () => {
    const pages = fillSectionsCheck(
      [{ ...day1Pattern, check: undefined }],
      [
        {
          id: 'q.rule.1',
          type: 'mcq',
          skill: 'reading',
          page_index: 0,
          prompt: {},
        },
        {
          id: 'q.rule.2',
          type: 'mcq',
          skill: 'reading',
          page_index: 0,
          prompt: {},
        },
        {
          id: 'q.rule.3',
          type: 'mcq',
          skill: 'reading',
          page_index: 0,
          prompt: {},
        },
      ],
    );
    assert.deepEqual(pages[0]!.check, ['q.rule.1', 'q.rule.2', 'q.rule.3']);
  });

  it('validateLessonPack accepts sections pattern with check + examples', () => {
    const pack: LessonPack = {
      lesson: {
        id: 'pt-PT.d01',
        target_lang: 'pt-PT',
        day: 1,
        kind: 'lesson',
        pages: [day1Pattern.id],
      },
      items: [
        {
          type: 'phrase',
          id: 'phrase.chamo_omar',
          tl: 'Chamo-me Omar.',
          ar: 'اسمي عمر.',
          say: 'شامو مي عمر',
        },
        {
          type: 'phrase',
          id: 'phrase.chamo_ines',
          tl: 'Chamo-me Inês.',
          ar: 'اسمي إينيس.',
          say: 'شامو مي إينيس',
        },
        {
          type: 'phrase',
          id: 'phrase.chamo_rita',
          tl: 'Chamo-me Rita.',
          ar: 'اسمي ريتا.',
          say: 'شامو مي ريتا',
        },
        {
          type: 'pattern',
          id: 'pattern.chamo_me',
          slots: [{ tl: 'Chamo-me' }, { name_eg: 'الاسم' }],
          examples: [
            'phrase.chamo_omar',
            'phrase.chamo_ines',
            'phrase.chamo_rita',
          ],
        } as Item,
      ],
      pages: [day1Pattern],
      questions: [
        {
          id: 'q.rule.1',
          type: 'mcq',
          skill: 'reading',
          page_index: 0,
          prompt: {},
          options: [[{ text: 'a', lang: 'tl' }], [{ text: 'b', lang: 'tl' }]],
          answer: 0,
        },
        {
          id: 'q.rule.2',
          type: 'mcq',
          skill: 'reading',
          page_index: 0,
          prompt: {},
          options: [[{ text: 'a', lang: 'tl' }], [{ text: 'b', lang: 'tl' }]],
          answer: 0,
        },
      ],
    };
    const result = validateLessonPack(pack, { mode: 'normal' });
    const sectionsIssues = result.issues.filter((i) =>
      i.rule.startsWith('sections_'),
    );
    assert.equal(sectionsIssues.length, 0, JSON.stringify(sectionsIssues));
  });
});

describe('after_questions builder', () => {
  it('builds ≥3 after_questions for a short dialogue', () => {
    const story: Pick<StoryDoc, 'cast' | 'lines'> = {
      cast: [
        { id: 'learner', name: 'Omar', role: 'learner' },
        { id: 'ines', name: 'Inês', role: 'character' },
      ],
      lines: [
        { speaker: 'ines', tl: 'Tudo bem?', ar: 'كل حاجة تمام؟', ids: [] },
        {
          speaker: 'learner',
          tl: 'Tudo bem.',
          ar: 'تمام.',
          ids: [],
          replies_to: 0,
        },
        { speaker: 'ines', tl: 'Como se chama?', ar: 'اسمك إيه؟', ids: [] },
        {
          speaker: 'learner',
          tl: 'Chamo-me Omar.',
          ar: 'اسمي عمر.',
          ids: ['phrase.chamo_omar'],
          replies_to: 2,
        },
      ],
    };
    const items: Item[] = [
      {
        type: 'phrase',
        id: 'phrase.chamo_omar',
        tl: 'Chamo-me Omar.',
        ar: 'اسمي عمر.',
        say: 'x',
        role: 'said',
      } as Item,
      {
        type: 'phrase',
        id: 'phrase.tudo_bem',
        tl: 'Tudo bem.',
        ar: 'تمام.',
        say: 'x',
        role: 'said',
      } as Item,
    ];
    const qs = buildAfterQuestions({ story, items });
    assert.ok(qs.length >= 3);
    assert.ok(qs.some((q) => q.kind === 'character_asked'));
    assert.ok(qs.some((q) => q.kind === 'learner_replied'));
    assert.ok(qs.some((q) => q.kind === 'line_meaning'));
  });
});
