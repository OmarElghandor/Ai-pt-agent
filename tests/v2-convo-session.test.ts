import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';
import type { ConvoPackData } from '@/lib/v2/convo/pack';
import {
  MemoryConvoSessionStore,
  getConvoSession,
  startConvoSession,
} from '@/lib/v2/convo/session';

const PACK = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'tests/fixtures/convo/pt-PT.day-18.json'),
    'utf8',
  ),
) as ConvoPackData;

describe('v2 convo session', () => {
  let store: MemoryConvoSessionStore;

  beforeEach(() => {
    store = new MemoryConvoSessionStore();
  });

  it('creates a session with every item at taught, group 1, empty pending/history', async () => {
    const result = await startConvoSession({
      userId: 'user-1',
      pack: PACK,
      store,
      newId: () => 'sess-1',
    });

    assert.equal(result.resumed, false);
    assert.equal(result.session.id, 'sess-1');
    assert.equal(result.session.user_id, 'user-1');
    assert.equal(result.session.pack_id, 'pt-PT.day-18');
    assert.equal(result.session.module, 'lesson');
    assert.equal(result.session.status, 'open');
    assert.equal(result.session.current_group, 1);
    assert.equal(result.session.pending_question, null);
    assert.deepEqual(result.session.last_exchanges, []);
    assert.deepEqual(result.session.candidate_history, []);
    assert.equal(result.session.help_ladder.step, 0);
    assert.equal(result.session.help_ladder.question_id, null);

    const itemIds = PACK.groups.flatMap((g) => g.item_ids);
    for (const id of itemIds) {
      assert.equal(result.session.rungs[id], 'taught', id);
    }
  });

  it('returns opening bubbles: character opening + group-1 coach intros and card ids', async () => {
    const result = await startConvoSession({
      userId: 'user-1',
      pack: PACK,
      store,
    });

    assert.equal(result.opening.character.tl, PACK.opening.tl);
    assert.equal(result.opening.character.say, PACK.opening.say);
    assert.deepEqual(result.opening.card_ids, PACK.groups[0].item_ids);
    assert.equal(
      result.opening.coach_intros.length,
      PACK.groups[0].item_ids.length,
    );
    assert.equal(
      result.opening.coach_intros[0].coach_intro_eg,
      PACK.items[PACK.groups[0].item_ids[0]].coach_intro_eg,
    );
  });

  it('reloads the same session by id', async () => {
    const created = await startConvoSession({
      userId: 'user-1',
      pack: PACK,
      store,
      newId: () => 'sess-reload',
    });

    const loaded = await getConvoSession(store, {
      sessionId: 'sess-reload',
      userId: 'user-1',
    });
    assert.ok(loaded);
    assert.equal(loaded.id, created.session.id);
    assert.equal(loaded.pack_id, created.session.pack_id);

    const viaStart = await startConvoSession({
      userId: 'user-1',
      pack: PACK,
      store,
      sessionId: 'sess-reload',
    });
    assert.equal(viaStart.resumed, true);
    assert.equal(viaStart.session.id, 'sess-reload');
  });

  it('second start for the same user × pack returns the same open session', async () => {
    const first = await startConvoSession({
      userId: 'user-1',
      pack: PACK,
      store,
      newId: () => 'sess-a',
    });
    const second = await startConvoSession({
      userId: 'user-1',
      pack: PACK,
      store,
      newId: () => 'sess-b',
    });

    assert.equal(second.resumed, true);
    assert.equal(second.session.id, first.session.id);
    assert.equal(second.session.id, 'sess-a');
  });

  it('different users get different sessions for the same pack', async () => {
    const a = await startConvoSession({
      userId: 'user-a',
      pack: PACK,
      store,
      newId: () => 'sess-user-a',
    });
    const b = await startConvoSession({
      userId: 'user-b',
      pack: PACK,
      store,
      newId: () => 'sess-user-b',
    });
    assert.notEqual(a.session.id, b.session.id);
  });
});
