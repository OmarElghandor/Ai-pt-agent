import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyConvoGrade, formatConvoEventLine } from '@/lib/v2/convo/ladder';
import { createConvoSessionDoc } from '@/lib/v2/convo/session';
import {
  DAY18_PACK,
  choicePending,
  gradeAndApply,
  openPending,
  runDay18Script,
  surfaceTl,
} from './fixtures/convo/day18-script';

describe('v2 convo ladder · unit', () => {
  it('choice correct advances taught → understood', () => {
    const session = createConvoSessionDoc({
      id: 's1',
      userId: 'u',
      pack: DAY18_PACK,
    });
    const itemId = DAY18_PACK.groups[0].item_ids[0];
    const result = gradeAndApply(
      session,
      choicePending(itemId),
      surfaceTl(itemId),
    );
    assert.equal(result.session.rungs[itemId], 'understood');
    assert.equal(result.session.help_ladder.step, 0);
    assert.equal(result.session.correct_streak, 1);
  });

  it('open correct without help → said + first_said', () => {
    let session = createConvoSessionDoc({
      id: 's1',
      userId: 'u',
      pack: DAY18_PACK,
    });
    const itemId = DAY18_PACK.groups[0].item_ids[0];
    session = gradeAndApply(
      session,
      choicePending(itemId),
      surfaceTl(itemId),
    ).session;
    const result = gradeAndApply(
      session,
      openPending(itemId),
      surfaceTl(itemId),
    );
    assert.equal(result.session.rungs[itemId], 'said');
    assert.ok(result.moments.includes('first_said'));
    assert.equal(result.event.first_without_help, true);
  });

  it('unclear does not escalate help or change rung', () => {
    const session = createConvoSessionDoc({
      id: 's1',
      userId: 'u',
      pack: DAY18_PACK,
    });
    const itemId = DAY18_PACK.groups[0].item_ids[0];
    const pending = choicePending(itemId);
    const result = applyConvoGrade({
      session,
      pack: DAY18_PACK,
      grade: { verdict: 'unclear', itemIds: [itemId] },
      pending,
    });
    assert.equal(result.session.rungs[itemId], 'taught');
    assert.equal(result.session.help_ladder.step, 0);
    assert.ok(result.moments.includes('unclear'));
    assert.equal(formatConvoEventLine(result.event), 'answer unclear');
  });

  it('wrong answer escalates help 1→4 and marks struggled', () => {
    let session = createConvoSessionDoc({
      id: 's1',
      userId: 'u',
      pack: DAY18_PACK,
    });
    const itemId = 'word.right';
    session = gradeAndApply(
      session,
      choicePending(itemId),
      surfaceTl(itemId),
    ).session;

    let pending = openPending(itemId);
    let result = gradeAndApply(session, pending, 'esquerda');
    assert.equal(result.session.help_ladder.step, 1);
    assert.ok(result.moments.includes('miss_1'));
    assert.equal(result.session.struggled[itemId], true);
    assert.ok(result.event.consequence_tl);
    assert.match(formatConvoEventLine(result.event), /answer wrong/);

    session = result.session;
    pending = { ...pending, kind: 'help' };
    for (const step of [2, 3, 4] as const) {
      // Other taught item → wrong (not unclear).
      result = gradeAndApply(session, pending, surfaceTl('word.left'));
      assert.equal(result.session.help_ladder.step, step);
      assert.ok(result.moments.includes(`miss_${step}`));
      session = result.session;
    }

    result = gradeAndApply(session, pending, surfaceTl(itemId));
    assert.equal(result.session.rungs[itemId], 'assisted');
    assert.ok(result.moments.includes('success_after_struggle'));
    assert.equal(result.session.help_ladder.step, 0);
  });

  it('streak_3 fires every third correct', () => {
    let session = createConvoSessionDoc({
      id: 's1',
      userId: 'u',
      pack: DAY18_PACK,
    });
    const a = DAY18_PACK.groups[0].item_ids[0];
    const b = DAY18_PACK.groups[0].item_ids[1];
    session = gradeAndApply(session, choicePending(a), surfaceTl(a)).session;
    session = gradeAndApply(session, openPending(a), surfaceTl(a)).session;
    const third = gradeAndApply(session, choicePending(b), surfaceTl(b));
    assert.equal(third.session.correct_streak, 3);
    assert.ok(third.moments.includes('streak_3'));
  });
});

describe('v2 convo ladder · scripted day 18', () => {
  it('walks to closing: wrong, four-miss assist, group change, recap, end', () => {
    const { session, turns } = runDay18Script();

    assert.equal(session.phase, 'closing');
    assert.equal(session.status, 'done');
    assert.equal(session.current_group, 2);

    const street = 'word.street';
    assert.equal(session.rungs[street], 'assisted');
    assert.equal(session.struggled[street], true);

    for (const id of DAY18_PACK.groups.flatMap((g) => g.item_ids)) {
      const rung = session.rungs[id];
      assert.ok(
        rung === 'said' || rung === 'assisted',
        `${id} should be said/assisted, got ${rung}`,
      );
    }

    assert.equal(
      session.recap_done_ids.length,
      DAY18_PACK.recap.questions.length,
    );

    const allMoments = turns.flatMap((t) => t.moments);
    for (const m of [
      'miss_1',
      'miss_2',
      'miss_3',
      'miss_4',
      'success_after_struggle',
      'group_done',
      'first_said',
      'conversation_finished',
    ] as const) {
      assert.ok(allMoments.includes(m), `missing moment ${m}`);
    }
  });
});
