import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  runPrepareDayChain,
  type PrepareDayDeps,
  type PrepareProgress,
} from '@/lib/v2/generation/prepare';
import type { LessonPack } from '@/lib/v2/content/lesson';
import type { SavedLesson } from '@/lib/v2/generation/lesson/save';

function fakePack(day: number): LessonPack {
  return {
    schema_version: 1,
    lesson: {
      id: `pt-PT.d${String(day).padStart(2, '0')}`,
      day,
      target_lang: 'pt-PT',
      title_tl: 'Test',
      title_ar: 'اختبار',
    },
    items: [],
    pages: [],
  } as unknown as LessonPack;
}

function draftLesson(
  day: number,
  meta: SavedLesson['meta'],
): SavedLesson {
  return {
    day,
    target_lang: 'pt-PT',
    version: 1,
    status: 'draft',
    data: fakePack(day),
    meta,
  };
}

function mockDeps(
  overrides: Partial<PrepareDayDeps> & {
    published?: boolean;
    draftMeta?: SavedLesson['meta'];
    authored?: boolean;
  } = {},
): {
  deps: PrepareDayDeps;
  calls: {
    generate: number;
    publish: number;
    enqueueConvo: number;
    warm: number;
  };
  progress: PrepareProgress[];
} {
  const calls = {
    generate: 0,
    publish: 0,
    enqueueConvo: 0,
    warm: 0,
  };
  const progress: PrepareProgress[] = [];
  let published = Boolean(overrides.published);
  let draft = draftLesson(34, overrides.draftMeta ?? { text_ready: true });

  const deps: PrepareDayDeps = {
    getPublished: async () =>
      published
        ? { version: draft.version, pack: draft.data }
        : null,
    getLatest: async () => draft,
    generateDraft: async () => {
      calls.generate += 1;
      draft = {
        ...draft,
        meta: { text_ready: true, issues: [] },
      };
      return { saved: draft, pack: draft.data };
    },
    publish: async () => {
      calls.publish += 1;
      published = true;
      draft = { ...draft, status: 'published' };
      return { lesson: draft };
    },
    updateMeta: async ({ meta }) => {
      draft = {
        ...draft,
        meta: { ...(draft.meta ?? {}), ...meta },
      };
    },
    authoredPackExists: () => Boolean(overrides.authored),
    enqueueConvo: async () => {
      calls.enqueueConvo += 1;
      return { jobId: 'convo-1' };
    },
    waitConvoReady: async () => {
      // After enqueue, become ready.
      return calls.enqueueConvo > 0 || Boolean(overrides.authored);
    },
    warmLesson: async () => {
      calls.warm += 1;
    },
    setProgress: async (p) => {
      progress.push({ ...p });
    },
    ...overrides,
  };

  return { deps, calls, progress };
}

describe('runPrepareDayChain', () => {
  it('stops at needs_review on fatal assemble issues without publishing', async () => {
    const { deps, calls } = mockDeps({
      draftMeta: {
        text_ready: true,
        issues: [
          {
            rule: 'core_id_missing',
            severity: 'error',
            path: 'items',
            message: 'missing',
          },
        ],
      },
      generateDraft: async () => {
        throw new Error('should not generate when draft exists with text_ready');
      },
    });

    // Override getLatest to return blocked draft; generate shouldn't run
    // because usableDraft requires !needsReview — so it WILL try generate.
    // Force generate to produce the blocked meta:
    const blocked = draftLesson(34, {
      text_ready: true,
      issues: [
        {
          rule: 'core_id_missing',
          severity: 'error',
          path: 'items',
          message: 'missing',
        },
      ],
    });
    let generateCalls = 0;
    deps.getLatest = async () => blocked;
    deps.getPublished = async () => null;
    deps.generateDraft = async () => {
      generateCalls += 1;
      return { saved: blocked, pack: blocked.data };
    };

    const result = await runPrepareDayChain({ day: 34, deps });
    assert.equal(result.status, 'needs_review');
    assert.equal(calls.publish, 0);
    assert.equal(calls.enqueueConvo, 0);
    assert.ok(result.error_eg);
    assert.equal(generateCalls, 1);
  });

  it('skips convo generation when an authored pack exists', async () => {
    const { deps, calls } = mockDeps({
      published: true,
      authored: true,
    });
    const result = await runPrepareDayChain({ day: 33, deps });
    assert.equal(result.status, 'ready');
    assert.equal(calls.enqueueConvo, 0);
    assert.equal(calls.generate, 0);
    assert.equal(result.progress.pack_done, true);
    assert.equal(result.progress.audio_done, true);
  });

  it('publishes and enqueues convo when draft is clean', async () => {
    const { deps, calls } = mockDeps({
      draftMeta: { text_ready: true, issues: [] },
      authored: false,
    });
    // Not published yet; usable draft skips generate.
    const result = await runPrepareDayChain({ day: 34, deps });
    assert.equal(result.status, 'ready');
    assert.equal(calls.generate, 0);
    assert.equal(calls.publish, 1);
    assert.equal(calls.enqueueConvo, 1);
    assert.equal(calls.warm, 1);
  });

  it('treats brazilian flags as needs_review', async () => {
    const blocked = draftLesson(34, {
      text_ready: true,
      issues: [
        {
          rule: 'brazilian',
          severity: 'warning',
          path: 'items[0].tl',
          message: 'ônibus',
        },
      ],
    });
    const { deps, calls } = mockDeps();
    deps.getPublished = async () => null;
    deps.getLatest = async () => blocked;
    deps.generateDraft = async () => ({ saved: blocked, pack: blocked.data });

    const result = await runPrepareDayChain({ day: 34, deps });
    assert.equal(result.status, 'needs_review');
    assert.equal(calls.publish, 0);
    assert.equal(calls.enqueueConvo, 0);
  });
});

describe('decidePrepareJoin', () => {
  it('joins the same job on a double request', async () => {
    const { decidePrepareJoin } = await import(
      '@/lib/v2/generation/prepare/enqueue'
    );
    const first = decidePrepareJoin({
      ready: false,
      needsReviewWithoutJob: false,
      lockJobId: null,
      lockJobActive: false,
      runningJobId: null,
    });
    assert.equal(first.action, 'create');

    const second = decidePrepareJoin({
      ready: false,
      needsReviewWithoutJob: false,
      lockJobId: 'job-abc',
      lockJobActive: true,
      runningJobId: 'job-abc',
    });
    assert.equal(second.action, 'join');
    if (second.action === 'join') {
      assert.equal(second.jobId, 'job-abc');
    }
  });
});
