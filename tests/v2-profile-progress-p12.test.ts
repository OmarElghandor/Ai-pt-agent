import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('P12 · me summary', () => {
  it('summary module does not query v2_errors directly', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'lib/v2/progress/summary.ts'),
      'utf8',
    );
    assert.equal(src.includes('V2ErrorModel'), false);
    assert.equal(src.includes('v2_errors'), false);
  });

  it('exposes GET /api/v2/me/summary route', () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        'app/api/v2/me/summary/route.ts',
      ),
      'utf8',
    );
    assert.match(src, /buildMeSummary/);
  });
});
