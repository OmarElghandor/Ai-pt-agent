import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beginPrepareRange,
  requestPrepareRangeStop,
  getPrepareRangeProgress,
} from '@/lib/v2/generation/prepare/range';
import {
  prepareMaxUsdPerDay,
  prepareMaxUsdPerMonth,
} from '@/lib/v2/generation/prepare/costCap';

describe('prepare range control', () => {
  it('begins a run and accepts stop', () => {
    const run = beginPrepareRange({ from: 35, to: 40, concurrency: 2 });
    assert.equal(run.status, 'running');
    assert.equal(run.from, 35);
    assert.equal(run.to, 40);
    assert.ok(getPrepareRangeProgress(run.run_id));
    assert.equal(requestPrepareRangeStop(run.run_id), true);
    assert.equal(getPrepareRangeProgress(run.run_id)?.stop_requested, true);
  });
});

describe('prepare cost env helpers', () => {
  it('reads caps as null when unset', () => {
    const prevDay = process.env.V2_PREPARE_MAX_USD_PER_DAY;
    const prevMonth = process.env.V2_PREPARE_MAX_USD_PER_MONTH;
    delete process.env.V2_PREPARE_MAX_USD_PER_DAY;
    delete process.env.V2_PREPARE_MAX_USD_PER_MONTH;
    assert.equal(prepareMaxUsdPerDay(), null);
    assert.equal(prepareMaxUsdPerMonth(), null);
    if (prevDay != null) process.env.V2_PREPARE_MAX_USD_PER_DAY = prevDay;
    if (prevMonth != null) process.env.V2_PREPARE_MAX_USD_PER_MONTH = prevMonth;
  });
});
