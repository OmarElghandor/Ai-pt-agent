import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveWrongWay,
  mapCharacterNode,
  mapHiddenForPhase,
  unlockedMapSteps,
} from '@/lib/v2/convo/visual';
import { DAY18_PACK } from './fixtures/convo/day18-script';

describe('v2 convo map state', () => {
  it('unlocks the first route step always, then the next after understood+', () => {
    const rungs = Object.fromEntries(
      DAY18_PACK.groups.flatMap((g) => g.item_ids).map((id) => [id, 'taught' as const]),
    );
    const first = unlockedMapSteps(DAY18_PACK, rungs);
    assert.ok(first);
    assert.deepEqual([...first!], ['step_right']);

    rungs['word.right'] = 'understood';
    const second = unlockedMapSteps(DAY18_PACK, rungs);
    assert.ok(second?.has('step_right'));
    assert.ok(second?.has('step_straight'));
    assert.equal(second?.has('step_left'), false);
  });

  it('places the character on the first step from until that item is produced', () => {
    const rungs = Object.fromEntries(
      DAY18_PACK.groups.flatMap((g) => g.item_ids).map((id) => [id, 'taught' as const]),
    );
    assert.equal(mapCharacterNode(DAY18_PACK, rungs), 'metro');

    rungs['word.right'] = 'said';
    assert.equal(mapCharacterNode(DAY18_PACK, rungs), 'street');
  });

  it('derives wrong-way from a listed mistake on a map step', () => {
    const ww = deriveWrongWay({
      pack: DAY18_PACK,
      mapStepId: 'step_right',
      mistakeId: 'm_right_as_left',
    });
    assert.ok(ww);
    assert.equal(ww!.from, 'metro');
    assert.equal(ww!.toward, 'metro');

    const mid = deriveWrongWay({
      pack: DAY18_PACK,
      mapStepId: 'step_straight',
      mistakeId: 'anything',
    });
    assert.ok(mid);
    assert.equal(mid!.from, 'street');
    assert.equal(mid!.toward, 'metro');
  });

  it('returns null wrong-way without mistake or map step', () => {
    assert.equal(
      deriveWrongWay({
        pack: DAY18_PACK,
        mapStepId: 'step_right',
        mistakeId: undefined,
      }),
      null,
    );
  });

  it('hides the map during recap and closing', () => {
    assert.equal(mapHiddenForPhase('teaching'), false);
    assert.equal(mapHiddenForPhase('recap'), true);
    assert.equal(mapHiddenForPhase('closing'), true);
  });
});
