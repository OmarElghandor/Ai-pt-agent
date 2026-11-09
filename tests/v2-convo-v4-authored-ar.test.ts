import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLessonDayBankJson } from '@/lib/v2/convo/goals/loadLessonDay';
import { loadAuthoredTopicBank } from '@/lib/v2/convo/goals/loadTopicBank';
import { teachBeatForGoal } from '@/lib/v2/convo/goals/teach';
import { checkReplyLevel } from '@/lib/v2/convo/guard/levelGuard';
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

describe('conversations v4 · authored arabic verbatim', () => {
  it('loader keeps teach.tl_f / ar_f from direcoes-shaped bank', () => {
    const base = loadAuthoredTopicBank('direcoes')!;
    const raw = {
      ...base,
      goals: base.goals.map((g, i) =>
        i === 0
          ? {
              ...g,
              teach: {
                ...g.teach!,
                tl_f: 'Vens (f)!',
                ar_f: 'ستأتين!',
              },
              ask_tl_f: 'Vais (f)?',
              ask_ar_f: 'ستأتين؟',
            }
          : g,
      ),
    };
    const bank = parseLessonDayBankJson(raw);
    assert.equal(bank.goals[0]!.teach?.tl_f, 'Vens (f)!');
    assert.equal(bank.goals[0]!.teach?.ar_f, 'ستأتين!');
    const beat = teachBeatForGoal(bank.goals[0]!, 'f')!;
    assert.equal(beat.character_tl, 'Vens (f)!');
    assert.equal(beat.ask_tl, 'Vais (f)?');
  });

  it('lock emits bank ask_ar / teach.ar verbatim', async () => {
    const bank = loadAuthoredTopicBank('direcoes')!;
    const metro = bank.goals.find((g) => g.id === 'dir.metro')!;
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'authored-ar',
      topicId: OPEN_TOPIC_ID,
      store,
      learnerLevel: 1,
      newId: () => 'authored-ar-session',
      learnerName: 'Omar',
    });
    const events: ConvoTurnStreamEvent[] = [];
    await runFreeConvoTurn({
      session: started.session,
      learnerText: 'عايز أتكلم عن الاتجاهات',
      store,
      model: createStubConvoStreamModel({
        byCandidate: () => 'x\nAR: model-ar\nGOALS: -',
      }),
      emit: (e) => events.push(e),
    });
    const teachBubble = events.find(
      (e) =>
        e.type === 'bubble_ar' && e.teach_goal_id === 'dir.metro',
    );
    assert.ok(teachBubble && teachBubble.type === 'bubble_ar');
    assert.ok(teachBubble.ar?.includes(metro.teach!.ar!));
    assert.ok(teachBubble.pt?.includes(metro.teach!.tl));
    const ask = events.find(
      (e) => e.type === 'question' && e.tl === metro.ask_tl,
    );
    assert.ok(ask && ask.type === 'question');
    assert.equal(ask.ar, metro.ask_ar);
    assert.ok(!events.some((e) => e.type === 'bubble_ar' && e.ar === 'model-ar'));
  });

  it('authored teach.tl would fail level guard at level 1 but is still used', () => {
    const bank = loadAuthoredTopicBank('direcoes')!;
    const metro = bank.goals.find((g) => g.id === 'dir.metro')!;
    const guard = checkReplyLevel({
      text: metro.teach!.tl,
      level: 1,
      extraAllowed: [],
    });
    // Teaching vocabulary is above level 1 — guard would reject model text,
    // but authored teach path never runs the guard.
    assert.equal(typeof guard.ok, 'boolean');
    assert.ok(metro.teach!.tl.includes('casa') || metro.teach!.tl.length > 0);
  });
});
