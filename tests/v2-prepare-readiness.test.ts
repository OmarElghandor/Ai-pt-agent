import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeDayReadiness,
  hasBrazilianFlags,
  needsReviewForAutoPublish,
  type DayReadinessSnapshot,
} from '@/lib/v2/generation/prepare';

function base(
  overrides: Partial<DayReadinessSnapshot> = {},
): DayReadinessSnapshot {
  return {
    target_lang: 'pt-PT',
    day: 34,
    lesson: null,
    pack: null,
    authored_pack: false,
    running_job: null,
    prepare_error_eg: null,
    ...overrides,
  };
}

describe('computeDayReadiness', () => {
  it('returns none when nothing exists', () => {
    const r = computeDayReadiness(base());
    assert.equal(r.lesson, 'none');
    assert.equal(r.pack, 'none');
    assert.equal(r.audio, 'none');
    assert.equal(r.ready, false);
    assert.equal(r.job_id, null);
  });

  it('marks lesson generating when a prepare job is running', () => {
    const r = computeDayReadiness(
      base({
        running_job: { id: 'job1', kind: 'prepare_day' },
      }),
    );
    assert.equal(r.lesson, 'generating');
    assert.equal(r.pack, 'generating');
    assert.equal(r.job_id, 'job1');
    assert.equal(r.ready, false);
  });

  it('marks draft lesson without blockers', () => {
    const r = computeDayReadiness(
      base({
        lesson: { status: 'draft', meta: { issues: [] } },
      }),
    );
    assert.equal(r.lesson, 'draft');
    assert.equal(r.ready, false);
  });

  it('marks needs_review on publish fatals', () => {
    const r = computeDayReadiness(
      base({
        lesson: {
          status: 'draft',
          meta: {
            issues: [
              {
                rule: 'core_id_missing',
                severity: 'error',
              },
            ],
          },
        },
      }),
    );
    assert.equal(r.lesson, 'needs_review');
    assert.ok(r.error_eg);
    assert.match(r.error_eg!, /مراجعة/);
  });

  it('marks needs_review on brazilian flags', () => {
    const r = computeDayReadiness(
      base({
        lesson: {
          status: 'draft',
          meta: {
            issues: [{ rule: 'brazilian', severity: 'warning' }],
          },
        },
      }),
    );
    assert.equal(r.lesson, 'needs_review');
  });

  it('marks published + authored pack ready with audio ready', () => {
    const r = computeDayReadiness(
      base({
        day: 33,
        lesson: { status: 'published', meta: null },
        authored_pack: true,
      }),
    );
    assert.equal(r.lesson, 'published');
    assert.equal(r.pack, 'ready');
    assert.equal(r.audio, 'ready');
    assert.equal(r.ready, true);
  });

  it('marks mongo pack text_ready as pack ready and audio warming', () => {
    const r = computeDayReadiness(
      base({
        lesson: { status: 'published', meta: null },
        pack: {
          status: 'draft',
          meta: { text_ready: true, audio_ready: false },
        },
      }),
    );
    assert.equal(r.pack, 'ready');
    assert.equal(r.audio, 'warming');
    assert.equal(r.ready, true);
  });

  it('marks audio ready when meta.audio_ready', () => {
    const r = computeDayReadiness(
      base({
        lesson: { status: 'published', meta: null },
        pack: {
          status: 'published',
          meta: { text_ready: true, audio_ready: true },
        },
      }),
    );
    assert.equal(r.audio, 'ready');
    assert.equal(r.ready, true);
  });

  it('surfaces prepare_error_eg from snapshot', () => {
    const r = computeDayReadiness(
      base({
        prepare_error_eg: 'فشل التوليد',
        running_job: null,
      }),
    );
    assert.equal(r.error_eg, 'فشل التوليد');
  });

  it('treats lesson meta.prepare_error_eg as needs_review', () => {
    const r = computeDayReadiness(
      base({
        lesson: {
          status: 'draft',
          meta: { prepare_error_eg: 'الدرس ده محتاج مراجعة قبل ما يتنشر 🙏 هيبقى جاهز قريب' },
        },
      }),
    );
    assert.equal(r.lesson, 'needs_review');
    assert.match(r.error_eg ?? '', /محتاج مراجعة/);
    assert.equal(r.ready, false);
  });
});

describe('needsReviewForAutoPublish', () => {
  it('blocks on brazilian even when not a publish fatal', () => {
    assert.equal(hasBrazilianFlags({ issues: [{ rule: 'brazilian' }] }), true);
    assert.equal(
      needsReviewForAutoPublish({
        issues: [{ rule: 'brazilian', severity: 'warning', path: 'x', message: 'br' }],
      }),
      true,
    );
    assert.equal(needsReviewForAutoPublish({ issues: [] }), false);
  });
});
