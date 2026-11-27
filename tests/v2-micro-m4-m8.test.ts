import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseAnswerPayload } from '../lib/v2/answers/payload';
import { CUSTOM_DECK_NEW_PER_DAY } from '../lib/v2/decks';
import { rankDailyClip } from '../lib/v2/micro/daily';
import { canPublishSceneLines } from '../lib/v2/micro/images';
import {
  compareClipsByLevelThenOrder,
  compareSeriesByLevelThenOrder,
  minLevel,
} from '../lib/v2/micro/order';
import { ProgressEventSchema } from '../lib/v2/progress/events/types';
import { visibleArabic } from '../components/v2/micro/ClipSheet';
import { sceneBoxLeftAtWidth } from '../components/v2/micro/ScenePicture';
import { USER_KEYED_V2_COLLECTIONS } from '../lib/v2/auth/userKeyedCollections';

describe('M4 · publish gates', () => {
  it('blocks publish when a scene box is missing', () => {
    assert.equal(
      canPublishSceneLines([
        { box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, box_flagged: false },
        { box: null, box_flagged: true },
      ]),
      false,
    );
  });
});

describe('M5 · player helpers', () => {
  const lines = [
    { item_id: 'a', tl: 'este', ar: 'هذا' },
    { item_id: 'b', tl: 'esse', ar: 'ذلك' },
  ];

  it('does not expose Arabic for unrevealed rows', () => {
    assert.deepEqual(visibleArabic(lines, 0), [null, null]);
    assert.deepEqual(visibleArabic(lines, 1), ['هذا', null]);
  });

  it('scene box fractions match at 360 and 430 widths', () => {
    const box = { x: 0.2, y: 0.3, w: 0.1, h: 0.1 };
    const a = sceneBoxLeftAtWidth(box, 360);
    const b = sceneBoxLeftAtWidth(box, 430);
    assert.ok(Math.abs(a / 360 - b / 430) < 1e-9);
  });

  it('parses micro_clip_finish and save_line answers', () => {
    const finish = parseAnswerPayload({
      kind: 'micro_clip_finish',
      answer_id: '11111111-1111-4111-8111-111111111111',
      day: 1,
      clip_id: 'c1',
      item_ids: ['food.cake', 'food.bread'],
    });
    assert.equal(finish?.kind, 'micro_clip_finish');
    const save = parseAnswerPayload({
      kind: 'micro_clip_save_line',
      answer_id: '22222222-2222-4222-8222-222222222222',
      day: 1,
      clip_id: 'c1',
      item_id: 'food.cake',
    });
    assert.equal(save?.kind, 'micro_clip_save_line');
    if (save?.kind === 'micro_clip_save_line') {
      assert.equal(save.item_id, 'food.cake');
    }
  });
});

describe('M6 · series deck session cap', () => {
  it('reuses the custom/official new-per-day cap of 10', () => {
    assert.equal(CUSTOM_DECK_NEW_PER_DAY, 10);
  });
});

describe('M7 · daily picker', () => {
  it('prefers overlap with lesson items', () => {
    const id = rankDailyClip({
      unfinished: [
        {
          clip_id: 'demo',
          series_slug: 'demonstratives',
          item_ids: ['det.este', 'det.essa'],
          order_in_series: 1,
          series_order: 1,
        },
        {
          clip_id: 'verbs',
          series_slug: 'daily-verbs',
          item_ids: ['verb.ser'],
          order_in_series: 1,
          series_order: 2,
        },
      ],
      lessonItemIds: ['det.este', 'other'],
      startedSeriesSlugs: [],
    });
    assert.equal(id, 'demo');
  });

  it('never returns a finished clip (unfinished list only)', () => {
    const id = rankDailyClip({
      unfinished: [
        {
          clip_id: 'next',
          series_slug: 'didnt-understand',
          item_ids: [],
          order_in_series: 1,
          series_order: 2,
        },
      ],
      lessonItemIds: [],
      startedSeriesSlugs: [],
    });
    assert.equal(id, 'next');
  });

  it('keeps A5 collections for daily + progress', () => {
    assert.ok(
      (USER_KEYED_V2_COLLECTIONS as readonly string[]).includes(
        'v2_micro_daily',
      ),
    );
  });
});

describe('M8 · reel export event kinds', () => {
  it('accepts micro progress event kinds', () => {
    const started = ProgressEventSchema.safeParse({
      event_id: '33333333-3333-4333-8333-333333333333',
      kind: 'micro_clip_started',
      clip_id: 'c1',
      target_lang: 'pt-PT',
    });
    assert.equal(started.success, true);
    const finished = ProgressEventSchema.safeParse({
      event_id: '44444444-4444-4444-8444-444444444444',
      kind: 'micro_clip_finished',
      clip_id: 'c1',
      line_count: 8,
      target_lang: 'pt-PT',
    });
    assert.equal(finished.success, true);
    const reviewed = ProgressEventSchema.safeParse({
      event_id: '55555555-5555-4555-8555-555555555555',
      kind: 'micro_clip_reviewed',
      clip_id: 'c1',
      line_count: 8,
      target_lang: 'pt-PT',
    });
    assert.equal(reviewed.success, true);
  });
});

describe('§3.5 fixed order + §3.6 review tab', () => {
  it('series order stays the same after a finished_count bump', () => {
    const before = [
      { slug: 'b', min_level: 2, order: 2, finished_count: 0 },
      { slug: 'a', min_level: 1, order: 5, finished_count: 0 },
      { slug: 'c', min_level: 1, order: 2, finished_count: 0 },
    ];
    const after = before.map((s) =>
      s.slug === 'a' ? { ...s, finished_count: 3 } : s,
    );
    const sort = (
      rows: Array<{ slug: string; min_level: number; order: number }>,
    ) =>
      rows
        .slice()
        .sort(compareSeriesByLevelThenOrder)
        .map((r) => r.slug);
    assert.deepEqual(sort(before), ['c', 'a', 'b']);
    assert.deepEqual(sort(after), ['c', 'a', 'b']);
  });

  it('finished clips sort by level then outline order', () => {
    const clips = [
      { id: 'x', level: 2, series_order: 1, order: 1 },
      { id: 'y', level: 1, series_order: 9, order: 2 },
      { id: 'z', level: 1, series_order: 1, order: 3 },
    ];
    const sorted = clips
      .slice()
      .sort(compareClipsByLevelThenOrder)
      .map((c) => c.id);
    assert.deepEqual(sorted, ['z', 'y', 'x']);
  });

  it('a finished clip appears in the finished list filter', () => {
    const progress = [
      { clip_id: 'c1', finished_at: new Date() },
      { clip_id: 'c2', finished_at: null },
    ];
    const clips = [
      { id: 'c1', status: 'published', lines: [1, 2] },
      { id: 'c2', status: 'published', lines: [1] },
      { id: 'c3', status: 'draft', lines: [1] },
    ];
    const finished = new Set(
      progress.filter((p) => p.finished_at).map((p) => p.clip_id),
    );
    const finished_clips = clips.filter(
      (c) =>
        c.status === 'published' &&
        finished.has(c.id) &&
        (c.lines?.length ?? 0) >= 1,
    );
    assert.deepEqual(
      finished_clips.map((c) => c.id),
      ['c1'],
    );
  });

  it('review mode opens only with mode=review; normal finished open stays normal', () => {
    const playerSrc = readFileSync(
      join(process.cwd(), 'components/v2/micro/MicroSeriesPlayer.tsx'),
      'utf8',
    );
    assert.match(playerSrc, /get\('mode'\) === 'review'/);
    assert.match(playerSrc, /action: 'review'/);
    assert.match(playerSrc, /action: 'finish'/);
    // Review path never posts finish
    assert.match(
      playerSrc,
      /if \(reviewMode\)[\s\S]*action: 'review'[\s\S]*return;/,
    );
    const sheetSrc = readFileSync(
      join(process.cwd(), 'components/v2/micro/ClipSheet.tsx'),
      'utf8',
    );
    assert.match(sheetSrc, /reviewMode = false/);
    assert.match(sheetSrc, /مراجعة/);
    const homeSrc = readFileSync(
      join(process.cwd(), 'components/v2/micro/MicroTopicsHome.tsx'),
      'utf8',
    );
    assert.doesNotMatch(homeSrc, /مكمّل فيها/);
    assert.match(homeSrc, /كل اللقطات/);
    assert.match(homeSrc, /اللي خلصتها/);
    assert.match(homeSrc, /mode=review/);
  });

  it('minLevel ignores finished progress', () => {
    assert.equal(minLevel([3, 1, 2]), 1);
    assert.equal(minLevel([]), 99);
  });
});
