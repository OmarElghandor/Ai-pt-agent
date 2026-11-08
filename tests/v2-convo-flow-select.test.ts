import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
  type ConvoPackData,
} from '@/lib/v2/convo/pack';
import { selectConvoCandidates } from '@/lib/v2/convo/select';
import { createConvoSessionDoc } from '@/lib/v2/convo/session';

const surfaces = loadConvoItemSurfaces();
const pack = requireConvoPack('pt-PT.day-33', { itemSurfaces: surfaces });

/** Minimal generated-style pack: flow lists item ids, not question ids. */
function itemIdFlowPack(): ConvoPackData {
  return {
    pack_id: 'pt-PT.day-1',
    day: 1,
    target_lang: 'pt-PT',
    scene: {
      character_id: 'ines',
      place: 'café',
      information_gap: 'greetings',
    },
    visual: { type: 'scene_card', image_id: 'x', hotspots: [] },
    groups: [
      {
        id: 'g1',
        item_ids: ['phrase.hello', 'phrase.good_morning'],
        flow: ['phrase.hello', 'phrase.good_morning'],
      },
    ],
    items: {
      'phrase.hello': {
        choice_questions: [
          {
            id: 'q_ola_choice',
            tl: 'Como se diz hello?',
            option_ids: ['phrase.hello', 'phrase.good_morning'],
            correct_id: 'phrase.hello',
          },
        ],
        open_questions: [
          {
            id: 'q_ola_open',
            tl: 'Diz olá.',
            item_id: 'phrase.hello',
          },
        ],
        common_mistakes: [],
        reactions_correct: [{ tl: 'Isso!' }],
        reactions_near_miss: [{ tl: 'Quase.' }],
        coach_intro_eg: 'hello',
      },
      'phrase.good_morning': {
        choice_questions: [
          {
            id: 'q_bom_dia_choice',
            tl: 'Bom dia?',
            option_ids: ['phrase.good_morning', 'phrase.hello'],
            correct_id: 'phrase.good_morning',
          },
        ],
        open_questions: [
          {
            id: 'q_bom_dia_open',
            tl: 'Diz bom dia.',
            item_id: 'phrase.good_morning',
          },
        ],
        common_mistakes: [],
        reactions_correct: [{ tl: 'Isso!' }],
        reactions_near_miss: [{ tl: 'Quase.' }],
        coach_intro_eg: 'bom dia',
      },
    },
    recap: {
      questions: [
        { id: 'q_recap_1', tl: 'Olá?', item_id: 'phrase.hello' },
      ],
    },
    opening: { tl: 'Olá!' },
    closing: { tl: 'Tchau!' },
    bridge: { tl: 'Depois falamos.' },
  };
}

describe('v2 convo M3 authored flow', () => {
  it('picks the first flow question when all items are taught', () => {
    const session = createConvoSessionDoc({
      id: 'flow1',
      userId: 'u',
      pack,
    });
    const result = selectConvoCandidates({ session, pack });
    assert.equal(result.kind, 'candidates');
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.id, pack.groups[0]!.flow![0]);
  });

  it('skips answered choice and offers the next flow open', () => {
    const session = createConvoSessionDoc({
      id: 'flow2',
      userId: 'u',
      pack,
    });
    session.rungs['word.station'] = 'understood';
    const result = selectConvoCandidates({ session, pack });
    assert.equal(result.candidates[0]?.id, 'q_station_open');
  });

  it('never re-asks a correctly finished item via flow', () => {
    const session = createConvoSessionDoc({
      id: 'flow3',
      userId: 'u',
      pack,
    });
    session.rungs['word.station'] = 'said';
    session.rungs['word.street'] = 'taught';
    const result = selectConvoCandidates({ session, pack });
    assert.equal(result.candidates[0]?.id, 'q_street_choice');
    assert.ok(!result.candidates.some((c) => c.id.startsWith('q_station')));
  });
});

describe('v2 convo generated flow · item ids', () => {
  it('resolves item-id flow to the choice question when taught', () => {
    const gen = itemIdFlowPack();
    const session = createConvoSessionDoc({
      id: 'item-flow-1',
      userId: 'u',
      pack: gen,
    });
    const result = selectConvoCandidates({ session, pack: gen });
    assert.equal(result.kind, 'candidates');
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.id, 'q_ola_choice');
    assert.equal(result.candidates[0]?.item_id, 'phrase.hello');
    assert.equal(result.candidates[0]?.qkind, 'choice');
  });

  it('resolves item-id flow to open when understood', () => {
    const gen = itemIdFlowPack();
    const session = createConvoSessionDoc({
      id: 'item-flow-2',
      userId: 'u',
      pack: gen,
      rungs: {
        'phrase.hello': 'understood',
        'phrase.good_morning': 'taught',
      },
    });
    const result = selectConvoCandidates({ session, pack: gen });
    assert.equal(result.candidates[0]?.id, 'q_ola_open');
    assert.equal(result.candidates[0]?.qkind, 'open');
  });

  it('falls back to ranking when flow entries are unknown', () => {
    const gen = itemIdFlowPack();
    gen.groups[0]!.flow = ['totally.unknown.a', 'totally.unknown.b'];
    const session = createConvoSessionDoc({
      id: 'item-flow-miss',
      userId: 'u',
      pack: gen,
    });
    const result = selectConvoCandidates({ session, pack: gen });
    assert.equal(result.kind, 'candidates');
    assert.ok(result.candidates.length >= 1);
    assert.ok(
      result.candidates.every((c) =>
        ['phrase.hello', 'phrase.good_morning'].includes(c.item_id),
      ),
    );
  });
});
