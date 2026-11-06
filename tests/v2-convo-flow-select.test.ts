import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConvoItemSurfaces, requireConvoPack } from '@/lib/v2/convo/pack';
import { selectConvoCandidates } from '@/lib/v2/convo/select';
import { createConvoSessionDoc } from '@/lib/v2/convo/session';

const surfaces = loadConvoItemSurfaces();
const pack = requireConvoPack('pt-PT.day-33', { itemSurfaces: surfaces });

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
