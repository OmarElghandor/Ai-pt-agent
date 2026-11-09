import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureConvoPackReady,
  packUnusableResult,
} from '@/lib/v2/convo/pack/ensure';
import type { DayReadiness } from '@/lib/v2/generation/prepare';

const readyReadiness: DayReadiness = {
  day: 3,
  target_lang: 'pt-PT',
  lesson: 'published',
  pack: 'ready',
  audio: 'ready',
  ready: true,
  job_id: null,
  error_eg: null,
};

describe('v2 convo pack · pack_unusable', () => {
  it('packUnusableResult returns pack_unusable with Egyptian copy', () => {
    const r = packUnusableResult('pt-PT.day-3', {
      ok: false,
      issues: [{ code: 'schema', severity: 'error', message: 'bad' } as never],
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'pack_unusable');
    assert.match(r.message_eg, /مش قابلة للفتح/);
    assert.match(r.message, /pt-PT.day-3/);
  });

  it('ensure returns pack_unusable when readiness ready but load fails', async () => {
    const ensured = await ensureConvoPackReady(
      'pt-PT.day-3',
      undefined,
      {
        isMongoConfigured: () => true,
        connect: async () => undefined,
        resolveSurfaces: async () => [],
        loadPack: async () =>
          ({
            ok: false,
            issues: [
              {
                code: 'missing_data',
                severity: 'error',
                message: 'no data',
              },
            ],
            source: 'mongo',
          }) as never,
        getReadiness: async () => readyReadiness,
        enqueue: async () => {
          throw new Error('enqueue should not run when already ready');
        },
      },
    );
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.equal(ensured.code, 'pack_unusable');
      assert.notEqual(ensured.code, 'preparing');
      assert.ok(ensured.message_eg);
    }
  });

  it('ensure enqueues with force when needs_review and isDevAllowed', async () => {
    let enqueueForce: boolean | undefined;
    let readinessCalls = 0;
    const ensured = await ensureConvoPackReady(
      'pt-PT.day-1',
      undefined,
      {
        isMongoConfigured: () => true,
        connect: async () => undefined,
        resolveSurfaces: async () => [],
        isDevAllowed: () => true,
        loadPack: async () =>
          ({
            ok: false,
            issues: [],
            source: 'mongo',
          }) as never,
        getReadiness: async () => {
          readinessCalls += 1;
          if (readinessCalls === 1) {
            return {
              day: 1,
              target_lang: 'pt-PT',
              lesson: 'needs_review',
              pack: 'none',
              audio: 'none',
              ready: false,
              job_id: null,
              error_eg:
                'الدرس ده محتاج مراجعة قبل ما يتنشر 🙏 هيبقى جاهز قريب',
            } satisfies DayReadiness;
          }
          return {
            day: 1,
            target_lang: 'pt-PT',
            lesson: 'generating',
            pack: 'generating',
            audio: 'none',
            ready: false,
            job_id: 'job-dev',
            error_eg: null,
          } satisfies DayReadiness;
        },
        enqueue: async (opts) => {
          enqueueForce = opts.force;
          return {
            jobId: 'job-dev',
            day: 1,
            target_lang: 'pt-PT',
            created: true,
            already_ready: false,
          };
        },
      },
    );
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.equal(ensured.code, 'preparing');
    }
    assert.equal(enqueueForce, true);
  });

  it('ensure still returns needs_review when not isDevAllowed', async () => {
    const ensured = await ensureConvoPackReady(
      'pt-PT.day-1',
      undefined,
      {
        isMongoConfigured: () => true,
        connect: async () => undefined,
        resolveSurfaces: async () => [],
        isDevAllowed: () => false,
        loadPack: async () =>
          ({
            ok: false,
            issues: [],
            source: 'mongo',
          }) as never,
        getReadiness: async () =>
          ({
            day: 1,
            target_lang: 'pt-PT',
            lesson: 'needs_review',
            pack: 'none',
            audio: 'none',
            ready: false,
            job_id: null,
            error_eg: 'الدرس ده محتاج مراجعة',
          }) satisfies DayReadiness,
        enqueue: async () => {
          throw new Error('enqueue should not run');
        },
      },
    );
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.equal(ensured.code, 'needs_review');
    }
  });

  it('ensure returns pack_unusable after enqueue when ready but still unloadable', async () => {
    let readinessCalls = 0;
    const ensured = await ensureConvoPackReady(
      'pt-PT.day-3',
      undefined,
      {
        isMongoConfigured: () => true,
        connect: async () => undefined,
        resolveSurfaces: async () => [],
        loadPack: async () =>
          ({
            ok: false,
            issues: [],
            source: 'mongo',
          }) as never,
        getReadiness: async () => {
          readinessCalls += 1;
          // First call: not ready → enqueue path; second: ready.
          if (readinessCalls === 1) {
            return {
              ...readyReadiness,
              ready: false,
              pack: 'generating',
              audio: 'pending',
            };
          }
          return readyReadiness;
        },
        enqueue: async () => ({
          jobId: 'job-1',
          joined: false,
          already_ready: false,
        }),
      },
    );
    assert.equal(ensured.ok, false);
    if (!ensured.ok) {
      assert.equal(ensured.code, 'pack_unusable');
    }
  });
});
