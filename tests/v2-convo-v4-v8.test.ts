import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  playGolden,
  type GoldenScript,
} from '@/lib/v2/convo/golden/harness';

const GOLDEN_1: GoldenScript = {
  id: 'g1-intro',
  level: 1,
  turns: [
    {
      learner: 'Ola bom dia.',
      check: {
        expectGreetingReask: true,
        forbidTopicDrift: ['comida', 'fizeste', 'aconteceu'],
      },
    },
    {
      learner: 'quero falar de apresentações',
      modelReply:
        'Bom dia! É o novo colega?\nAR: صباح الخير!\nGOALS: -',
      check: {
        expectTopicId: 'day-1',
        expectQuestion: true,
        forbidTopicDrift: ['comida', 'restaurante'],
      },
    },
    {
      learner: 'Eu sou egito',
      modelReply:
        'Ah, é do Egito! E como se chama?\nAR: أه، من مصر!\nGOALS: -',
      check: {
        expectQuestion: true,
        forbidTopicDrift: ['comida'],
      },
    },
    {
      learner: 'mutio bem.',
      modelReply: 'Muito bem! E o seu nome?\nAR: ممتاز!\nGOALS: -',
      check: { expectQuestion: true },
    },
    {
      learner: 'مش عارف',
      check: { expectQuestion: false },
    },
    {
      learner: 'Chamo-me Omar. E a senhora, como se chama?',
      modelReply:
        'Chamo-me Inês. Muito prazer!\nAR: اسمي إينيس!\nGOALS: -',
      check: { expectQuestion: false },
    },
    {
      learner: 'Igualmente',
      modelReply: 'Igualmente! Até logo?\nAR: كذلك!\nGOALS: -',
      check: { expectQuestion: true },
    },
    {
      learner: 'Boa tarde!',
      modelReply: 'Boa tarde! Até amanhã!\nAR: مساء الخير!\nGOALS: -',
      check: { expectQuestion: true },
    },
  ],
};

const GOLDEN_2: GoldenScript = {
  id: 'g2-direcoes',
  level: 1,
  // Start open — resolver must resolve direcoes after lock (no injected topic).
  turns: [
    {
      learner: 'عايز أتكلم عن الاتجاهات',
      check: {
        expectTopicId: 'direcoes',
        expectTeaching: true,
        expectTeachGoalId: 'dir.metro',
        expectTeachShownFor: 'dir.metro',
        expectCurrentGoal: 'dir.metro',
        expectQuestion: true,
      },
    },
    {
      learner: 'De metro.',
      check: {
        expectTeaching: true,
        expectGoalDone: 'dir.metro',
        expectTeachGoalId: 'dir.station',
        expectTeachShownFor: 'dir.station',
        expectCurrentGoal: 'dir.station',
        expectQuestion: true,
      },
    },
    {
      learner: 'Estou na estação.',
      check: {
        expectGoalDone: 'dir.station',
        expectTeachGoalId: 'dir.right',
        expectCurrentGoal: 'dir.right',
      },
    },
    {
      learner: 'À direita.',
      check: {
        expectGoalDone: 'dir.right',
        expectTeachGoalId: 'dir.straight',
        expectCurrentGoal: 'dir.straight',
      },
    },
    {
      learner: 'Em frente.',
      check: {
        expectGoalDone: 'dir.straight',
        expectTeachGoalId: 'dir.left',
        expectTeachShownFor: 'dir.left',
        expectCurrentGoal: 'dir.left',
      },
    },
    {
      learner: 'a direita?',
      check: {
        expectNoTeachReplay: 'dir.left',
        expectTeachShownFor: 'dir.left',
        expectCurrentGoal: 'dir.left',
        expectQuestion: true,
      },
    },
    {
      learner: 'esquerda!',
      check: {
        expectGoalDone: 'dir.left',
        expectNoTeachReplay: 'dir.left',
      },
    },
  ],
};

const GOLDEN_3: GoldenScript = {
  id: 'g3-casa',
  level: 20,
  topicId: 'casa',
  turns: [
    {
      learner: '',
      modelReply:
        'Olá! A tua casa é grande ou pequena?\nAR: مرحباً!\nGOALS: -',
      check: { expectQuestion: true },
    },
    {
      learner: 'A minha casa é pequena.',
      modelReply: 'Fixe! E tem jardim?\nAR: رائع!\nGOALS: -',
      check: { expectQuestion: true },
    },
    {
      learner: 'Não, não tem jardim. Tem duas janelas.',
      modelReply:
        'Ah, ok! Onde passas mais tempo em casa?\nAR: حسناً!\nGOALS: -',
      check: { expectQuestion: false },
    },
  ],
};

const GOLDEN_4: GoldenScript = {
  id: 'g4-futebol',
  level: 20,
  turns: [
    {
      learner: 'quero falar de futebol',
      check: {
        // Generated / new topic: teaching or chips until bank exists
        expectQuestion: true,
      },
    },
  ],
};

describe('conversations v4 · V8 golden conversations', () => {
  it('golden 1 · level 1 intro (greeting then day-1 goals)', async () => {
    const rows = await playGolden(GOLDEN_1);
    for (const r of rows) {
      assert.ok(r.ok, `${r.learner}: ${r.failures.join('; ')}`);
    }
    assert.equal(rows[0]?.topic_locked, false);
    assert.ok(rows.some((r) => r.topic_id === 'day-1'));
  });

  it('golden 2 · directions teach through dir.left (wrong then correct)', async () => {
    const rows = await playGolden(GOLDEN_2);
    for (const r of rows) {
      assert.ok(r.ok, `${r.learner}: ${r.failures.join('; ')}`);
    }
    assert.equal(rows[0]?.topic_id, 'direcoes');
    assert.equal(rows[0]?.teaching_mode, true);
    assert.ok(
      rows[0]?.character_tls.some((t) => /Vens à minha casa/i.test(t)),
    );
    assert.ok(
      rows[1]?.character_tls.some((t) => /Sais na estação Anjos/i.test(t)),
    );
    const wrong = rows.find((r) => r.learner === 'a direita?');
    assert.ok(wrong);
    assert.equal(wrong.current_goal, 'dir.left');
    assert.equal(wrong.teach_shown_for, 'dir.left');
    const leftDone = rows.at(-1);
    assert.ok(leftDone?.ok);
    assert.equal(leftDone?.current_goal !== 'dir.left' || leftDone.goals_done >= 5, true);
  });

  it('golden 3 · casa at 20 stays goal-driven', async () => {
    const rows = await playGolden(GOLDEN_3);
    for (const r of rows) {
      assert.ok(r.ok, `${r.learner}: ${r.failures.join('; ')}`);
    }
    assert.ok(rows.every((r) => r.goals_open + r.goals_done > 0));
  });

  it('golden 4 · futebol request at 20 is handled', async () => {
    const rows = await playGolden(GOLDEN_4);
    for (const r of rows) {
      assert.ok(r.ok, `${r.learner}: ${r.failures.join('; ')}`);
    }
    assert.ok(rows[0]?.character_tls.length || rows[0]?.events.length);
  });
});
