import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { LessonPackSchema, type LessonPack } from '../lib/v2/content/lesson';
import {
  applySwap,
  axisChoiceCount,
  buildFormMap,
  chapterFill,
  chapterSpans,
  completedControlIds,
  guidedPartVisibility,
  lockedBlockIds,
  parsePageAnswerPayload,
  parseTarget,
  readMs,
  revealControlComplete,
  swapFormId,
  targetsBefore,
} from '../lib/v2/render';

function loadDay6(): LessonPack {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), 'examples/day06-example.json'), 'utf8'),
  );
  return LessonPackSchema.parse(raw);
}

describe('v2 render · targets', () => {
  it('parses block, column, row, cell, entry and item', () => {
    assert.deepEqual(parseTarget('b1'), { kind: 'block', blockId: 'b1' });
    assert.deepEqual(parseTarget('b1/col:0'), { kind: 'col', blockId: 'b1', index: 0 });
    assert.deepEqual(parseTarget('b1/row:3'), { kind: 'row', blockId: 'b1', index: 3 });
    assert.deepEqual(parseTarget('b2/cell:3:1'), {
      kind: 'cell',
      blockId: 'b2',
      r: 3,
      c: 1,
    });
    assert.deepEqual(parseTarget('b1/entry:0:2'), {
      kind: 'entry',
      blockId: 'b1',
      col: 0,
      i: 2,
    });
    assert.deepEqual(parseTarget('b4/item:2'), { kind: 'item', blockId: 'b4', index: 2 });
    assert.equal(parseTarget('b1/nope'), null);
  });
});

describe('v2 render · timing', () => {
  it('uses the prototype read time at both speeds', () => {
    assert.equal(readMs(0, 1), 1400);
    assert.equal(readMs(10, 1), 1400);
    assert.equal(readMs(100, 1), 5500);
    assert.equal(readMs(100, 0.8), 5500 / 0.8);
  });
});

describe('v2 render · guided chapters', () => {
  it('splits day 6 page 1 into four labeled chapters', () => {
    const steps = loadDay6().pages[0]!.steps ?? [];
    const spans = chapterSpans(steps);
    assert.deepEqual(
      spans.map((span) => span.label),
      ['SER', 'ESTAR', 'الصعب', 'القاعدة'],
    );
    assert.deepEqual(
      spans.map((span) => span.end - span.start),
      [4, 4, 3, 1],
    );

    const atEstar = chapterFill(spans, 4, false);
    assert.equal(atEstar[0]!.progress, 1);
    assert.equal(atEstar[0]!.active, false);
    assert.equal(atEstar[1]!.active, true);
    assert.equal(atEstar[1]!.progress, 0);

    const done = chapterFill(spans, steps.length, true);
    assert.ok(done.every((span) => span.progress === 1 && !span.active));
    assert.deepEqual(targetsBefore(steps, 2), ['b1/col:0', 'b1/entry:0:0']);
  });

  it('highlights only the active part and keeps a revealed block shown', () => {
    const revealed = new Set(['b1/col:0', 'b1/entry:0:0']);
    assert.equal(guidedPartVisibility('b1', 'entry:0:0', revealed, 'b1/entry:0:1'), 'shown');
    assert.equal(guidedPartVisibility('b1', 'entry:0:1', revealed, 'b1/entry:0:1'), 'active');
    assert.equal(guidedPartVisibility('b1', 'entry:0:2', revealed, 'b1/entry:0:1'), 'dim');
    assert.equal(guidedPartVisibility('b1', 'col:0', revealed, 'b1/entry:0:1'), 'shown');
    assert.equal(guidedPartVisibility('b4', null, new Set(['b4']), null), 'shown');
    assert.equal(guidedPartVisibility('b4', null, new Set(), 'b4'), 'active');
  });
});

describe('v2 render · explore', () => {
  it('keeps practice and the tip locked until every person row is seen', () => {
    const page = loadDay6().pages[1]!;
    const table = page.blocks.find((block) => block.type === 'table');
    assert.ok(table);
    assert.equal(axisChoiceCount(table, 'rows'), 5);
    assert.equal(revealControlComplete([0, 1, 2, 3], 5), false);
    assert.equal(revealControlComplete([0, 1, 2, 3, 4], 5), true);

    const locked = lockedBlockIds(page, completedControlIds(page, {}));
    assert.deepEqual([...locked].sort(), ['b2', 'b3']);

    const open = lockedBlockIds(
      page,
      completedControlIds(page, { c1: [0, 1, 2, 3, 4] }),
    );
    assert.equal(open.size, 0);
  });

  it('substitutes the lemma and keeps tense and person', () => {
    assert.equal(swapFormId('verb.estar:pres:eu', 'ser'), 'verb.ser:pres:eu');
    assert.equal(
      applySwap('verb.falar:pres:eu', 'b1', 0, [
        { id: 'c2', type: 'swap', target: 'b1/col:0', options: ['falar', 'morar'] },
      ], { c2: 'morar' }),
      'verb.morar:pres:eu',
    );
    assert.equal(
      applySwap('verb.comer:pres:eu', 'b1', 1, [
        { id: 'c2', type: 'swap', target: 'b1/col:0', options: ['falar', 'morar'] },
      ], { c2: 'morar' }),
      'verb.comer:pres:eu',
    );
  });

  it('resolves estou as an irregular form', () => {
    const forms = buildFormMap(['verb.estar:pres:eu', 'verb.ser:pres:eu']);
    assert.equal(forms['verb.estar:pres:eu']?.tl, 'estou');
    assert.equal(forms['verb.estar:pres:eu']?.irregular, true);
    assert.equal(forms['verb.ser:pres:eu']?.tl, 'sou');
  });
});

describe('v2 render · answer payload', () => {
  it('accepts page asks and quiz answers with answer_id', () => {
    const aid = '11111111-1111-4111-8111-111111111111';
    assert.deepEqual(
      parsePageAnswerPayload({
        kind: 'page_ask',
        answer_id: aid,
        day: 6,
        page_id: 'p1',
        step_index: 3,
        option_index: 0,
      }),
      {
        kind: 'page_ask',
        answer_id: aid,
        day: 6,
        page_id: 'p1',
        step_index: 3,
        option_index: 0,
      },
    );
    assert.equal(
      parsePageAnswerPayload({ kind: 'page_ask', day: 0, page_id: 'p1' }),
      null,
    );
    assert.equal(
      parsePageAnswerPayload({
        kind: 'page_ask',
        day: 6,
        page_id: 'p1',
        step_index: 3,
        option_index: 0,
      }),
      null,
      'missing answer_id',
    );
    assert.equal(
      parsePageAnswerPayload({
        kind: 'page_quiz',
        answer_id: aid,
        day: 6,
        page_id: 'p1',
        question_id: 'q.d06.1',
        option_index: 1,
      })?.kind,
      'page_quiz',
    );
  });
});
