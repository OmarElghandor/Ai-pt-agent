import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
} from '@/lib/v2/convo/pack';
import { gradeConvoAnswer } from '@/lib/v2/convo/grade';
import { findPackQuestion } from '@/lib/v2/convo/turn';

const pack = requireConvoPack('pt-PT.day-33', {
  itemSurfaces: loadConvoItemSurfaces(),
});
const surfaces = loadConvoItemSurfaces();

function surfaceTl(id: string): string {
  return surfaces.find((s) => s.id === id)?.tl ?? id;
}

function gradeChoice(questionId: string, learnerText: string) {
  const meta = findPackQuestion(pack, questionId);
  assert.ok(meta);
  return gradeConvoAnswer({
    learnerText,
    question: {
      id: questionId,
      item_id: meta!.item_id,
      mistakes: meta!.mistakes,
    },
    itemTl: surfaceTl(meta!.item_id),
    otherItems: surfaces.filter((s) => s.id !== meta!.item_id),
  });
}

describe('v2 convo grade · day-33 contextual cases', () => {
  it('accepts station with/without article', () => {
    for (const text of ['estação', 'a estação', 'na estação', 'Na estação']) {
      const g = gradeChoice('q_station_choice', text);
      assert.equal(g.verdict, 'correct', text);
    }
  });

  it('accepts na rua for the street question', () => {
    const g = gradeChoice('q_street_choice', 'na rua');
    assert.equal(g.verdict, 'correct');
  });

  it('accepts À direita! for the right turn', () => {
    const g = gradeChoice('q_right_choice', 'À direita!');
    assert.equal(g.verdict, 'correct');
  });

  it('flags left as listed mistake on the right question', () => {
    const g = gradeChoice('q_right_choice', 'à esquerda');
    assert.equal(g.verdict, 'wrong');
    assert.equal(g.mistakeId, 'm_right_left');
  });

  it('accepts é perto', () => {
    const g = gradeChoice('q_near_choice', 'é perto');
    assert.equal(g.verdict, 'correct');
  });

  it('accepts Onde fica a farmácia? for the pattern open', () => {
    const meta = findPackQuestion(pack, 'q_onde_fica_open');
    assert.ok(meta);
    const g = gradeConvoAnswer({
      learnerText: 'Onde fica a farmácia?',
      question: {
        id: 'q_onde_fica_open',
        item_id: meta!.item_id,
        mistakes: meta!.mistakes,
      },
      itemTl: surfaceTl(meta!.item_id),
      otherItems: surfaces.filter((s) => s.id !== meta!.item_id),
    });
    assert.equal(g.verdict, 'correct');
  });
});
