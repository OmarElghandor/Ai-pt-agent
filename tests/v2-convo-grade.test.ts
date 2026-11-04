import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildConvoAcceptedForms,
  gradeConvoAnswer,
} from '@/lib/v2/convo/grade';

const RIGHT = {
  id: 'word.right',
  tl: 'à direita',
};

const LEFT = {
  id: 'word.left',
  tl: 'à esquerda',
};

const TURN_RIGHT = {
  id: 'phrase.turn_right',
  tl: 'Vire à direita.',
};

const STRAIGHT = {
  id: 'phrase.go_straight',
  tl: 'Siga em frente.',
};

const RIGHT_MISTAKES = [
  {
    id: 'm_right_as_left',
    trigger: 'esquerda',
  },
];

function gradeRight(learnerText: string) {
  return gradeConvoAnswer({
    learnerText,
    question: {
      id: 'q_right_open',
      item_id: RIGHT.id,
      mistakes: RIGHT_MISTAKES,
    },
    itemTl: RIGHT.tl,
    mapState: { expected_item_id: RIGHT.id },
    otherItems: [LEFT, STRAIGHT],
  });
}

describe('v2 convo grade · accepted forms', () => {
  it('builds article, accentless, imperative and gender variants', () => {
    const forms = buildConvoAcceptedForms('à direita');
    const lower = forms.map((f) => f.toLowerCase());
    assert.ok(lower.some((f) => f.includes('direita')));
    assert.ok(lower.some((f) => f === 'direita' || f.endsWith(' direita')));
    assert.ok(lower.some((f) => f.includes('direito')));
    assert.ok(lower.some((f) => f.includes('a direita') || f === 'a direita'));

    const turn = buildConvoAcceptedForms('Vire à direita.');
    const turnLower = turn.map((f) => f.toLowerCase());
    assert.ok(turnLower.some((f) => f.startsWith('vira ')));
    assert.ok(turnLower.some((f) => f.startsWith('vire ')));
  });
});

describe('v2 convo grade · day-18 style cases', () => {
  const cases: Array<{
    name: string;
    text: string;
    verdict: 'correct' | 'near_miss' | 'wrong' | 'unclear';
    mistakeId?: string;
  }> = [
    { name: 'bare direita', text: 'direita', verdict: 'correct' },
    { name: 'à direita', text: 'à direita', verdict: 'correct' },
    { name: 'Vira à direita', text: 'Vira à direita', verdict: 'correct' },
    { name: 'Vire à direita', text: 'Vire à direita', verdict: 'correct' },
    { name: 'a direita', text: 'a direita', verdict: 'correct' },
    { name: 'gender direito', text: 'direito', verdict: 'correct' },
    { name: 'À Direita caps', text: 'À Direita', verdict: 'correct' },
    { name: 'accentless a direita', text: 'a direita', verdict: 'correct' },
    { name: 'trailing punct', text: 'à direita!', verdict: 'correct' },
    { name: 'por favor tail still needs core', text: 'direita', verdict: 'correct' },
    {
      name: 'esquerda when map shows right',
      text: 'esquerda',
      verdict: 'wrong',
      mistakeId: 'm_right_as_left',
    },
    {
      name: 'à esquerda when map shows right',
      text: 'à esquerda',
      verdict: 'wrong',
      mistakeId: 'm_right_as_left',
    },
    {
      name: 'Vira à esquerda wrong way',
      text: 'Vira à esquerda',
      verdict: 'wrong',
      mistakeId: 'm_right_as_left',
    },
    { name: 'empty text', text: '', verdict: 'unclear' },
    { name: 'whitespace only', text: '   ', verdict: 'unclear' },
    { name: 'mixed garbage', text: 'asdf qwerty', verdict: 'unclear' },
    { name: 'arabic-looking latin garbage', text: 'xyz123', verdict: 'unclear' },
    { name: 'unrelated portuguese', text: 'bom dia', verdict: 'unclear' },
    { name: 'siga when expecting right', text: 'Siga em frente', verdict: 'wrong' },
    { name: 'go_straight phrase', text: 'siga em frente.', verdict: 'wrong' },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = gradeRight(c.text);
      assert.equal(
        result.verdict,
        c.verdict,
        `${c.name}: got ${result.verdict} for "${c.text}"`,
      );
      if (c.mistakeId) {
        assert.equal(result.mistakeId, c.mistakeId);
      }
      assert.ok(result.itemIds.includes(RIGHT.id));
    });
  }

  it('grades turn-right phrase with vire/vira', () => {
    const correct = gradeConvoAnswer({
      learnerText: 'Vira à direita',
      question: { id: 'q_turn', item_id: TURN_RIGHT.id },
      itemTl: TURN_RIGHT.tl,
    });
    assert.equal(correct.verdict, 'correct');

    const bare = gradeConvoAnswer({
      learnerText: 'direita',
      question: { id: 'q_turn', item_id: TURN_RIGHT.id },
      itemTl: TURN_RIGHT.tl,
    });
    assert.equal(bare.verdict, 'correct');
  });

  it('grades go_straight accepted forms', () => {
    const result = gradeConvoAnswer({
      learnerText: 'Siga em frente',
      question: { id: 'q_straight', item_id: STRAIGHT.id },
      itemTl: STRAIGHT.tl,
    });
    assert.equal(result.verdict, 'correct');
  });

  it('returns near_miss for a known static pair', () => {
    const result = gradeConvoAnswer({
      learnerText: 'Sou cansado',
      question: { id: 'q_x', item_id: 'phrase.im_tired' },
      itemTl: 'Estou cansado',
    });
    assert.equal(result.verdict, 'near_miss');
  });
});
