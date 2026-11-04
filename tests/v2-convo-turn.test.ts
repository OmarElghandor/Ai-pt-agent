import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
} from '@/lib/v2/convo/pack';
import {
  MemoryConvoSessionStore,
  createConvoSessionDoc,
  startConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { surfaceTl } from './fixtures/convo/day18-script';

const pack = requireConvoPack('pt-PT.day-18', {
  itemSurfaces: loadConvoItemSurfaces(),
});
const surfaces = loadConvoItemSurfaces();

function collectEvents() {
  const events: ConvoTurnStreamEvent[] = [];
  return {
    events,
    emit: (e: ConvoTurnStreamEvent) => {
      events.push(e);
    },
  };
}

function eventTypes(events: ConvoTurnStreamEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('v2 convo turn · streaming orchestration', () => {
  it('bootstrap turn emits question then done, and advances pending', async () => {
    const store = new MemoryConvoSessionStore();
    const { session } = await startConvoSession({
      userId: 'u-turn',
      pack,
      store,
      newId: () => 'sess-boot',
    });
    assert.equal(session.pending_question, null);

    const model = createStubConvoStreamModel({});
    const { events, emit } = collectEvents();
    const result = await runConvoTurn({
      session,
      pack,
      surfaces,
      learnerText: '',
      store,
      model,
      emit,
    });

    assert.ok(eventTypes(events).includes('reaction_delta'));
    assert.ok(eventTypes(events).includes('question'));
    assert.ok(eventTypes(events).includes('session'));
    assert.deepEqual(events.at(-1), { type: 'done', ok: true });

    const q = events.find((e) => e.type === 'question');
    assert.ok(q && q.type === 'question');
    assert.ok(q.audio_key.startsWith('convo:pt-PT.day-18:'));
    assert.equal(result.session.pending_question?.id, q.id);
    assert.equal(model.calls, 1);

    // Coach before reaction when moments exist — bootstrap has none.
    const types = eventTypes(events);
    const qIdx = types.indexOf('question');
    const rIdx = types.indexOf('reaction_delta');
    assert.ok(rIdx >= 0 && rIdx < qIdx);
  });

  it('handles a tag split across stream chunks', async () => {
    const store = new MemoryConvoSessionStore();
    const session = createConvoSessionDoc({
      id: 'sess-tag',
      userId: 'u',
      pack,
    });
    await store.create(session);

    const g1 = pack.groups[0].item_ids[0];
    const qid = pack.items[g1].choice_questions[0].id;
    // Force first candidate via stub chunks that split the tag.
    const model = createStubConvoStreamModel({
      byCandidate: (ids) => `[${ids[0]}] Boa!`,
      chunks: ['[', qid.slice(0, 3), qid.slice(3) + '] Bo', 'a!'],
      // chunks join wins; keep Portuguese to avoid regen
    });
    // Seed pending so this is a normal answer turn after we first bootstrap-like set pending
    session.pending_question = {
      id: qid,
      kind: 'choice',
      item_id: g1,
    };
    await store.save(session);

    const { events, emit } = collectEvents();
    await runConvoTurn({
      session,
      pack,
      surfaces,
      learnerText: surfaceTl(g1),
      store,
      model,
      emit,
    });

    const q = events.find((e) => e.type === 'question');
    assert.ok(q && q.type === 'question');
    assert.ok(eventTypes(events).includes('reaction_delta'));
  });

  it('scripted 10 turns: streams stay ordered and session advances', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startConvoSession({
      userId: 'u-10',
      pack,
      store,
      newId: () => 'sess-10',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: (ids) => `[${ids[0]}] Certo!`,
    });

    // Turn 0: bootstrap → first choice question
    {
      const { events, emit } = collectEvents();
      const out = await runConvoTurn({
        session,
        pack,
        surfaces,
        learnerText: '',
        store,
        model,
        emit,
      });
      session = out.session;
      assert.equal(events.at(-1)?.type, 'done');
      assert.ok(session.pending_question);
      assert.equal(session.pending_question?.kind, 'choice');
    }

    // Turns 1–9: answer correctly with item surface for current pending
    for (let i = 1; i <= 9; i++) {
      const pending = session.pending_question;
      assert.ok(pending, `turn ${i} needs pending`);
      const text = surfaceTl(pending.item_id);
      const { events, emit } = collectEvents();
      const out = await runConvoTurn({
        session,
        pack,
        surfaces,
        learnerText: text,
        store,
        model,
        emit,
      });
      session = out.session;

      const types = eventTypes(events);
      // Order: optional coach* → reaction_delta* → question → session → done
      const firstReaction = types.indexOf('reaction_delta');
      const firstQuestion = types.indexOf('question');
      const sessionIdx = types.lastIndexOf('session');
      const doneIdx = types.lastIndexOf('done');
      assert.ok(firstReaction >= 0, `turn ${i} reaction`);
      assert.ok(firstQuestion > firstReaction, `turn ${i} question after reaction`);
      assert.ok(sessionIdx > firstQuestion, `turn ${i} session after question`);
      assert.equal(types[doneIdx], 'done');
      assert.deepEqual(events[doneIdx], { type: 'done', ok: true });

      // Coach events (if any) must appear before reaction
      const coachIdx = types.indexOf('coach');
      if (coachIdx >= 0) {
        assert.ok(coachIdx < firstReaction, `turn ${i} coach before reaction`);
      }
    }

    // After 10 turns (1 boot + 9 answers) some items should have moved past taught
    const progressed = Object.values(session.rungs).filter((r) => r !== 'taught');
    assert.ok(
      progressed.length >= 1,
      `expected rung progress, got ${JSON.stringify(session.rungs)}`,
    );
    assert.ok(model.calls >= 10);
  });

  it('emits metrics before done on every turn', async () => {
    const store = new MemoryConvoSessionStore();
    const { session } = await startConvoSession({
      userId: 'u-metrics',
      pack,
      store,
      newId: () => 'sess-metrics',
    });
    const model = createStubConvoStreamModel({});
    const { events, emit } = collectEvents();
    await runConvoTurn({
      session,
      pack,
      surfaces,
      learnerText: '',
      store,
      model,
      emit,
    });
    const types = eventTypes(events);
    const metricsIdx = types.indexOf('metrics');
    const doneIdx = types.indexOf('done');
    assert.ok(metricsIdx >= 0);
    assert.ok(metricsIdx < doneIdx);
    const m = events[metricsIdx];
    assert.ok(m && m.type === 'metrics');
    assert.ok(m.input_tokens > 0);
    assert.ok(typeof m.ttft_ms === 'number');
    assert.ok(m.total_ms >= 0);
  });

  it('unclear answers still call the model (event path, not grader)', async () => {
    const store = new MemoryConvoSessionStore();
    const session = createConvoSessionDoc({
      id: 'sess-unclear',
      userId: 'u',
      pack,
    });
    const g1 = pack.groups[0].item_ids[0];
    const qid = pack.items[g1].choice_questions[0].id;
    session.pending_question = {
      id: qid,
      kind: 'choice',
      item_id: g1,
    };
    await store.create(session);

    const model = createStubConvoStreamModel({
      byCandidate: (ids) => `[${ids[0]}] Hmm, como?`,
    });
    const { events, emit } = collectEvents();
    const out = await runConvoTurn({
      session,
      pack,
      surfaces,
      learnerText: 'asdfqwer',
      store,
      model,
      emit,
    });

    assert.equal(model.calls, 1);
    assert.ok(model.lastPrompt?.includes('answer unclear'));
    // Unclear does not move the rung
    assert.equal(out.session.rungs[g1], 'taught');
    assert.ok(events.some((e) => e.type === 'coach'));
  });
});
