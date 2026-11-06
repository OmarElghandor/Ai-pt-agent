import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gradeConvoAnswer } from '@/lib/v2/convo/grade';
import { contentWord, levenshtein, matchAnswer } from '@/lib/v2/answers/match';

describe('v2 convo M5 spelling near_miss', () => {
  const pharmacy = { id: 'word.pharmacy', tl: 'a farmácia' };
  const street = { id: 'word.street', tl: 'a rua' };
  const station = { id: 'word.station', tl: 'a estação' };

  it('farácia / farmacia → near_miss for pharmacy', () => {
    for (const text of ['farácia', 'farmacia', 'Uma farácia']) {
      const g = gradeConvoAnswer({
        learnerText: text,
        question: { id: 'q_ph', item_id: pharmacy.id },
        itemTl: pharmacy.tl,
        otherItems: [street, station],
      });
      assert.equal(g.verdict, 'near_miss', text);
    }
  });

  it('estaçao / a estacão → near_miss for station', () => {
    for (const text of ['estaçao', 'a estacão']) {
      const g = gradeConvoAnswer({
        learnerText: text,
        question: { id: 'q_st', item_id: station.id },
        itemTl: station.tl,
        otherItems: [street, pharmacy],
      });
      assert.equal(g.verdict, 'near_miss', text);
    }
  });

  it('Uma farácia on a street question stays wrong', () => {
    const g = gradeConvoAnswer({
      learnerText: 'Uma farácia',
      question: { id: 'q_street', item_id: street.id },
      itemTl: street.tl,
      otherItems: [pharmacy, station],
    });
    assert.equal(g.verdict, 'wrong');
  });

  it('levenshtein helper', () => {
    assert.equal(levenshtein('farmacia', 'faracia'), 1);
    assert.equal(contentWord('a farmácia'), 'farmácia');
    assert.equal(matchAnswer('farácia', ['a farmácia']).kind, 'spelling');
  });
});
