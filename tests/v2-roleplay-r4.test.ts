import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyRoleplayEvents,
  emptyRoleplayUiState,
  reduceRoleplayEvent,
} from '../components/v2/roleplay/roleplayStreamReduce';
import type { RoleplayTurnEvent } from '../lib/v2/roleplay/events';
import {
  buildRoleplayCatalog,
  clearRoleplayLoadCache,
  loadRoleplayIndex,
} from '../lib/v2/roleplay';
import { ROLE_PLAY_DAYS } from '../lib/v2/convo/topics/rolePlay';

describe('roleplay R4 UI reduce + path entry', () => {
  it('ROLE_PLAY_DAYS is empty so day 33 leaves the learn list', () => {
    assert.deepEqual([...ROLE_PLAY_DAYS], []);
  });

  it('path_finished catalog drives the finished entry card', () => {
    clearRoleplayLoadCache();
    const index = loadRoleplayIndex();
    const done = buildRoleplayCatalog({
      finishedIds: index.path.map((p) => p.id),
    });
    assert.equal(done.path_finished, true);
    assert.equal(done.next, null);
    assert.equal(done.past.length, 15);

    const fresh = buildRoleplayCatalog({ finishedIds: [] });
    assert.equal(fresh.path_finished, false);
    assert.equal(fresh.next?.id, 'rp.cafe');
    assert.equal(fresh.next?.resume, false);
  });

  it('resume flag is set when the next scene has an active session', () => {
    clearRoleplayLoadCache();
    const catalog = buildRoleplayCatalog({
      finishedIds: [],
      activeSituationIds: ['rp.cafe'],
      activeBySituation: { 'rp.cafe': { id: 'sess-1' } },
    });
    assert.equal(catalog.next?.id, 'rp.cafe');
    assert.equal(catalog.next?.resume, true);
    assert.equal(catalog.next?.active_session_id, 'sess-1');
  });

  it('stream reduce builds result without stars', () => {
    const events: RoleplayTurnEvent[] = [
      {
        type: 'character',
        tl: 'Bom dia!',
        ar: 'صباح الخير!',
        ar_hidden: true,
      },
      {
        type: 'result',
        alone: 3,
        assisted: 1,
        key_phrases: ['Quanto é?'],
        corrections: [{ tl: 'Obrigado' }],
        summary_eg: 'خلصت.',
      },
      { type: 'done', finished: true },
    ];
    const state = applyRoleplayEvents(emptyRoleplayUiState(), events);
    assert.equal(state.bubbles.length, 1);
    assert.ok(state.bubbles[0]!.role === 'character');
    assert.equal(state.bubbles[0]!.meaningHidden, true);
    assert.ok(state.result);
    assert.equal(state.result!.alone, 3);
    assert.equal(state.result!.summary_eg, 'خلصت.');
    assert.equal(state.finished, true);
    assert.equal('star' in (state.result as object), false);
  });

  it('help event surfaces chips only after help', () => {
    let state = emptyRoleplayUiState();
    state = reduceRoleplayEvent(state, {
      type: 'help',
      frame_tl: 'Queria um galão, por favor.',
      eg: 'اطلب المشروب',
      chips: ['Queria um galão, por favor.', 'Queria um café, por favor.'],
      miss: 1,
    });
    assert.ok(state.help);
    assert.equal(state.help!.chips.length, 2);
  });
});
