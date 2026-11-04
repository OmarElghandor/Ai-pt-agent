import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
} from '@/lib/v2/convo/pack';
import {
  MemoryConvoSessionStore,
  startConvoSession,
} from '@/lib/v2/convo/session';
import {
  classifySideChannel,
  hasArabicScript,
  isMixedScript,
  matchPackItemQuestion,
  needsSideChannel,
} from '@/lib/v2/convo/sideChannel';
import {
  createStubConvoStreamModel,
  runConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

const pack = requireConvoPack('pt-PT.day-18', {
  itemSurfaces: loadConvoItemSurfaces(),
});
const surfaces = loadConvoItemSurfaces();

const DAY18_ITEM_IDS = Object.keys(pack.items);

async function sessionWithPending() {
  const store = new MemoryConvoSessionStore();
  const started = await startConvoSession({
    userId: 'u-lang',
    pack,
    store,
    newId: () => `sess-lang-${Math.random().toString(36).slice(2, 8)}`,
  });
  let session = started.session;
  const model = createStubConvoStreamModel({
    byCandidate: (ids) => `[${ids[0]}] Ok!`,
  });
  const { emit } = collectEvents();
  const out = await runConvoTurn({
    session,
    pack,
    surfaces,
    learnerText: '',
    store,
    model,
    emit,
  });
  return { store, session: out.session, model };
}

function collectEvents() {
  const events: ConvoTurnStreamEvent[] = [];
  return {
    events,
    emit: (e: ConvoTurnStreamEvent) => {
      events.push(e);
    },
  };
}

describe('v2 convo · side channel detect/classify (T3.1)', () => {
  it('detects Arabic-only and mixed script', () => {
    assert.equal(needsSideChannel('يمين'), true);
    assert.equal(hasArabicScript('يمين'), true);
    assert.equal(isMixedScript('يعني إيه esquina؟'), true);
    assert.equal(needsSideChannel('direita'), false);
    assert.equal(needsSideChannel('hello'), false);
  });

  it('classifies answer vs language question', () => {
    assert.equal(classifySideChannel('يمين'), 'arabic_answer');
    assert.equal(classifySideChannel('يعني إيه esquina؟'), 'language_question');
    assert.equal(classifySideChannel('ازاي أقول شمال؟'), 'language_question');
    assert.equal(classifySideChannel('ازاي أقول مع رز؟'), 'language_question');
    assert.equal(classifySideChannel('direita'), null);
  });
});

describe('v2 convo · Arabic answer waits (T3.1)', () => {
  it('يمين mid-run gets a coach note; exchanges stay Portuguese-only; model not called', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startConvoSession({
      userId: 'u-ar',
      pack,
      store,
      newId: () => 'sess-ar',
    });
    let session = started.session;
    const model = createStubConvoStreamModel({
      byCandidate: (ids) => `[${ids[0]}] Ok!`,
    });

    // Bootstrap first question
    {
      const { emit } = collectEvents();
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
    }
    assert.ok(session.pending_question);
    const pendingBefore = structuredClone(session.pending_question);
    const exchangesBefore = structuredClone(session.last_exchanges);
    const modelCallsBefore = model.calls;

    // Force pending item to word.right so coach {item} is direita-ish
    session.pending_question = {
      id: pendingBefore!.id,
      kind: pendingBefore!.kind,
      item_id: 'word.right',
    };
    await store.save(session);

    const { events, emit } = collectEvents();
    const out = await runConvoTurn({
      session,
      pack,
      surfaces,
      learnerText: 'يمين',
      store,
      model,
      emit,
    });
    session = out.session;

    const coach = events.find((e) => e.type === 'coach');
    assert.ok(coach && coach.type === 'coach');
    assert.equal(coach.moment, 'arabic_answer');
    assert.match(coach.eg, /direita|Direita/i);

    assert.equal(model.calls, modelCallsBefore, 'character model must not run');
    assert.deepEqual(session.pending_question, {
      id: pendingBefore!.id,
      kind: pendingBefore!.kind,
      item_id: 'word.right',
    });

    for (const ex of session.last_exchanges) {
      assert.doesNotMatch(ex.tl, /[\u0600-\u06FF]/);
    }
    // Learner Arabic must not have been appended
    assert.equal(
      session.last_exchanges.length,
      exchangesBefore.length,
      'exchanges length unchanged',
    );
    assert.ok(!events.some((e) => e.type === 'reaction_delta'));
    assert.deepEqual(events.at(-1), { type: 'done', ok: true });
  });
});

describe('v2 convo · pack-item language questions (T3.2)', () => {
  it('matches every day 18 pack item by tl', () => {
    for (const itemId of DAY18_ITEM_IDS) {
      const tl = surfaces.find((s) => s.id === itemId)?.tl ?? itemId;
      const core = tl.replace(/^(a|à|o)\s+/i, '');
      const match = matchPackItemQuestion(`يعني إيه ${core}؟`, pack, surfaces);
      assert.ok(match, `no match for ${itemId} / ${core}`);
      assert.equal(match.kind, 'item');
      if (match.kind === 'item') {
        assert.equal(match.item_id, itemId);
      }
    }
  });

  it('matches Arabic gloss شمال → word.left', () => {
    const match = matchPackItemQuestion('ازاي أقول شمال؟', pack, surfaces);
    assert.ok(match && match.kind === 'item');
    assert.equal(match.item_id, 'word.left');
  });

  it('matches map node esquina', () => {
    const match = matchPackItemQuestion('يعني إيه esquina؟', pack, surfaces);
    assert.ok(match && match.kind === 'map_node');
    assert.equal(match.node_id, 'corner');
  });

  it('يعني إيه <tl> mid-run: coach + highlight, no model, no Arabic in exchanges', async () => {
    for (const itemId of DAY18_ITEM_IDS) {
      const { store, session: started, model } = await sessionWithPending();
      let session = started;
      const pendingBefore = structuredClone(session.pending_question);
      const callsBefore = model.calls;
      const tl = surfaces.find((s) => s.id === itemId)?.tl ?? itemId;
      const core = tl.replace(/^(a|à|o)\s+/i, '');
      const { events, emit } = collectEvents();
      const out = await runConvoTurn({
        session,
        pack,
        surfaces,
        learnerText: `يعني إيه ${core}؟`,
        store,
        model,
        emit,
      });
      session = out.session;

      assert.equal(model.calls, callsBefore, itemId);
      const coach = events.find((e) => e.type === 'coach');
      assert.ok(coach && coach.type === 'coach', itemId);
      const visual = events.find(
        (e) => e.type === 'visual' && e.highlight_item_id === itemId,
      );
      assert.ok(visual, `highlight for ${itemId}`);
      assert.deepEqual(session.pending_question, pendingBefore);
      for (const ex of session.last_exchanges) {
        assert.doesNotMatch(ex.tl, /[\u0600-\u06FF]/);
      }
    }
  });

  it('ازاي أقول شمال؟ highlights word.left; يعني إيه esquina؟ highlights corner', async () => {
    const { store, session: started, model } = await sessionWithPending();
    let session = started;
    const callsBefore = model.calls;

    {
      const { events, emit } = collectEvents();
      const out = await runConvoTurn({
        session,
        pack,
        surfaces,
        learnerText: 'ازاي أقول شمال؟',
        store,
        model,
        emit,
      });
      session = out.session;
      assert.equal(model.calls, callsBefore);
      assert.ok(
        events.some(
          (e) => e.type === 'visual' && e.highlight_item_id === 'word.left',
        ),
      );
    }

    {
      const { events, emit } = collectEvents();
      const out = await runConvoTurn({
        session,
        pack,
        surfaces,
        learnerText: 'يعني إيه esquina؟',
        store,
        model,
        emit,
      });
      session = out.session;
      assert.equal(model.calls, callsBefore);
      assert.ok(
        events.some(
          (e) => e.type === 'visual' && e.highlight_node_id === 'corner',
        ),
      );
      for (const ex of out.session.last_exchanges) {
        assert.doesNotMatch(ex.tl, /[\u0600-\u06FF]/);
      }
    }
  });
});
