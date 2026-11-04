import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectConvoCandidates } from '@/lib/v2/convo/select';
import { createConvoSessionDoc, type ConvoSession } from '@/lib/v2/convo/session';
import { DAY18_PACK } from './fixtures/convo/day18-script';

function sessionWith(
  patch: Partial<ConvoSession> & {
    rungs?: ConvoSession['rungs'];
  },
): ConvoSession {
  const base = createConvoSessionDoc({
    id: 'sel',
    userId: 'u',
    pack: DAY18_PACK,
  });
  return {
    ...base,
    ...patch,
    rungs: patch.rungs ? { ...base.rungs, ...patch.rungs } : base.rungs,
    help_ladder: patch.help_ladder ?? base.help_ladder,
  };
}

describe('v2 convo select', () => {
  it('returns choice questions for taught items in group 1 only', () => {
    const session = sessionWith({});
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.equal(result.kind, 'candidates');
    assert.ok(result.candidates.length > 0);
    assert.ok(result.candidates.length <= 3);
    for (const c of result.candidates) {
      assert.equal(c.qkind, 'choice');
      assert.ok(DAY18_PACK.groups[0].item_ids.includes(c.item_id));
    }
  });

  it('never returns an ineligible later-group question', () => {
    const session = sessionWith({ current_group: 1 });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    const g2 = new Set(DAY18_PACK.groups[1].item_ids);
    for (const c of result.candidates) {
      assert.ok(!g2.has(c.item_id), c.item_id);
    }
  });

  it('offers open questions only for understood items', () => {
    // step_right is always unlocked (first map step).
    const id = 'word.right';
    const allSaid = Object.fromEntries(
      DAY18_PACK.groups
        .flatMap((g) => g.item_ids)
        .filter((x) => x !== id)
        .map((x) => [x, 'said' as const]),
    );
    const session = sessionWith({
      current_group: 2,
      rungs: { ...allSaid, [id]: 'understood' },
    });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.ok(result.candidates.length >= 1);
    assert.ok(result.candidates.every((c) => c.qkind === 'open'));
    assert.ok(result.candidates.some((c) => c.item_id === id));
  });

  it('excludes questions asked in the last 2 turns when alternatives exist', () => {
    const ids = DAY18_PACK.groups[0].item_ids;
    const q0 = DAY18_PACK.items[ids[0]].choice_questions[0].id;
    const q1 = DAY18_PACK.items[ids[1]].choice_questions[0].id;
    const session = sessionWith({
      candidate_history: [q0, q1],
    });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    const got = new Set(result.candidates.map((c) => c.id));
    assert.ok(!got.has(q0) || result.candidates.length < 3);
    // With 3 taught items and 2 recent, the third choice should appear
    const q2 = DAY18_PACK.items[ids[2]].choice_questions[0].id;
    assert.ok(got.has(q2));
  });

  it('after a miss returns help for the same question, not new candidates', () => {
    const itemId = 'word.right';
    const qid = DAY18_PACK.items[itemId].open_questions[0].id;
    const session = sessionWith({
      rungs: { [itemId]: 'understood' },
      current_group: 2,
      help_ladder: { question_id: qid, step: 1, attempts: 1 },
      pending_question: { id: qid, kind: 'help', item_id: itemId },
    });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.equal(result.kind, 'help');
    assert.equal(result.candidates.length, 0);
    assert.equal(result.help?.question_id, qid);
    assert.equal(result.help?.step, 1);
    assert.ok(result.help?.tl);
  });

  it('help step 3 exposes choice options', () => {
    const itemId = 'word.right';
    const qid = DAY18_PACK.items[itemId].open_questions[0].id;
    const session = sessionWith({
      help_ladder: { question_id: qid, step: 3, attempts: 3 },
      pending_question: { id: qid, kind: 'help', item_id: itemId },
    });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.equal(result.kind, 'help');
    assert.ok(result.help?.option_ids?.length);
  });

  it('ranks current-group behind items before earlier-group weak', () => {
    const g1 = DAY18_PACK.groups[0].item_ids[0];
    const g2 = 'word.right';
    const othersSaid = Object.fromEntries(
      DAY18_PACK.groups
        .flatMap((g) => g.item_ids)
        .filter((x) => x !== g1 && x !== g2)
        .map((x) => [x, 'said' as const]),
    );
    const session = sessionWith({
      current_group: 2,
      rungs: {
        ...othersSaid,
        [g1]: 'understood', // recycled weak
        [g2]: 'taught', // current behind
      },
    });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.equal(result.candidates[0]?.item_id, g2);
    assert.equal(result.candidates[0]?.qkind, 'choice');
  });

  it('never empty while taught items remain', () => {
    const session = sessionWith({});
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.ok(result.candidates.length > 0);
  });

  it('returns recap candidates in recap phase', () => {
    const session = sessionWith({
      phase: 'recap',
      rungs: Object.fromEntries(
        DAY18_PACK.groups
          .flatMap((g) => g.item_ids)
          .map((id) => [id, 'said' as const]),
      ),
    });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.equal(result.kind, 'recap');
    assert.ok(result.candidates.length > 0);
    assert.ok(result.candidates.every((c) => c.qkind === 'recap'));
  });

  it('returns closing when phase is closing', () => {
    const session = sessionWith({ phase: 'closing', status: 'done' });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    assert.equal(result.kind, 'closing');
    assert.equal(result.candidates.length, 0);
  });

  it('skips open questions whose map step is not yet unlocked', () => {
    // step_left requires prior route items at understood+
    const left = 'word.left';
    const session = sessionWith({
      current_group: 2,
      rungs: {
        // Only left understood; prior route items still taught → step_left locked
        [left]: 'understood',
        'word.right': 'taught',
        'phrase.go_straight': 'taught',
      },
    });
    const result = selectConvoCandidates({ session, pack: DAY18_PACK });
    const leftOpen = DAY18_PACK.items[left].open_questions[0].id;
    assert.ok(!result.candidates.some((c) => c.id === leftOpen));
  });
});
