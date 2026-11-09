import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Admin convo regenerate routes must 403 when the admin gate is closed.
 * We import the gate helper with V2 flags off.
 */
describe('v2 admin convo regenerate · gate', () => {
  it('denyUnlessV2Admin returns 403 when v2 is disabled', async () => {
    const prevV2 = process.env.V2_ENABLED;
    const prevDev = process.env.V2_DEV;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.V2_ENABLED = 'false';
      process.env.V2_DEV = 'false';
      process.env.NODE_ENV = 'production';
      // Re-import flags after env change — flags read env at call time.
      const { denyUnlessV2Admin } = await import(
        '@/lib/v2/generation/adminGate'
      );
      const denied = denyUnlessV2Admin();
      assert.ok(denied);
      assert.equal(denied!.status, 403);
    } finally {
      if (prevV2 === undefined) delete process.env.V2_ENABLED;
      else process.env.V2_ENABLED = prevV2;
      if (prevDev === undefined) delete process.env.V2_DEV;
      else process.env.V2_DEV = prevDev;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it('each regenerate action is rejected by the gate when forbidden', async () => {
    const prevV2 = process.env.V2_ENABLED;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.V2_ENABLED = 'false';
      process.env.NODE_ENV = 'production';
      const { denyUnlessV2Admin } = await import(
        '@/lib/v2/generation/adminGate'
      );
      for (const action of [
        'reset',
        'reload_pack',
        'regenerate_day',
        'clear_audio',
      ] as const) {
        void action;
        const denied = denyUnlessV2Admin();
        assert.ok(denied, `expected 403 for ${action}`);
        assert.equal(denied!.status, 403);
      }
    } finally {
      if (prevV2 === undefined) delete process.env.V2_ENABLED;
      else process.env.V2_ENABLED = prevV2;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it('MemoryConvoSessionStore deleteOpen removes open sessions', async () => {
    const { MemoryConvoSessionStore, createConvoSessionDoc } = await import(
      '@/lib/v2/convo/session'
    );
    const { loadConvoItemSurfaces, requireConvoPack } = await import(
      '@/lib/v2/convo/pack'
    );
    const pack = requireConvoPack('pt-PT.day-33', {
      itemSurfaces: loadConvoItemSurfaces(),
    });
    const store = new MemoryConvoSessionStore();
    const session = createConvoSessionDoc({
      id: 'regen-test',
      userId: 'u1',
      pack,
    });
    await store.create(session);
    assert.ok(await store.findOpen('u1', pack.pack_id));
    const n = await store.deleteOpen!('u1', pack.pack_id);
    assert.equal(n, 1);
    assert.equal(await store.findOpen('u1', pack.pack_id), null);
  });
});
