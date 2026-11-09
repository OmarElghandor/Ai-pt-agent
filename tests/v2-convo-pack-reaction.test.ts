import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickPackReaction } from '@/lib/v2/convo/turn/packReaction';
import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoEventFacts } from '@/lib/v2/convo/ladder';

const pack = {
  pack_id: 't',
  day: 1,
  target_lang: 'pt-PT',
  scene: {
    character_id: 'c',
    place: 'p',
    information_gap: 'g',
  },
  visual: {
    type: 'map',
    nodes: [
      { id: 'a', label_tl: 'A' },
      { id: 'b', label_tl: 'B' },
    ],
    route: [{ step_id: 's1', from: 'a', to: 'b', item_id: 'farmácia' }],
  },
  groups: [{ id: 'g1', item_ids: ['farmácia'] }],
  items: {
    farmácia: {
      coach_intro_eg: 'intro',
      choice_questions: [],
      open_questions: [],
      common_mistakes: [],
      reactions_correct: [
        { tl: 'Perfeito! 😊', ar: 'ممتاز!' },
        { tl: 'Isso! 👏', ar: 'كده!' },
      ],
      reactions_near_miss: 'Ah, {correct}! 😊',
    },
  },
  recap: { questions: [{ id: 'r1', tl: 'x', item_id: 'farmácia' }] },
  opening: { tl: 'oi' },
  closing: { tl: 'tchau' },
  bridge: { tl: 'bridge' },
} as ConvoPackData;

const surfaces = [{ id: 'farmácia', tl: 'a farmácia' }];

function event(partial: Partial<ConvoEventFacts>): ConvoEventFacts {
  return {
    verdict: 'correct',
    item_id: 'farmácia',
    ...partial,
  } as ConvoEventFacts;
}

describe('pickPackReaction', () => {
  it('rotates correct reactions and skips the last tl', () => {
    const first = pickPackReaction({
      pack,
      event: event({ verdict: 'correct' }),
      surfaces,
    });
    assert.equal(first.tl, 'Perfeito! 😊');

    const second = pickPackReaction({
      pack,
      event: event({ verdict: 'correct' }),
      surfaces,
      lastCorrectTl: first.tl,
    });
    assert.equal(second.tl, 'Isso! 👏');
    assert.notEqual(second.tl, first.tl);
  });

  it('fills near_miss template with surface', () => {
    const out = pickPackReaction({
      pack,
      event: event({ verdict: 'near_miss', near_miss: true }),
      surfaces,
    });
    assert.equal(out.tl, 'Ah, a farmácia! 😊');
  });

  it('uses consequence_tl for listed mistakes', () => {
    const out = pickPackReaction({
      pack,
      event: event({
        verdict: 'wrong',
        consequence_tl: 'Não, isso é a estação.',
      }),
      surfaces,
    });
    assert.equal(out.tl, 'Não, isso é a estação.');
  });

  it('falls back to Hmm for unclear', () => {
    const out = pickPackReaction({
      pack,
      event: event({ verdict: 'unclear', item_id: undefined }),
      surfaces,
    });
    assert.equal(out.tl, 'Hmm… 🤔');
  });
});
