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
    assert.equal(packIdToDay('pt-PT.day-33'), 33);
    assert.equal(packIdToDay('pt-PT.day-3'), 3);
    assert.equal(packIdToDay('bad'), null);
  });

  it('returns existing day-33 pack without generating', async () => {
    const surfaces = loadConvoItemSurfaces();
    // Sanity: file pack loads.
    const direct = await requireConvoPackAsync('pt-PT.day-33', {
      itemSurfaces: surfaces,
    });
    assert.equal(direct.day, 33);

    const ensured = await ensureConvoPackReady('pt-PT.day-33');
    assert.equal(ensured.ok, true);
    if (ensured.ok) {
      assert.equal(ensured.generated, false);
      assert.equal(ensured.pack.day, 33);
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

  it('never returns a blocking timeout code for missing packs without mongo', async () => {
    // Without Mongo, missing packs fail fast as mongo_unavailable (not timeout).
    const ensured = await ensureConvoPackReady('pt-PT.day-9999');
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.notEqual(ensured.code, 'timeout');
      assert.ok(
        ensured.code === 'mongo_unavailable' ||
          ensured.code === 'preparing' ||
          ensured.code === 'generate_failed' ||
          ensured.code === 'needs_review' ||
          ensured.code === 'no_published_lesson',
      );
    }
  });
});
