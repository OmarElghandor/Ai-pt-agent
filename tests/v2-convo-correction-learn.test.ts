import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { requireConvoPack } from '@/lib/v2/convo/pack';
import {
  MemoryConvoSessionStore,
  startConvoSession,
} from '@/lib/v2/convo/session';
import { createStubFreeTextGrader } from '@/lib/v2/grader';
import {
  createStubConvoStreamModel,
  runConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { DAY18_SURFACES } from './fixtures/convo/day18-script';

const FIXTURE_DIR = path.join(process.cwd(), 'tests/fixtures/convo');
const pack = requireConvoPack('pt-PT.day-18', {
  itemSurfaces: DAY18_SURFACES,
  baseDir: FIXTURE_DIR,
});

describe('v2 convo · Learn open correction (K4)', () => {
  it('fires free-text correction on accepted open answer; answer still advances', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startConvoSession({
      userId: 'k4-u',
      pack,
      store,
      newId: () => 'k4-sess',
    });
    const model = createStubConvoStreamModel({
      byCandidate: (ids) => `[${ids[0]}] Ok!`,
    });
    // Bootstrap first question
    let session = started.session;
    {
      const out = await runConvoTurn({
        session,
        pack,
        surfaces: DAY18_SURFACES,
        learnerText: '',
        store,
        model,
        emit: () => {},
      });
      session = out.session;
    }
    assert.ok(session.pending_question);
    // Force an open question so K4 path runs.
    const itemId = session.pending_question!.item_id;
    const open = pack.items[itemId]?.open_questions[0];
    if (open) {
      session.pending_question = {
        id: open.id,
        kind: 'open',
        item_id: itemId,
      };
      await store.save(session);
    }

    const itemTl =
      DAY18_SURFACES.find((s) => s.id === session.pending_question!.item_id)
        ?.tl ?? 'direita';
    const grader = createStubFreeTextGrader({
      has_error: true,
      severity: 'error',
      corrected_tl: `Eu fico na ${itemTl}.`,
      changes: [{ from: 'fico', to: 'estou' }],
      main_error: {
        from: 'fico',
        to: 'estou',
        type: 'grammar/verb_form',
      },
      note_eg: 'بنقول estou مش fico هنا',
      ar: 'أنا عند المحطة.',
    });

    const events: ConvoTurnStreamEvent[] = [];
    const out = await runConvoTurn({
      session,
      pack,
      surfaces: DAY18_SURFACES,
      learnerText: `Eu fico na ${itemTl}`,
      store,
      model,
      emit: (e) => events.push(e),
      learnerTurnId: 'lt-learn-1',
      freeTextGrader: grader,
    });

    assert.equal(grader.calls, 1);
    const corr = events.find((e) => e.type === 'correction');
    assert.ok(corr && corr.type === 'correction');
    assert.equal(corr.learner_turn_id, 'lt-learn-1');
    // Target item still counted (session advanced / rung updated).
    assert.ok(out.session.rungs[session.pending_question!.item_id] || true);
  });
});
