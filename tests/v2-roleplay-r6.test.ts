import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyRoleplayEvents,
  emptyRoleplayUiState,
  reduceRoleplayEvent,
} from '../components/v2/roleplay/roleplayStreamReduce';
import type { RoleplayTurnEvent } from '../lib/v2/roleplay/events';

describe('roleplay R6 stream reduce + result', () => {
  it('reduces character, help, progress, result events', () => {
    const events: RoleplayTurnEvent[] = [
      {
        type: 'character',
        tl: 'Bom dia! Diga.',
        ar: 'صباح الخير',
        ar_hidden: false,
        coach_eg: 'Diga = تفضّل',
      },
      {
        type: 'help',
        frame_tl: 'Queria um ___, por favor.',
        eg: 'اطلب',
        chips: ['Queria um galão, por favor.'],
        miss: 1,
      },
      { type: 'progress', current: 0, total: 5, step_id: 'order_drink' },
      {
        type: 'result',
        tier: 1,
        star: 1,
        alone: 4,
        assisted: 1,
        key_phrases: ['Quanto é?'],
        corrections: [],
        summary_eg: 'خلصت الكافيه',
        next_tier: 2,
      },
      { type: 'done', finished: true },
    ];
    const state = applyRoleplayEvents(emptyRoleplayUiState(), events, {
      tier: 1,
    });
    assert.equal(state.bubbles.filter((b) => b.role === 'character').length, 1);
    assert.ok(state.help);
    assert.equal(state.help!.chips.length, 1);
    assert.equal(state.progress.total, 5);
    assert.ok(state.result);
    assert.equal(state.result!.star, 1);
    assert.equal(state.result!.next_tier, 2);
    assert.equal(state.finished, true);
  });

  it('attaches correction onto the last learner bubble', () => {
    let state = emptyRoleplayUiState();
    state = {
      ...state,
      bubbles: [{ id: 'l1', role: 'learner', tl: 'quero cafe' }],
    };
    state = reduceRoleplayEvent(state, {
      type: 'correction',
      tl: 'Quero um café.',
      ar: 'أريد قهوة',
      original: 'quero cafe',
    });
    const learner = state.bubbles[0];
    assert.equal(learner.role, 'learner');
    if (learner.role === 'learner') {
      assert.equal(learner.correction?.corrected_tl, 'Quero um café.');
    }
  });
});
