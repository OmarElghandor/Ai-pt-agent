/**
 * batch-rp-4 acceptance R4-1…R4-8 (2026-11-20).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, before } from 'node:test';
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
  clearSceneLoadCache,
  loadSceneBank,
  loadSceneIndex,
  messageContainsKeyword,
  sceneKeywordMatchKind,
  validateSceneBank,
} from '@/lib/v2/convo/scenes';
import type { SceneQwenResult } from '@/lib/v2/convo/scenes/qwenScene';

const OTHER: SceneQwenResult = {
  kind: 'other',
  goal: null,
  option: null,
  corrected: '',
  has_error: false,
  note_eg: '',
};

const CHAR_BY_SCENE: Record<string, string> = {
  'cena-cafe': 'manuel',
  'cena-mercado': 'manuel',
  'cena-restaurante': 'manuel',
  'cena-supermercado': 'rita',
  'cena-comboio': 'rita',
  'cena-consulta': 'rita',
  'cena-financas': 'rita',
  'cena-encomenda': 'tiago',
  'cena-telefone': 'tiago',
  'cena-vizinha': 'graca',
  'cena-direcoes': 'carlos',
  'cena-quarto': 'carlos',
  'cena-avaria': 'carlos',
  'cena-farmacia': 'sofia',
  'cena-roupa': 'ines',
};

type GoldenTurn = {
  learner: string | null;
  bubble: string;
  coach: string | null;
  end_card: boolean;
};

function loadGoldens(): Record<string, GoldenTurn[]> {
  const raw = JSON.parse(
    readFileSync(
      resolve('tests/fixtures/v2-scenes-goldens.pt-PT.json'),
      'utf8',
    ),
  ) as { scenes: Record<string, GoldenTurn[]> };
  return raw.scenes;
}

function fillName(s: string): string {
  return s.replaceAll('{name}', 'Omar');
}

async function startScene(sceneId: string, userId: string) {
  const store = new MemoryConvoSessionStore();
  const started = await startFreeConvoSession({
    userId,
    topicId: sceneId,
    store,
    learnerName: 'Omar',
    learnerGender: 'm',
    learnerLevel: 9,
    newId: () => `${userId}-sess`,
  });
  return { store, started };
}

function lastBubble(
  events: ConvoTurnStreamEvent[],
): Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> | undefined {
  const bs = events.filter(
    (e): e is Extract<ConvoTurnStreamEvent, { type: 'bubble_ar' }> =>
      e.type === 'bubble_ar',
  );
  return bs[bs.length - 1];
}

function coachLines(events: ConvoTurnStreamEvent[]): string[] {
  return events
    .filter(
      (e): e is Extract<ConvoTurnStreamEvent, { type: 'coach' }> =>
        e.type === 'coach',
    )
    .map((e) => e.eg);
}

async function turn(
  store: MemoryConvoSessionStore,
  session: Awaited<ReturnType<typeof startScene>>['started']['session'],
  text: string,
  stubQwen: SceneQwenResult | Promise<SceneQwenResult> = OTHER,
) {
  const events: ConvoTurnStreamEvent[] = [];
  const out = await runFreeConvoTurn({
    session,
    learnerText: text,
    store,
    model: createStubConvoStreamModel({
      byCandidate: () => 'SHOULD_NOT_REACH_BUBBLE',
    }),
    emit: (e) => events.push(e),
    stubSceneQwen: stubQwen,
    learnerName: 'Omar',
    learnerGender: 'm',
  });
  return { out, events, session: out.session };
}

async function advanceCafeToPay(
  store: MemoryConvoSessionStore,
  session: Awaited<ReturnType<typeof startScene>>['started']['session'],
) {
  let s = session;
  for (const say of [
    'quero um galão',
    'grande',
    'quente',
    'sem açúcar',
    'um pastel de nata',
    'e uma agua',
    'fresca',
    'Comer para aqui.',
    'é tudo, a conta?',
  ]) {
    s = (await turn(store, s, say)).out.session;
  }
  assert.equal(s.current_goal, 'pay');
  return s;
}

before(() => {
  clearSceneLoadCache();
});

describe('batch-rp-4 R4-1…R4-8', () => {
  it('R4-1 · all 15 scenes load and pass the validator; index order', () => {
    const index = loadSceneIndex();
    assert.deepEqual(
      index.path.map((p) => p.id),
      [
        'cena-cafe',
        'cena-mercado',
        'cena-supermercado',
        'cena-encomenda',
        'cena-restaurante',
        'cena-vizinha',
        'cena-telefone',
        'cena-comboio',
        'cena-direcoes',
        'cena-consulta',
        'cena-farmacia',
        'cena-roupa',
        'cena-quarto',
        'cena-avaria',
        'cena-financas',
      ],
    );
    for (const entry of index.path) {
      const bank = loadSceneBank(entry.id);
      assert.equal(bank.format, 3);
      const { ok, issues } = validateSceneBank(bank);
      assert.equal(ok, true, `${entry.id}: ${JSON.stringify(issues)}`);
    }
  });

  it('R4-2 · goldens for every scene', async () => {
    const goldens = loadGoldens();
    assert.equal(Object.keys(goldens).length, 15);

    for (const [sceneId, turns] of Object.entries(goldens)) {
      const { store, started } = await startScene(sceneId, `r42-${sceneId}`);
      // Opening turn (learner null)
      const opening = turns[0]!;
      assert.equal(
        fillName(started.opening.character.tl),
        fillName(opening.bubble),
        `${sceneId} opening bubble`,
      );
      if (opening.coach) {
        assert.equal(
          started.opening.character.coach_eg?.trim() || null,
          opening.coach,
          `${sceneId} opening coach`,
        );
      }

      let session = started.session;
      for (let i = 1; i < turns.length; i++) {
        const step = turns[i]!;
        assert.ok(step.learner != null, `${sceneId} turn ${i} needs learner`);
        const { out, events } = await turn(
          store,
          session,
          fillName(step.learner!),
        );
        session = out.session;
        const bubble = lastBubble(events);
        assert.ok(bubble, `${sceneId} turn ${i} missing bubble`);
        assert.equal(
          fillName(bubble!.pt ?? ''),
          fillName(step.bubble),
          `${sceneId} turn ${i} bubble`,
        );
        const coaches = [
          ...coachLines(events).filter((c) => !c.startsWith('خلصت')),
          ...(bubble!.coach_eg?.trim() ? [bubble!.coach_eg.trim()] : []),
        ];
        if (step.coach) {
          assert.ok(
            coaches.some((c) => c === step.coach),
            `${sceneId} turn ${i} coach want ${step.coach}, got ${JSON.stringify(coaches)}`,
          );
        } else {
          assert.equal(
            bubble!.coach_eg?.trim() || null,
            null,
            `${sceneId} turn ${i} unexpected bubble coach_eg`,
          );
        }
        if (step.end_card) {
          const done = events.find(
            (e) => e.type === 'coach' && e.id === 'scene_done',
          );
          assert.ok(done, `${sceneId} turn ${i} missing end card`);
          assert.equal(session.status, 'done');
        }
      }
    }
  });

  it('R4-3 · character_id per scene', () => {
    for (const [sceneId, charId] of Object.entries(CHAR_BY_SCENE)) {
      const bank = loadSceneBank(sceneId);
      assert.equal(
        bank.scene?.character_id,
        charId,
        `${sceneId} character_id`,
      );
    }
  });

  it('R4-4 · typo tolerance', () => {
    assert.equal(sceneKeywordMatchKind('cartão', 'caráo'), 'fuzzy');
    assert.equal(messageContainsKeyword('com caráo', 'cartão'), true);
    assert.equal(sceneKeywordMatchKind('preço', 'preto'), null);
    assert.equal(messageContainsKeyword('preto', 'preço'), false);
    assert.equal(sceneKeywordMatchKind('quanto', 'quarto'), null);
    assert.equal(messageContainsKeyword('quarto', 'quanto'), false);
  });

  it('R4-5 · close but wrong → stop, then accent advances', async () => {
    const { store, started } = await startScene('cena-cafe', 'r45');
    let session = await advanceCafeToPay(store, started.session);

    const stop = await turn(store, session, 'com caráo');
    session = stop.out.session;
    assert.equal(session.current_goal, 'pay');
    assert.equal(lastBubble(stop.events), undefined);
    const coach = stop.events.find(
      (e) => e.type === 'coach' && e.moment === 'close_but_wrong',
    );
    assert.ok(coach && coach.type === 'coach');
    assert.match(coach.eg, /قصدك \*\*cartão\*\*/);
    assert.ok(coach.suggest?.some((s) => /cartão/i.test(s)));

    const ok = await turn(store, session, 'com cartao');
    session = ok.out.session;
    assert.equal(session.current_goal, 'contribuinte');
    const bubble = lastBubble(ok.events);
    assert.ok(bubble?.pt?.includes('Quer fatura com contribuinte?'));
    const correction = ok.events.find((e) => e.type === 'correction');
    assert.ok(correction && correction.type === 'correction');
    assert.match(correction.corrected_tl, /cartão/i);
  });

  it('R4-6 · second close-but-wrong accepts as assisted', async () => {
    const { store, started } = await startScene('cena-cafe', 'r46');
    let session = await advanceCafeToPay(store, started.session);

    session = (await turn(store, session, 'com caráo')).out.session;
    assert.equal(session.current_goal, 'pay');

    const second = await turn(store, session, 'com caráo');
    session = second.out.session;
    assert.equal(session.current_goal, 'contribuinte');
    const pay = session.goals.find((g) => g.id === 'pay');
    assert.equal(pay?.status, 'assisted');
    assert.ok(lastBubble(second.events)?.pt?.includes('contribuinte'));
  });

  it('R4-7 · Qwen-only misspelled answer_word stops', async () => {
    const { store, started } = await startScene('cena-farmacia', 'r47');
    let session = started.session;
    // Reach problem goal: opening → problem
    assert.equal(session.current_goal, 'problem');

    const stop = await turn(store, session, 'tenho tose', {
      kind: 'answer',
      goal: 'problem',
      option: 'tosse',
      corrected: 'Tenho tosse.',
      has_error: true,
      note_eg: 'tose → tosse',
      answer_word: 'tosse',
      answer_word_misspelled: true,
    });
    session = stop.out.session;
    assert.equal(session.current_goal, 'problem');
    assert.equal(lastBubble(stop.events), undefined);
    const coach = stop.events.find(
      (e) => e.type === 'coach' && e.moment === 'close_but_wrong',
    );
    assert.ok(coach && coach.type === 'coach');
    assert.match(coach.eg, /tosse/);

    const advance = await turn(store, session, 'tenho tosse', {
      kind: 'answer',
      goal: 'problem',
      option: 'tosse',
      corrected: 'Tenho tosse.',
      has_error: false,
      note_eg: '',
      answer_word: 'tosse',
      answer_word_misspelled: false,
    });
    // exact keyword should advance without needing Qwen; stub other is fine too
    void advance;
  });

  it('R4-7b · Qwen has_error without misspell → advance + card', async () => {
    const { store, started } = await startScene('cena-farmacia', 'r47b');
    const { out, events } = await turn(store, started.session, 'tenho tosse', {
      kind: 'answer',
      goal: 'problem',
      option: 'tosse',
      corrected: 'Tenho tosse.',
      has_error: true,
      note_eg: 'تمام',
      answer_word: 'tosse',
      answer_word_misspelled: false,
    });
    // Code matches tosse exactly → advances; correction still shown if Qwen says so
    assert.notEqual(out.session.current_goal, 'problem');
    assert.ok(lastBubble(events));
  });

  it('R4-8 · out-of-context answer_word ignored (no stop)', async () => {
    const { store, started } = await startScene('cena-cafe', 'r48');
    let session = started.session;
    for (const say of [
      'quero um galão',
      'grande',
      'quente',
      'sem açúcar',
      'um pastel de nata',
      'e uma agua',
    ]) {
      session = (await turn(store, session, say)).out.session;
    }
    assert.equal(session.current_goal, 'water_type');

    // No code keyword match for gibberish; Qwen claims café (not an option word here).
    const { out, events } = await turn(store, session, 'xyzzy café please', {
      kind: 'answer',
      goal: 'water_type',
      option: 'natural',
      corrected: 'Natural.',
      has_error: false,
      note_eg: '',
      answer_word: 'café',
      answer_word_misspelled: true,
    });
    // answer_word café ignored → no close-but-wrong stop from Qwen fields;
    // may miss or advance via option if somehow matched — must not emit قصدك café
    const coach = events.find(
      (e) =>
        e.type === 'coach' &&
        e.moment === 'close_but_wrong' &&
        e.eg.includes('café'),
    );
    assert.equal(coach, undefined);
    void out;
  });
});
