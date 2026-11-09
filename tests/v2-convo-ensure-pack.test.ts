import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureConvoPackReady,
  packIdToDay,
  requireConvoPackAsync,
  loadConvoItemSurfaces,
  resolveConvoItemSurfacesForPack,
} from '@/lib/v2/convo/pack';
import type { ConvoPackData } from '@/lib/v2/convo/pack';
import { isTerminalPrepareFailure } from '@/lib/v2/generation/prepare/types';

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

  it('reuses day-N mongo pack with day-scoped surfaces without enqueue', async () => {
    const daySurfaces = [{ id: 'word.hello', tl: 'olá' }];
    const stubPack = {
      pack_id: 'pt-PT.day-1',
      day: 1,
      target_lang: 'pt-PT',
    } as ConvoPackData;
    let enqueueCalled = false;
    let seenSurfaceIds: string[] = [];

    const ensured = await ensureConvoPackReady('pt-PT.day-1', undefined, {
      resolveSurfaces: async () => daySurfaces,
      loadPack: async (_id, opts) => {
        seenSurfaceIds = (opts.itemSurfaces ?? []).map((s) => s.id);
        return {
          ok: true,
          pack: stubPack,
          issues: [],
          source: 'mongo',
        };
      },
      enqueue: async () => {
        enqueueCalled = true;
        throw new Error('enqueue should not run when pack loads');
      },
    });

    assert.equal(ensured.ok, true);
    if (ensured.ok) {
      assert.equal(ensured.generated, false);
      assert.equal(ensured.pack.day, 1);
    }
    assert.equal(enqueueCalled, false);
    assert.deepEqual(seenSurfaceIds, ['word.hello']);
  });

  it('resolveConvoItemSurfacesForPack prefers published lesson over static', async () => {
    const surfaces = await resolveConvoItemSurfacesForPack('pt-PT.day-1', {
      getPublished: async () =>
        ({
          day: 1,
          target_lang: 'pt-PT',
          version: 1,
          status: 'published',
          pack: {
            items: [{ id: 'word.hello', tl: 'olá' }],
          },
        }) as never,
      loadStatic: () => [{ id: 'word.station', tl: 'a estação' }],
    });
    assert.ok(surfaces.some((s) => s.id === 'word.hello' && s.tl === 'olá'));
    assert.ok(!surfaces.some((s) => s.id === 'word.station'));
  });

  it('resolveConvoItemSurfacesForPack falls back to static when no published lesson', async () => {
    const surfaces = await resolveConvoItemSurfacesForPack('pt-PT.day-1', {
      getPublished: async () => null,
      loadStatic: () => [{ id: 'word.station', tl: 'a estação' }],
    });
    assert.deepEqual(surfaces, [{ id: 'word.station', tl: 'a estação' }]);
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
    // Without Mongo, missing packs fail fast (not timeout).
    // Non–role-play days (v3) reject before enqueue.
    const ensured = await ensureConvoPackReady('pt-PT.day-9999');
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.notEqual(ensured.code, 'timeout');
      assert.ok(
        ensured.code === 'mongo_unavailable' ||
          ensured.code === 'preparing' ||
          ensured.code === 'generate_failed' ||
          ensured.code === 'needs_review' ||
          ensured.code === 'no_published_lesson' ||
          ensured.code === 'invalid_pack_id',
        `unexpected code: ${ensured.code}`,
      );
    }
  });

  it('refuses to generate a greeting-day pack (day 1 is free talk)', async () => {
    const ensured = await ensureConvoPackReady('pt-PT.day-1', undefined, {
      resolveSurfaces: async () => [],
      loadPack: async () => ({
        ok: false,
        pack: null,
        issues: [],
        source: 'none',
      }),
      enqueue: async () => {
        throw new Error('should not enqueue day 1');
      },
      isMongoConfigured: () => true,
      connect: async () => undefined,
    });
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.equal(ensured.code, 'invalid_pack_id');
      assert.match(ensured.message, /not a role-play day/);
    }
  });
});

describe('isTerminalPrepareFailure', () => {
  it('is true when error_eg is set, no job, and not ready', () => {
    assert.equal(
      isTerminalPrepareFailure({
        ready: false,
        error_eg: 'حصل خطأ أثناء تجهيز اليوم — حاول تاني بعد شوية',
        job_id: null,
      }),
      true,
    );
  });

  it('is false while a job is still running', () => {
    assert.equal(
      isTerminalPrepareFailure({
        ready: false,
        error_eg: 'حصل خطأ',
        job_id: 'job-1',
      }),
      false,
    );
  });

  it('is false when ready even if a stale error_eg remains', () => {
    assert.equal(
      isTerminalPrepareFailure({
        ready: true,
        error_eg: 'stale',
        job_id: null,
      }),
      false,
    );
  });
});
