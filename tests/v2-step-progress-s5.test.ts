import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Item } from '../lib/v2/content/items';
import type { LessonPack } from '../lib/v2/content/lesson';
import type { Page } from '../lib/v2/content/page';
import { buildDayStepsFromPack } from '../lib/v2/progress/daySteps';
import { buildStepView } from '../lib/v2/progress/stepView';

function rt(text: string) {
  return [{ text, lang: 'eg' as const }];
}

function page(
  id: string,
  opts: { preset?: Page['preset']; title?: string; story_id?: string } = {},
): Page {
  const preset = opts.preset ?? 'vocab_flow';
  const isStory = preset === 'story';
  return {
    id,
    preset,
    mode: isStory ? 'static' : 'sections',
    title: rt(opts.title ?? id),
    story_id: opts.story_id ?? (isStory ? 'story.day-3' : undefined),
    blocks: isStory
      ? []
      : [{ id: `${id}.b1`, type: 'heading', text: rt(opts.title ?? id) }],
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

/** Day 3 shape: story + 3 detail pages + questions + practice; find_image hidden. */
function day3Pack(): LessonPack {
  return {
    lesson: {
      id: 'pt-PT.day-3',
      target_lang: 'pt-PT',
      day: 3,
      kind: 'lesson',
      pages: ['story', 'vocab', 'grammar', 'phrases'],
      situation: { tl: 'No café', eg: 'في المقهى' },
    },
    items: [phrase('phrase.a', 'Olá')],
    pages: [
      page('story', { preset: 'story', title: 'القصة', story_id: 's3' }),
      page('vocab', { title: 'كلمات' }),
      page('grammar', { title: 'القاعدة' }),
      page('phrases', { title: 'جمل' }),
    ],
    questions: [{ id: 'q1', type: 'say_it', skill: 'speaking', prompt: 'x' }],
  };
}

describe('S5 · summary current_day_steps', () => {
  it('summary step numbers match a seeded user (day 3, story + 2 pages done, find_image hidden)', () => {
    const shared = buildDayStepsFromPack({
      day: 3,
      pack: day3Pack(),
      hasPublishedPack: true,
    });
    assert.equal(shared.steps.find((s) => s.id === 'find_image')?.present, false);
    assert.equal(shared.steps.filter((s) => s.counted).length, 5);

    const view = buildStepView(
      {
        status: 'in_progress',
        steps: [
          { id: 'story', status: 'done', done_at: new Date() },
          { id: 'vocab', status: 'done', done_at: new Date() },
          { id: 'grammar', status: 'done', done_at: new Date() },
          { id: 'phrases', status: 'not_started', done_at: null },
          { id: 'find_image', status: 'skipped', done_at: null },
          { id: 'day_questions', status: 'not_started', done_at: null },
          { id: 'practice', status: 'not_started', done_at: null },
        ],
      },
      shared.steps,
    );

    assert.equal(view.done, 3);
    assert.equal(view.total, 5);
    assert.equal(view.nextStep?.id, 'phrases');
    assert.equal(view.started, true);
    assert.equal(view.lastDoneStep?.id, 'grammar');
  });

  it('a completed-and-practised day returns no next step', () => {
    const shared = buildDayStepsFromPack({
      day: 3,
      pack: day3Pack(),
      hasPublishedPack: true,
    });
    const view = buildStepView(
      {
        status: 'completed',
        steps: shared.steps.map((s) => ({
          id: s.id,
          status: s.present
            ? s.kind === 'practice'
              ? 'not_started'
              : 'done'
            : 'skipped',
          done_at: s.present && s.kind !== 'practice' ? new Date() : null,
        })),
      },
      shared.steps,
    );
    assert.equal(view.nextStep, null);
    assert.equal(view.started, true);
  });

  it('summary still makes no query on v2_errors', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'lib/v2/progress/summary.ts'),
      'utf8',
    );
    assert.equal(src.includes('V2ErrorModel'), false);
    assert.equal(src.includes('v2_errors'), false);
    assert.match(src, /current_day_steps/);
    assert.match(src, /buildDaySteps/);
    assert.match(src, /buildStepView/);
  });
});
