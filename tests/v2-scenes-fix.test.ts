import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCharacter } from '@/lib/v2/characters/registry';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import {
  loadAllSceneBanks,
  loadSceneBank,
} from '@/lib/v2/convo/scenes';
import type { FreeTextCorrection } from '@/lib/v2/grader';

const stubGrader = async (): Promise<FreeTextCorrection> => ({
  has_error: false,
  severity: 'none',
  corrected_tl: '',
  changes: [],
  main_error: null,
  note_eg: '',
  ar: '',
});

/** Closed stub — forces ask_tl fallback of the *next* open goal. */
function closedStub(goalsLine = '-') {
  return createStubConvoStreamModel({
    byCandidate: () =>
      `Olhe, é tudo fresquinho!\nAR: انظر، كل شيء طازج!\nGOALS: ${goalsLine}`,
  });
}

function lastCharacterPt(events: ConvoTurnStreamEvent[]): string {
  const pts = events
    .filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> =>
        e.type === 'bubble_ar',
    )
    .map((e) => e.pt);
  return pts.at(-1) ?? '';
}

async function startCafe(userId: string) {
  const store = new MemoryConvoSessionStore();
  const started = await startFreeConvoSession({
    userId,
    topicId: 'cena-cafe',
    store,
    learnerName: null,
    learnerLevel: 9,
    newId: () => `${userId}-sess`,
  });
  return { store, started };
}

describe.skip('scenes fix · cast + first message', () => {
  it('every scene character_id resolves in the cast registry', () => {
    const banks = loadAllSceneBanks();
    assert.ok(banks.length >= 15);
    for (const bank of banks) {
      const id = bank.scene?.character_id?.trim() ?? '';
      assert.ok(id, `${bank.topic_id} missing character_id`);
      assert.ok(
        getCharacter(id),
        `${bank.topic_id} character_id=${id} not in cast registry`,
      );
    }
  });

  it('cena-cafe session character_id is manuel (not ines)', async () => {
    const { started } = await startCafe('u-cast');
    assert.equal(started.session.character_id, 'manuel');
    assert.equal(loadSceneBank('cena-cafe').scene?.character_id, 'manuel');
  });

  it('first message «quria um cafe por favor» completes cafe.order_drink', async () => {
    const { store, started } = await startCafe('u-first');
    assert.equal(started.session.current_goal, 'cafe.order_drink');
    const events: ConvoTurnStreamEvent[] = [];
    const out = await runFreeConvoTurn({
      session: started.session,
      learnerText: 'quria um cafe por favor',
      store,
      model: closedStub('cafe.order_drink'),
      emit: (e) => events.push(e),
      freeTextGrader: stubGrader,
    });
    assert.equal(
      out.session.goals.find((g) => g.id === 'cafe.order_drink')?.status,
      'done',
    );
    assert.equal(out.session.current_goal, 'cafe.order_food');
    assert.match(lastCharacterPt(events), /Mais alguma coisa\?/i);
  });
});

/** Superseded by batch-rp-3 G1–G18 / batch-rp-4 goldens (format-3 goal ids). */
describe.skip('scenes fix · café script opens the next goal', () => {
  it('each learner line advances reply to the next ask_tl', async () => {
    const { store, started } = await startCafe('u-script');
    let session = started.session;
    const bank = loadSceneBank('cena-cafe');
    const ask = (id: string) =>
      bank.goals.find((g) => g.id === id)!.ask_tl!.trim();

    const steps: Array<{
      text: string;
      expectGoal: string;
      expectAsk: RegExp;
    }> = [
      {
        text: 'quero um cafe',
        expectGoal: 'cafe.order_food',
        expectAsk: /Mais alguma coisa\?/i,
      },
      {
        text: 'Um pastel de nata, por favor.',
        expectGoal: 'cafe.here_or_go',
        expectAsk: /aqui ou para levar/i,
      },
      {
        text: 'Para aqui',
        expectGoal: 'cafe.ask_price',
        expectAsk: /É tudo\?/i,
      },
      {
        text: 'Quanto é?',
        expectGoal: 'cafe.pay',
        expectAsk: /dois euros e sessenta/i,
      },
      {
        text: 'Con cartão',
        expectGoal: 'cafe.contribuinte',
        expectAsk: /contribuinte/i,
      },
      {
        text: 'Nao perciso',
        expectGoal: 'cafe.bye',
        expectAsk: new RegExp(
          ask('cafe.bye').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        ),
      },
    ];

    for (const step of steps) {
      const events: ConvoTurnStreamEvent[] = [];
      const out = await runFreeConvoTurn({
        session,
        learnerText: step.text,
        store,
        model: closedStub(),
        emit: (e) => events.push(e),
        freeTextGrader: stubGrader,
      });
      session = out.session;
      assert.equal(
        session.current_goal,
        step.expectGoal,
        `after «${step.text}» current_goal`,
      );
      assert.match(
        lastCharacterPt(events),
        step.expectAsk,
        `after «${step.text}» reply`,
      );
      // Must not echo the opening ask once we left order_drink.
      if (step.expectGoal !== 'cafe.order_drink') {
        assert.notEqual(lastCharacterPt(events), ask('cafe.order_drink'));
      }
    }
  });
});
