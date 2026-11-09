import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadAuthoredTopicBank } from '@/lib/v2/convo/goals/loadTopicBank';
import {
  emitTeachSequence,
  shouldShowTeachForGoal,
  teachBeatForGoal,
} from '@/lib/v2/convo/goals/teach';
import {
  MemoryConvoSessionStore,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import {
  createStubConvoStreamModel,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import { OPEN_TOPIC_ID } from '@/lib/v2/convo/topics';

describe('conversations v4 · teach start sequence', () => {
  it('teachBeat prefers tl_f / ask_tl_f for female', () => {
    const bank = loadAuthoredTopicBank('direcoes')!;
    const g = structuredClone(bank.goals[0]!);
    g.teach = {
      ...g.teach!,
      tl_f: 'Vens à minha casa hoje! (f) 🏠',
      ar_f: 'ستأتين إلى بيتي اليوم!',
    };
    g.ask_tl_f = 'Vais de metro? (f)';
    g.ask_ar_f = 'ستأتين بالمترو؟';
    const beat = teachBeatForGoal(g, 'f')!;
    assert.equal(beat.character_tl, 'Vens à minha casa hoje! (f) 🏠');
    assert.equal(beat.ask_tl, 'Vais de metro? (f)');
  });

  it('lock plays intro + teach + meaning + ask; De metro advances without model', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'teach-seq',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'teach-seq-session',
      learnerName: 'Omar',
    });
    let session = started.session;
    const bank = loadAuthoredTopicBank('direcoes')!;
    const metro = bank.goals.find((g) => g.id === 'dir.metro')!;
    const station = bank.goals.find((g) => g.id === 'dir.station')!;

    const lockEvents: ConvoTurnStreamEvent[] = [];
    const lock = await runFreeConvoTurn({
      session,
      learnerText: 'عايز أتكلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => {
          throw new Error('model must not run on lock teach');
        },
      }),
      emit: (e) => lockEvents.push(e),
    });
    session = lock.session;
    assert.equal(session.topic_id, 'direcoes');
    assert.equal(session.teaching_mode, true);
    assert.equal(session.teach_shown_for, 'dir.metro');
    assert.equal(session.turns_on_goal, 0);
    assert.ok(lockEvents.some((e) => e.type === 'topic_lock'));
    assert.ok(
      lockEvents.some(
        (e) => e.type === 'coach' && e.eg === bank.intro_eg,
      ),
    );
    const teachBubble = lockEvents.find(
      (e) =>
        e.type === 'bubble_ar' && e.teach_goal_id === 'dir.metro',
    );
    assert.ok(teachBubble && teachBubble.type === 'bubble_ar');
    assert.ok(teachBubble.pt?.includes(metro.teach!.tl));
    assert.ok(teachBubble.pt?.includes(metro.ask_tl!));
    assert.equal(teachBubble.coach_eg, metro.teach!.meaning_eg);
    assert.ok(
      lockEvents.some(
        (e) => e.type === 'question' && e.tl === metro.ask_tl,
      ),
    );

    const turnEvents: ConvoTurnStreamEvent[] = [];
    const next = await runFreeConvoTurn({
      session,
      learnerText: 'De metro.',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => {
          throw new Error('model must not run on teach advance');
        },
      }),
      emit: (e) => turnEvents.push(e),
    });
    session = next.session;
    assert.equal(session.teach_shown_for, 'dir.station');
    assert.ok(
      session.goals.find((g) => g.id === 'dir.metro')?.status === 'done',
    );
    assert.equal(session.current_goal, 'dir.station');
    const stationBubble = turnEvents.find(
      (e) =>
        e.type === 'bubble_ar' && e.teach_goal_id === 'dir.station',
    );
    assert.ok(stationBubble && stationBubble.type === 'bubble_ar');
    assert.ok(stationBubble.pt?.includes(station.teach!.tl));
    // Code recast from metro examples_tl[0] before next teach.
    assert.ok(
      turnEvents.some(
        (e) =>
          e.type === 'bubble_ar' &&
          typeof e.pt === 'string' &&
          e.pt.includes('isso!'),
      ),
    );
    assert.ok(
      !turnEvents.some(
        (e) =>
          e.type === 'coach' && e.id === `teach:${metro.id}`,
      ),
    );
  });

  it('Sim / Farmácia miss twice → assisted; no false complete', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'short-miss',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'short-miss-session',
      learnerName: 'Omar',
    });
    let session = started.session;

    const lock = await runFreeConvoTurn({
      session,
      learnerText: 'عايز أتكلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => {
          throw new Error('no model on lock');
        },
      }),
      emit: () => {},
    });
    session = lock.session;

    // Complete metro → station.
    const toStation = await runFreeConvoTurn({
      session,
      learnerText: 'De metro.',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => {
          throw new Error('no model on advance');
        },
      }),
      emit: () => {},
    });
    session = toStation.session;
    assert.equal(session.current_goal, 'dir.station');

    // Miss 1: Sim → frame + model
    const miss1Events: ConvoTurnStreamEvent[] = [];
    const miss1 = await runFreeConvoTurn({
      session,
      learnerText: 'Sim',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () =>
          'Ah! Estás na estação?\nAR: حسناً!\nGOALS: -',
      }),
      emit: (e) => miss1Events.push(e),
    });
    session = miss1.session;
    assert.equal(
      session.goals.find((g) => g.id === 'dir.station')?.status,
      'open',
    );
    assert.ok(
      miss1Events.some(
        (e) =>
          e.type === 'coach' && e.id === 'goal_steer_frame:dir.station',
      ),
    );
    assert.ok(miss1Events.some((e) => e.type === 'free_frame'));
    assert.equal(session.turns_on_goal, 1);

    // Miss 2: Sim again → assisted, advance to dir.right
    const miss2 = await runFreeConvoTurn({
      session,
      learnerText: 'Sim',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => {
          throw new Error('no model on assisted advance');
        },
      }),
      emit: () => {},
    });
    session = miss2.session;
    assert.equal(
      session.goals.find((g) => g.id === 'dir.station')?.status,
      'assisted',
    );
    assert.equal(session.current_goal, 'dir.right');
    assert.equal(session.teach_shown_for, 'dir.right');
  });

  it('Farmácia alone does not complete dir.next_to; 2 misses → assisted', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'farmacia-miss',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'farmacia-miss-session',
      learnerName: 'Omar',
    });
    let session = started.session;
    session = (
      await runFreeConvoTurn({
        session,
        learnerText: 'عايز أتكلم عن الاتجاهات',
        store,
        model: createStubConvoStreamModel({
          byCandidate: () => {
            throw new Error('no model');
          },
        }),
        emit: () => {},
      })
    ).session;

    // Jump session state to dir.next_to teach already shown.
    for (const id of [
      'dir.metro',
      'dir.station',
      'dir.right',
      'dir.straight',
      'dir.left',
      'dir.street',
    ]) {
      const g = session.goals.find((x) => x.id === id);
      if (g) g.status = 'done';
    }
    session.current_goal = 'dir.next_to';
    session.teach_shown_for = 'dir.next_to';
    session.turns_on_goal = 0;
    await store.save(session);

    session = (
      await runFreeConvoTurn({
        session,
        learnerText: 'Farmácia',
        store,
        model: createStubConvoStreamModel({
          byCandidate: () =>
            'Ao lado da farmácia?\nAR: جنب الصيدلية؟\nGOALS: -',
        }),
        emit: () => {},
      })
    ).session;
    assert.equal(
      session.goals.find((g) => g.id === 'dir.next_to')?.status,
      'open',
    );
    assert.equal(session.turns_on_goal, 1);

    session = (
      await runFreeConvoTurn({
        session,
        learnerText: 'Farmácia',
        store,
        model: createStubConvoStreamModel({
          byCandidate: () => {
            throw new Error('no model on assist');
          },
        }),
        emit: () => {},
      })
    ).session;
    assert.equal(
      session.goals.find((g) => g.id === 'dir.next_to')?.status,
      'assisted',
    );
    assert.equal(session.current_goal, 'dir.behind');
  });

  it('shouldShowTeachForGoal respects teach_shown_for', () => {
    const bank = loadAuthoredTopicBank('direcoes')!;
    const goal = bank.goals[0]!;
    assert.equal(
      shouldShowTeachForGoal(
        {
          teaching_mode: true,
          teach_shown_for: null,
          current_goal: goal.id,
        },
        goal,
      ),
      true,
    );
    assert.equal(
      shouldShowTeachForGoal(
        {
          teaching_mode: true,
          teach_shown_for: goal.id,
          current_goal: goal.id,
        },
        goal,
      ),
      false,
    );
  });

  it('emitTeachSequence sets teach_shown_for without bumping turns', () => {
    const bank = loadAuthoredTopicBank('direcoes')!;
    const goal = bank.goals[0]!;
    const session = {
      id: 's',
      topic_id: 'direcoes',
      teach_shown_for: null as string | null,
      turns_on_goal: 0,
      last_exchanges: [] as Array<{ role: 'character' | 'learner'; tl: string }>,
      pending_question: null as null | { id: string; kind: 'open'; item_id: string },
    };
    const events: ConvoTurnStreamEvent[] = [];
    emitTeachSequence({
      goal,
      session: session as never,
      emit: (e) => events.push(e),
      introEg: bank.intro_eg,
    });
    assert.equal(session.teach_shown_for, goal.id);
    assert.equal(session.turns_on_goal, 0);
    assert.ok(events.some((e) => e.type === 'coach' && e.id.startsWith('intro:')));
  });
});
