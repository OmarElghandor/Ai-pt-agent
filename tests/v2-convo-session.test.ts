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

  it('resume mid-group: template reopening + same pending question (T4.1)', async () => {
    const first = await startConvoSession({
      userId: 'user-resume',
      pack: PACK,
      store,
      newId: () => 'sess-resume',
    });

    const pending = {
      id: 'q_right_open',
      kind: 'open' as const,
      item_id: 'word.right',
    };
    const mid = structuredClone(first.session);
    mid.pending_question = pending;
    mid.current_group = 2;
    mid.last_exchanges = [
      { role: 'character', tl: 'E agora?' },
      { role: 'learner', tl: 'direita' },
    ];
    await store.save(mid);

    const resumed = await startConvoSession({
      userId: 'user-resume',
      pack: PACK,
      store,
      newId: () => 'sess-should-not-create',
    });

    assert.equal(resumed.resumed, true);
    assert.equal(resumed.session.id, 'sess-resume');
    assert.deepEqual(resumed.session.pending_question, pending);
    assert.equal(resumed.session.current_group, 2);
    assert.ok(resumed.reopening);
    assert.equal(resumed.reopening.pending_question?.id, 'q_right_open');
    assert.ok(
      resumed.reopening.character_tl.includes('E agora?') ||
        resumed.reopening.pending_tl === 'E agora?',
    );
    assert.match(resumed.opening.character.tl, /E agora\?/);
    // No fresh group-1 cards on resume mid-run
    assert.deepEqual(resumed.opening.card_ids, []);
  });

  it('T6.3 review: finished day-18 progress seeds said rungs and skips cards', async () => {
    const itemIds = PACK.groups.flatMap((g) => g.item_ids);
    const states = new Map(
      itemIds.map((item_id) => [
        item_id,
        {
          user_id: 'user-review',
          item_id,
          target_lang: 'pt-PT',
          introducedDay: 18,
          usedCorrectlyIn: [] as string[],
          levels: { heard: 1, understood: 1, said: 1, used: 0 },
          skills: {},
          card: {
            interval: 7,
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            masteryLevel: 'learning' as const,
            consecutiveCorrect: 1,
            face: 'recognize',
            knowCheckDueAt: null,
          },
          lastImplicitReviewLocalDate: null,
          weakToolIds: [] as string[],
        },
      ]),
    );

    const result = await startConvoSession({
      userId: 'user-review',
      pack: PACK,
      store,
      newId: () => 'sess-review',
      itemStatesById: states,
    });

    assert.equal(result.resumed, false);
    assert.deepEqual(result.opening.card_ids, []);
    assert.equal(result.opening.coach_intros.length, 0);
    for (const id of itemIds) {
      assert.equal(result.session.rungs[id], 'said', id);
    }
    assert.equal(result.session.current_group, PACK.groups.length);
    assert.equal(result.session.phase, 'teaching');
    assert.equal(result.session.status, 'open');
  });

  it('T6.3 review: understood-only progress starts at choice (heard rung), no card', async () => {
    const states = new Map([
      [
        'word.station',
        {
          user_id: 'u',
          item_id: 'word.station',
          target_lang: 'pt-PT',
          introducedDay: 18,
          usedCorrectlyIn: [] as string[],
          levels: { heard: 1, understood: 1, said: 0, used: 0 },
          skills: {},
          card: {
            interval: 0,
            dueAt: null,
            masteryLevel: 'learning' as const,
            consecutiveCorrect: 0,
            face: 'recognize',
            knowCheckDueAt: null,
          },
          lastImplicitReviewLocalDate: null,
          weakToolIds: [] as string[],
        },
      ],
    ]);

    const result = await startConvoSession({
      userId: 'user-understood',
      pack: PACK,
      store,
      newId: () => 'sess-understood',
      itemStatesById: states,
    });

    assert.equal(result.session.rungs['word.station'], 'heard');
    assert.ok(!result.opening.card_ids.includes('word.station'));
    // Other group-1 items still taught → still get cards
    assert.ok(result.opening.card_ids.includes('word.street'));
  });

  it('resume after simulated server restart (new store instance)', async () => {
    const first = await startConvoSession({
      userId: 'user-restart',
      pack: PACK,
      store,
      newId: () => 'sess-restart',
    });
    const pending = {
      id: 'q_left_open',
      kind: 'open' as const,
      item_id: 'word.left',
    };
    const mid = structuredClone(first.session);
    mid.pending_question = pending;
    mid.current_group = 2;
    await store.save(mid);
    const snapshot = structuredClone(
      (await store.findById('sess-restart'))!,
    );

    // New process → new Memory store seeded with persisted doc
    const store2 = new MemoryConvoSessionStore();
    await store2.create(snapshot);

    const resumed = await startConvoSession({
      userId: 'user-restart',
      pack: PACK,
      store: store2,
    });

    assert.equal(resumed.resumed, true);
    assert.equal(resumed.session.id, 'sess-restart');
    assert.deepEqual(resumed.session.pending_question, pending);
    assert.ok(resumed.reopening?.pending_tl);
    assert.match(resumed.reopening!.character_tl, /No semáforo\?/);
  });
});
