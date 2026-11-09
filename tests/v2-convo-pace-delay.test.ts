import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PACE_CAP_MS,
  coachStripDelayMs,
  paceDelayMs,
} from '@/components/v2/convo/paceDelay';

describe('convo pace delays', () => {
  it('scale 0 → 0 (golden / harness)', () => {
    assert.equal(paceDelayMs({ charCount: 40, scale: 0 }), 0);
    assert.equal(coachStripDelayMs({ scale: 0 }), 0);
  });

  it('reduced motion → 150ms', () => {
    assert.equal(
      paceDelayMs({ charCount: 100, reducedMotion: true }),
      150,
    );
    assert.equal(coachStripDelayMs({ reducedMotion: true }), 150);
  });

  it('formula 600 + 25/char, capped at 2.2s', () => {
    assert.equal(paceDelayMs({ charCount: 0 }), 600);
    assert.equal(paceDelayMs({ charCount: 10 }), 600 + 250);
    assert.equal(paceDelayMs({ charCount: 200 }), PACE_CAP_MS);
  });
});
