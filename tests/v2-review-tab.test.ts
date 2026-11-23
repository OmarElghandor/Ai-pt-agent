import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('v2 practice · footer tab مراجعة (16 §8)', () => {
  it('TabBar lists المسار · مراجعة · الكروت · اتكلّم · المكتبة', () => {
    const src = readFileSync(
      join(process.cwd(), 'components/v2/TabBar.tsx'),
      'utf8',
    );
    assert.match(src, /href: '\/path'/);
    assert.match(src, /href: '\/review'/);
    assert.match(src, /href: '\/cards'/);
    assert.match(src, /href: '\/talk'/);
    assert.match(src, /href: '\/library'/);
    assert.match(src, /label: 'مراجعة'/);
    assert.match(src, /label: 'اتكلّم'/);
    assert.match(src, /autorenew/);
    // أنا removed from the five-tab bar
    assert.ok(!src.includes("href: '/me'"));
  });

  it('review today route supports peek without build', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/v2/review/today/route.ts'),
      'utf8',
    );
    assert.match(src, /peek/);
    assert.match(src, /peekTodayReview/);
    assert.match(src, /getOrCreateTodayReview/);
  });

  it('reviewStore returns empty without saving on empty window', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/v2/practice/reviewStore.ts'),
      'utf8',
    );
    assert.match(src, /empty: true/);
    assert.match(src, /window\.length === 0/);
    assert.match(src, /code === 11000/);
  });
});
