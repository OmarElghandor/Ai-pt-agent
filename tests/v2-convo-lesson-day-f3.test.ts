import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGoalConvoTurn } from '@/lib/v2/convo/output';
import { buildGoalFreePrompt } from '@/lib/v2/convo/prompt';
import {
  MemoryConvoSessionStore,
  buildFreeOpeningBubbles,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';
import { freeTopicById } from '@/lib/v2/convo/topics';
import { loadGoalsForDay } from '@/lib/v2/convo/goals';

describe('conversations v3 fix F3 lesson-day opening and framing', () => {
  it('day-1 opening is bank opening, not «Sobre o que…»', async () => {
    const store = new MemoryConvoSessionStore();
    const started = await startFreeConvoSession({
      userId: 'f3-u',
      topicId: 'open',
      store,
      lessonDay: 1,
      newId: () => 'f3-sess',
      learnerName: 'Omar',
    });
    assert.match(started.opening.character.tl, /É o novo colega/);
    assert.ok(!/Sobre o que queres falar/i.test(started.opening.character.tl));
    assert.ok(
      started.opening.coach_intros.some((c) =>
        /أول يوم في الشغل/.test(c.coach_intro_eg),
      ),
    );
    assert.equal(started.session.scene?.address, 'formal');
  });

  it('female opening uses tl_f', () => {
    const topic = freeTopicById('open')!;
    const bank = loadGoalsForDay(1);
    const bubbles = buildFreeOpeningBubbles(topic, {
      lessonDay: 1,
      bank,
      learnerGender: 'f',
    });
    assert.match(bubbles.character.tl, /É a nova colega/);
  });

  it('TOPIC prompt includes formal address', () => {
    const built = buildGoalFreePrompt({
      module: 'free',
      pack: null,
      freeTopicTitle: 'Apresentar-se',
      freeTopicPlace: 'o escritório',
      sceneTimeOfDay: 'morning',
      sceneAddress: 'formal',
      event: {
        verdict: 'correct',
        item_id: '',
        question_id: 'q',
        question_kind: 'open',
        phase: 'teaching',
      },
      candidates: [],
      lastExchanges: [],
      learnerAnswer: 'Bom dia!',
      currentGoalLine: 'steer toward: greet',
    });
    const topic = built.parts.find((p) => p.label === 'TOPIC')!.text;
    assert.match(topic, /formal/i);
    assert.match(topic, /o senhor|a senhora/i);
  });

  it('parseGoal allows formal when allowFormal', () => {
    const text =
      'Qual é o seu nome?\nAR: ما اسمك؟\nGOALS: -';
    const banned = parseGoalConvoTurn(text);
    assert.equal(banned.decision, 'regenerate');
    assert.ok(banned.extraIssues.includes('formal'));
    const ok = parseGoalConvoTurn(text, { allowFormal: true });
    assert.equal(ok.decision, 'ok');
  });
});
