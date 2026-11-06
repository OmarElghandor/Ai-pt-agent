import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readyChipFromReadiness } from '@/lib/v2/convo/topics/list';
import type { DayReadiness } from '@/lib/v2/generation/prepare';

function readiness(
  overrides: Partial<DayReadiness> = {},
): DayReadiness {
  return {
    target_lang: 'pt-PT',
    day: 34,
    lesson: 'none',
    pack: 'none',
    audio: 'none',
    job_id: null,
    error_eg: null,
    ready: false,
    ...overrides,
  };
}

describe('readyChipFromReadiness', () => {
  it('returns null when ready', () => {
    assert.equal(
      readyChipFromReadiness(
        readiness({
          lesson: 'published',
          pack: 'ready',
          ready: true,
        }),
        true,
      ),
      null,
    );
  });

  it('returns preparing when a job is running', () => {
    assert.equal(
      readyChipFromReadiness(
        readiness({
          lesson: 'generating',
          job_id: 'j1',
        }),
        false,
      ),
      'preparing',
    );
  });

  it('returns soon when nothing is ready', () => {
    assert.equal(readyChipFromReadiness(readiness(), false), 'soon');
  });
});
