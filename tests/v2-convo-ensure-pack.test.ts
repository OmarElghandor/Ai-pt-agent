import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureConvoPackReady,
  packIdToDay,
  requireConvoPackAsync,
  loadConvoItemSurfaces,
} from '@/lib/v2/convo/pack';

describe('v2 convo pack · ensure on first open', () => {
  it('parses day from pack id', () => {
    assert.equal(packIdToDay('pt-PT.day-18'), 18);
    assert.equal(packIdToDay('pt-PT.day-3'), 3);
    assert.equal(packIdToDay('bad'), null);
  });

  it('returns existing day-18 pack without generating', async () => {
    const surfaces = loadConvoItemSurfaces();
    // Sanity: file pack loads.
    const direct = await requireConvoPackAsync('pt-PT.day-18', {
      itemSurfaces: surfaces,
    });
    assert.equal(direct.day, 18);

    const ensured = await ensureConvoPackReady('pt-PT.day-18', {
      timeoutMs: 5_000,
    });
    assert.equal(ensured.ok, true);
    if (ensured.ok) {
      assert.equal(ensured.generated, false);
      assert.equal(ensured.pack.day, 18);
    }
  });

  it('rejects invalid pack ids', async () => {
    const ensured = await ensureConvoPackReady('not-a-pack');
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.equal(ensured.code, 'invalid_pack_id');
      assert.ok(ensured.message_eg);
    }
  });
});
