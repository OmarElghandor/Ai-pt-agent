import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import type { LessonPack } from '../lib/v2/content/lesson';
import type { Page } from '../lib/v2/content/page';
import { buildDayStepsFromPack } from '../lib/v2/progress/daySteps';

function rt(text: string) {
  return [{ text, lang: 'eg' as const }];
}

function page(
  id: string,
  opts: {
    preset?: Page['preset'];
    mode?: Page['mode'];
    title?: string;
    pill?: string;
    role?: Page['role'];
    story_id?: string;
  } = {},
): Page {
  const preset = opts.preset ?? 'vocab_flow';
  const isStory = preset === 'story';
  return {
    id,
    preset,
    mode: opts.mode ?? (isStory ? 'static' : 'sections'),
    title: rt(opts.title ?? id),
    pill: opts.pill,
    role: opts.role,
    story_id: opts.story_id ?? (isStory ? 'story.day-3' : undefined),
    blocks: isStory
      ? []
      : [
          {
            id: `${id}.b1`,
            type: 'heading',
            text: rt(opts.title ?? id),
          },
        ],
  } as Page;
}

function phrase(id: string, tl: string): Item {
  return {
    type: 'phrase',
    id,
    tl,
    ar: `معنى ${tl}`,
    context_eg: 'سياق',
    cloze: tl.split(/\s+/)[0] ?? tl,
  };
}

function pack(opts: {
  withFindImage: boolean;
  withScene?: boolean;
}): LessonPack {
  const items: Item[] = opts.withFindImage
    ? [
        phrase('phrase.a', 'Olá'),
        phrase('phrase.b', 'Bom dia'),
        phrase('phrase.c', 'Boa tarde'),
        phrase('phrase.d', 'Boa noite'),
      ]
    : [phrase('phrase.a', 'Olá')];

  const pages: Page[] = [
    page('story', { preset: 'story', title: 'في المقهى', story_id: 's3' }),
    page('vocab', { title: 'كلمات', pill: 'مفردات' }),
    page('grammar', { title: 'القاعدة', pill: 'قواعد', mode: 'sections' }),
  ];
  if (opts.withScene) {
    pages.splice(1, 0, page('scene_old', { preset: 'scene', title: 'مشهد' }));
  }

  return {
    lesson: {
      id: 'pt-PT.day-3',
      target_lang: 'pt-PT',
      day: 3,
      kind: 'lesson',
      pages: pages.map((p) => p.id),
      situation: { tl: 'No café', eg: 'في المقهى' },
    },
    items,
    pages,
    questions: [
      {
        id: 'q1',
        type: 'say_it',
        skill: 'speaking',
        prompt: 'x',
      },
    ],
  };
}

describe('S1 · shared day-step list', () => {
  it('orders story → pages → find_image → questions → practice when find_image is visible', () => {
    const result = buildDayStepsFromPack({
      day: 3,
      pack: pack({ withFindImage: true }),
      hasPublishedPack: true,
    });
    assert.deepEqual(
      result.displaySteps.map((s) => s.id),
      ['story', 'vocab', 'grammar', 'find_image', 'day_questions', 'practice'],
    );
    assert.deepEqual(
      result.displaySteps.map((s) => s.kind),
      ['page', 'page', 'page', 'find_image', 'questions', 'practice'],
    );
    assert.equal(result.questionsAfterId, 'find_image');
    assert.equal(result.unlockAfter, 'day_questions');
    const find = result.steps.find((s) => s.id === 'find_image');
    assert.equal(find?.present, true);
    assert.equal(find?.counted, true);
    assert.equal(find?.href, '/day/3/find-image');
  });

  it('hides find_image from display when not eligible, marks it absent for open', () => {
    const result = buildDayStepsFromPack({
      day: 3,
      pack: pack({ withFindImage: false }),
      hasPublishedPack: true,
    });
    assert.deepEqual(
      result.displaySteps.map((s) => s.id),
      ['story', 'vocab', 'grammar', 'day_questions', 'practice'],
    );
    const find = result.steps.find((s) => s.id === 'find_image');
    assert.ok(find);
    assert.equal(find.present, false);
    assert.equal(find.counted, false);
    assert.equal(
      result.openSteps.find((s) => s.id === 'find_image')?.present,
      false,
    );
    assert.equal(result.questionsAfterId, 'grammar');
  });

  it('keeps legacy scene pages out of the list', () => {
    const result = buildDayStepsFromPack({
      day: 3,
      pack: pack({ withFindImage: false, withScene: true }),
      hasPublishedPack: false,
    });
    assert.ok(!result.steps.some((s) => s.id === 'scene_old'));
    assert.ok(!result.displaySteps.some((s) => s.kind === 'page' && s.id === 'scene_old'));
    assert.deepEqual(
      result.displaySteps.map((s) => s.id),
      ['story', 'vocab', 'grammar', 'day_questions', 'practice'],
    );
  });

  it('marks practice present but not counted', () => {
    const result = buildDayStepsFromPack({
      day: 3,
      pack: pack({ withFindImage: true }),
      hasPublishedPack: true,
    });
    const practice = result.steps.find((s) => s.id === 'practice');
    assert.ok(practice);
    assert.equal(practice.present, true);
    assert.equal(practice.counted, false);
    assert.equal(practice.href, '/practice/3');
    const counted = result.steps.filter((s) => s.counted);
    assert.ok(counted.every((s) => s.id !== 'practice'));
    assert.equal(counted.length, 5); // story, vocab, grammar, find_image, questions
  });

  it('uses Arabic titles the day map used before', () => {
    const result = buildDayStepsFromPack({
      day: 3,
      pack: pack({ withFindImage: true }),
      hasPublishedPack: true,
    });
    assert.equal(result.displaySteps[0]?.title, 'القصة');
    assert.equal(
      result.displaySteps.find((s) => s.id === 'find_image')?.title,
      'لاقي الصورة',
    );
    assert.equal(
      result.displaySteps.find((s) => s.id === 'day_questions')?.title,
      'أسئلة اليوم',
    );
    assert.equal(
      result.displaySteps.find((s) => s.id === 'practice')?.title,
      'تدريب',
    );
  });
});
