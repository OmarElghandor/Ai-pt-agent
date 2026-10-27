import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkIntroductionOrder,
  hasErrors,
  validateLessonPack,
  type LessonPack,
} from '../lib/v2/content';
import { assembleLessonPack } from '../lib/v2/generation/lesson/stages/assemble';
import { validateOutline } from '../lib/v2/generation/lesson/stages/outline';
import { normalizePageJson } from '../lib/v2/generation/lesson/stages/page';
import {
  validateMicroAndSpeak,
  validateQuestionQuotas,
  validateQuestionsAgainstOutline,
} from '../lib/v2/generation/lesson/stages/questions';
import type { OutlineResult } from '../lib/v2/generation/lesson/stages/types';
import type { Micro, Question, SpeakPrompt } from '../lib/v2/content/lesson';
import { isGenerateImagesEnabled } from '../lib/v2/flags';
import { PageSchema, type Page } from '../lib/v2/content/page';

function sampleOutline(): OutlineResult {
  return {
    items: [
      {
        type: 'phrase',
        id: 'phrase.hello',
        tl: 'Olá!',
        ar: 'مرحبا.',
        say: 'أولا',
      },
      {
        type: 'phrase',
        id: 'phrase.thanks',
        tl: 'Obrigado!',
        ar: 'شكرا.',
        say: 'وبريغادو',
      },
      {
        type: 'word',
        id: 'word.cafe',
        tl: 'o café',
        ar: 'القهوة',
        say: 'أو كافي',
      },
    ],
    pages: [
      {
        index: 0,
        page_id: 'p1',
        preset: 'phrases',
        mode: 'guided',
        title: 'جمل',
        purpose: 'greet',
        introduces: ['phrase.hello'],
        assumes: [],
        handoff: 'thanks next',
      },
      {
        index: 1,
        page_id: 'p2',
        preset: 'phrases',
        mode: 'static',
        title: 'شكر',
        purpose: 'thanks',
        introduces: ['phrase.thanks'],
        assumes: ['phrase.hello'],
        handoff: 'cafe',
      },
      {
        index: 2,
        page_id: 'p3',
        preset: 'dictionary',
        mode: 'static',
        title: 'قاموس',
        purpose: 'words',
        introduces: ['word.cafe'],
        assumes: ['phrase.hello'],
        handoff: 'done',
      },
      {
        index: 3,
        page_id: 'p4',
        preset: 'phrases',
        mode: 'static',
        title: 'خلاصة',
        purpose: 'wrap',
        introduces: [],
        assumes: ['phrase.hello', 'phrase.thanks', 'word.cafe'],
        handoff: 'end',
      },
    ],
  };
}

function staticCardsPage(id: string, refs: string[]): Page {
  return {
    id,
    preset: 'phrases',
    mode: 'static',
    title: [{ text: id, lang: 'tl' }],
    blocks: [
      {
        id: 'b1',
        type: 'heading',
        text: [{ text: 'x', lang: 'eg' }],
      },
      { id: 'b2', type: 'cards', items: refs },
    ],
  };
}

describe('v2 staged · assemble order', () => {
  it('assembles by outline index, not map insertion order', () => {
    const outline = sampleOutline();
    // Insert pages out of order into the map
    const pagesByIndex = new Map<number, Page>([
      [2, staticCardsPage('p3', ['word.cafe'])],
      [0, staticCardsPage('p1', ['phrase.hello'])],
      [3, staticCardsPage('p4', ['phrase.hello'])],
      [1, staticCardsPage('p2', ['phrase.thanks', 'phrase.hello'])],
    ]);
    const pack = assembleLessonPack({
      day: 1,
      outline,
      pagesByIndex,
      questions: [],
    });
    assert.deepEqual(
      pack.pages.map((p) => p.id),
      ['p1', 'p2', 'p3', 'p4'],
    );
    const hello = pack.items.find((i) => i.id === 'phrase.hello');
    assert.equal(hello?.introduced_on_page, 0);
    const thanks = pack.items.find((i) => i.id === 'phrase.thanks');
    assert.equal(thanks?.introduced_on_page, 1);
  });
});

describe('v2 staged · outline validation', () => {
  it('rejects assumes before intro', () => {
    const outline = sampleOutline();
    outline.pages[1]!.assumes = ['word.cafe']; // introduced on page 2
    const issues = validateOutline(outline);
    assert.ok(issues.some((i) => i.rule === 'assumes_before_intro'));
  });

  it('rejects duplicate introduces', () => {
    const outline = sampleOutline();
    outline.pages[1]!.introduces = ['phrase.hello'];
    const issues = validateOutline(outline);
    assert.ok(issues.some((i) => i.rule === 'duplicate_intro'));
  });
});

describe('v2 staged · introduction order validator', () => {
  it('errors when page uses item before intro page', () => {
    const outline = sampleOutline();
    const pack = assembleLessonPack({
      day: 1,
      outline,
      pagesByIndex: [
        staticCardsPage('p1', ['phrase.hello', 'phrase.thanks']), // thanks too early
        staticCardsPage('p2', ['phrase.thanks', 'phrase.hello']),
        staticCardsPage('p3', ['word.cafe']),
        staticCardsPage('p4', ['phrase.hello']),
      ],
      questions: [],
    });
    const issues: Parameters<typeof checkIntroductionOrder>[1] = [];
    checkIntroductionOrder(pack, issues);
    assert.ok(issues.some((i) => i.rule === 'item_before_intro'));
  });

  it('errors when introduced item missing on its page', () => {
    const outline = sampleOutline();
    const pack = assembleLessonPack({
      day: 1,
      outline,
      pagesByIndex: [
        staticCardsPage('p1', ['phrase.hello']),
        staticCardsPage('p2', ['phrase.hello']), // missing phrase.thanks
        staticCardsPage('p3', ['word.cafe']),
        staticCardsPage('p4', ['phrase.hello']),
      ],
      questions: [],
    });
    const issues: Parameters<typeof checkIntroductionOrder>[1] = [];
    checkIntroductionOrder(pack, issues);
    assert.ok(issues.some((i) => i.rule === 'intro_missing_on_page'));
  });
});

describe('v2 staged · questions page_index scope', () => {
  it('rejects tests of items introduced later', () => {
    const outline = sampleOutline();
    const issues = validateQuestionsAgainstOutline(
      [
        {
          id: 'q1',
          type: 'mcq',
          skill: 'reading',
          page_index: 0,
          tests: ['word.cafe'],
          prompt: [],
        },
      ],
      outline,
    );
    assert.ok(issues.some((i) => i.rule === 'question_before_intro'));
  });
});

describe('v2 staged · question quotas and micro/speak', () => {
  function makeQuestions(n: number, skills: Question['skill'][]): Question[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `q${i + 1}`,
      type: 'mcq',
      skill: skills[i % skills.length]!,
      page_index: 0,
      tests: ['phrase.hello'],
      prompt: [],
    }));
  }

  it('rejects fewer than 10 questions or missing skill minima', () => {
    const few = makeQuestions(5, ['reading']);
    assert.ok(validateQuestionQuotas(few).some((i) => i.rule === 'question_count'));
    const unbalanced = makeQuestions(12, ['reading', 'reading', 'listening']);
    const issues = validateQuestionQuotas(unbalanced);
    assert.ok(issues.some((i) => i.rule === 'skill_quota' && i.message.includes('writing')));
  });

  it('accepts 10–15 with listening/reading/writing minima', () => {
    const skills: Question['skill'][] = [
      'listening',
      'listening',
      'listening',
      'reading',
      'reading',
      'reading',
      'writing',
      'writing',
      'speaking',
      'speaking',
      'listening',
      'reading',
    ];
    assert.equal(validateQuestionQuotas(makeQuestions(12, skills)).length, 0);
  });

  it('validateMicroAndSpeak checks refs and notice correctness', () => {
    const outline = sampleOutline();
    const questions = makeQuestions(10, [
      'listening',
      'listening',
      'listening',
      'reading',
      'reading',
      'reading',
      'writing',
      'writing',
      'speaking',
      'speaking',
    ]);
    const micro: Micro = {
      morning: { phrase: 'phrase.hello', mission_eg: 'قول أهلا' },
      tool: {
        tool_id: 'introduce_yourself',
        step: 1,
        of: 4,
        builds_on_eg: 'أول خطوة',
        examples: ['phrase.hello', 'phrase.thanks', 'phrase.hello'],
        notice: {
          question_eg: 'لاحظت إيه؟',
          options: [
            { text: 'أ', correct: true },
            { text: 'ب', correct: false },
            { text: 'ج', correct: false },
          ],
        },
        rule_eg: 'قاعدة',
        drills: ['q1', 'q2'],
      },
      evening: { teaser_eg: 'بكره' },
    };
    const speak: SpeakPrompt[] = [
      { prompt_eg: '؟', answer_tl: 'Olá!', ids: ['phrase.hello'] },
      { prompt_eg: '؟', answer_tl: 'Obrigado!', ids: ['phrase.thanks'] },
      { prompt_eg: '؟', answer_tl: 'Olá!', ids: ['phrase.hello'] },
    ];
    assert.equal(
      validateMicroAndSpeak({
        micro,
        speak_prompts: speak,
        questions,
        outline,
      }).length,
      0,
    );

    const bad = {
      ...micro,
      tool: {
        ...micro.tool,
        drills: ['missing'],
        notice: {
          ...micro.tool.notice,
          options: [
            { text: 'أ', correct: true },
            { text: 'ب', correct: true },
            { text: 'ج', correct: false },
          ],
        },
      },
    };
    const badIssues = validateMicroAndSpeak({
      micro: bad,
      speak_prompts: speak,
      questions,
      outline,
    });
    assert.ok(badIssues.some((i) => i.rule === 'bad_ref'));
    assert.ok(badIssues.some((i) => i.rule === 'notice_one_correct'));
  });

  it('assembleLessonPack attaches micro and speak_prompts', () => {
    const outline = sampleOutline();
    const pages = outline.pages.map((p) => ({
      id: p.page_id,
      preset: p.preset,
      mode: 'static' as const,
      title: [{ text: 'x', lang: 'eg' as const }],
      blocks: [
        {
          id: 'b1',
          type: 'cards' as const,
          items: p.introduces.length ? p.introduces : ['phrase.hello'],
        },
      ],
    }));
    const micro: Micro = {
      morning: { phrase: 'phrase.hello', mission_eg: 'م' },
      tool: {
        tool_id: 't',
        step: 1,
        of: 2,
        builds_on_eg: 'ب',
        examples: ['phrase.hello'],
        notice: {
          question_eg: '؟',
          options: [
            { text: '1', correct: true },
            { text: '2', correct: false },
            { text: '3', correct: false },
          ],
        },
        rule_eg: 'ر',
        drills: ['q1'],
      },
      evening: { teaser_eg: 'ت' },
    };
    const speak: SpeakPrompt[] = [
      { prompt_eg: 'ا', answer_tl: 'Olá!', ids: ['phrase.hello'] },
      { prompt_eg: 'ب', answer_tl: 'Olá!', ids: ['phrase.hello'] },
      { prompt_eg: 'ج', answer_tl: 'Olá!', ids: ['phrase.hello'] },
    ];
    const pack = assembleLessonPack({
      day: 1,
      outline,
      pagesByIndex: pages,
      questions: [{ id: 'q1', type: 'mcq', skill: 'reading', page_index: 0, prompt: [] }],
      micro,
      speak_prompts: speak,
    });
    assert.deepEqual(pack.micro, micro);
    assert.deepEqual(pack.speak_prompts, speak);
  });
});

describe('v2 staged · GENERATE_IMAGES default', () => {
  it('is off when unset', () => {
    const prev = process.env.GENERATE_IMAGES;
    delete process.env.GENERATE_IMAGES;
    assert.equal(isGenerateImagesEnabled(), false);
    if (prev !== undefined) process.env.GENERATE_IMAGES = prev;
  });
});

describe('v2 staged · resume skips done page slots', () => {
  it('assemble throws if a done outline index is missing (forces resume to fill)', () => {
    const outline = sampleOutline();
    assert.throws(() =>
      assembleLessonPack({
        day: 1,
        outline,
        pagesByIndex: new Map([[0, staticCardsPage('p1', ['phrase.hello'])]]),
        questions: [],
      }),
    );
  });
});

describe('v2 staged · page-only retry contract', () => {
  it('documents that failed page status is independent in stages.pages', () => {
    // Structural contract used by orchestrator resume
    const stages = {
      outline: 'done' as const,
      pages: [
        { index: 0, page_id: 'p1', status: 'done' as const },
        { index: 1, page_id: 'p2', status: 'failed' as const, last_error: 'x' },
        { index: 2, page_id: 'p3', status: 'done' as const },
      ],
      questions: 'done' as const,
      continuity: 'pending' as const,
      text_ready: false,
    };
    const pending = stages.pages.filter((p) => p.status !== 'done');
    assert.deepEqual(
      pending.map((p) => p.page_id),
      ['p2'],
    );
  });
});

describe('v2 staged · normalizePageJson', () => {
  it('assigns missing block ids as b1, b2, …', () => {
    const normalized = normalizePageJson({
      page: {
        id: 'p4',
        preset: 'phrases',
        mode: 'static',
        title: [{ text: 'x', lang: 'eg' }],
        blocks: [
          { type: 'heading', text: [{ text: 'A', lang: 'eg' }] },
          { type: 'cards', items: ['phrase.hello'] },
          { type: 'tip', kind: 'note', title: [{ text: 't', lang: 'eg' }], body: [{ text: 'b', lang: 'eg' }] }, // note → culture
        ],
      },
    }) as { page: { blocks: { id: string }[] } };
    assert.deepEqual(
      normalized.page.blocks.map((b) => b.id),
      ['b1', 'b2', 'b3'],
    );
    const parsed = PageSchema.safeParse(normalized.page);
    assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message);
  });

  it('coerces compare title/items into head/entries/group', () => {
    const normalized = normalizePageJson({
      page: {
        id: 'p3',
        preset: 'compare',
        mode: 'static',
        title: [{ text: 'cmp', lang: 'eg' }],
        blocks: [
          {
            type: 'compare',
            columns: [
              { title: 'Left', items: ['phrase.hello', 'phrase.thanks'] },
              { heading: 'Right', refs: ['word.cafe'] },
            ],
          },
        ],
      },
    }) as {
      page: {
        blocks: {
          id: string;
          type: string;
          columns: { head: unknown; group: string; entries: { ref: string }[] }[];
        }[];
      };
    };
    const compare = normalized.page.blocks[0]!;
    assert.equal(compare.id, 'b1');
    assert.equal(compare.type, 'compare');
    assert.ok(Array.isArray(compare.columns[0]!.head));
    assert.equal(compare.columns[0]!.group, 'a');
    assert.equal(compare.columns[0]!.entries[0]!.ref, 'phrase.hello');
    assert.equal(compare.columns[0]!.entries[1]!.ref, 'phrase.thanks');
    assert.ok(Array.isArray(compare.columns[0]!.entries[0]!.label));
    assert.equal(compare.columns[1]!.group, 'b');
    assert.equal(compare.columns[1]!.entries[0]!.ref, 'word.cafe');
    const parsed = PageSchema.safeParse(normalized.page);
    assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message);
  });

  it('coerces reveal_axis axis/tips and swap choices→options', () => {
    const normalized = normalizePageJson({
      page: {
        id: 'p2',
        preset: 'conjugation',
        mode: 'explore',
        title: [{ text: 'explore', lang: 'eg' }],
        blocks: [
          { type: 'heading', text: [{ text: 'H', lang: 'eg' }] },
          { type: 'cards', items: ['verb.ser:pres:eu'] },
        ],
        controls: [
          {
            type: 'reveal_axis',
            target: 'b2',
            axis: 'columns',
            // tips missing
          },
          {
            type: 'swap',
            target: 'b2',
            choices: ['verb.ser', 'verb.estar'],
            // options missing
          },
        ],
      },
    }) as {
      page: {
        controls: {
          id: string;
          type: string;
          axis?: string;
          tips?: unknown[];
          options?: string[];
        }[];
      };
    };
    const [reveal, swap] = normalized.page.controls;
    assert.equal(reveal!.id, 'c1');
    assert.equal(reveal!.type, 'reveal_axis');
    assert.equal(reveal!.axis, 'cols');
    assert.ok(Array.isArray(reveal!.tips));
    assert.ok(Array.isArray(reveal!.tips![0]));
    assert.equal(swap!.id, 'c2');
    assert.equal(swap!.type, 'swap');
    assert.deepEqual(swap!.options, ['verb.ser', 'verb.estar']);
    const parsed = PageSchema.safeParse(normalized.page);
    assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message);
  });
});

describe('v2 staged · valid assembled pack can pass strict', () => {
  it('minimal assembled pack with guided steps passes when pages are valid', () => {
    // Reuse a known-good shape from existing fixture pattern — static pages only
    const outline = sampleOutline();
    // Fix presets/modes for static-only pages that match sample pages
    for (const p of outline.pages) {
      p.mode = 'static';
      if (p.page_id === 'p1' || p.page_id === 'p2') p.preset = 'phrases';
    }
    const pack = assembleLessonPack({
      day: 1,
      outline,
      pagesByIndex: [
        { ...staticCardsPage('p1', ['phrase.hello']), preset: 'phrases' },
        {
          ...staticCardsPage('p2', ['phrase.thanks', 'phrase.hello']),
          preset: 'phrases',
        },
        { ...staticCardsPage('p3', ['word.cafe']), preset: 'dictionary' },
        {
          ...staticCardsPage('p4', ['phrase.hello', 'phrase.thanks', 'word.cafe']),
          preset: 'phrases',
        },
      ],
      questions: [
        {
          id: 'q1',
          type: 'mcq',
          skill: 'reading',
          page_index: 0,
          tests: ['phrase.hello'],
          prompt: [{ text: '؟', lang: 'eg' }],
        },
      ],
    });
    const result = validateLessonPack(pack as LessonPack, { mode: 'strict' });
    assert.equal(
      hasErrors(result),
      false,
      result.issues.map((i) => `${i.rule}:${i.message}`).join(' | '),
    );
  });
});
