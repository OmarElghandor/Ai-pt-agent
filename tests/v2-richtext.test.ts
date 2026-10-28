import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  directionRuns,
  flattenBidiRuns,
  isTlSeparator,
  splitLatinInArabic,
} from '../lib/v2/bidi';
import type { RtSegment } from '../lib/v2/rt';

describe('splitLatinInArabic', () => {
  it('isolates -ar inside Egyptian tip text', () => {
    const parts = splitLatinInArabic('غيّر فعل الـ -ar');
    assert.deepEqual(
      parts.map((p) => ({ text: p.text, latin: p.latin })),
      [
        { text: 'غيّر فعل الـ ', latin: false },
        { text: '-ar', latin: true },
      ],
    );
  });

  it('keeps ESTAR. and nós as Latin runs', () => {
    const parts = splitLatinInArabic('استخدم ESTAR. مع nós');
    const latin = parts.filter((p) => p.latin).map((p) => p.text);
    assert.deepEqual(latin, ['ESTAR.', 'nós']);
  });
});

describe('equals between Arabic and Portuguese', () => {
  it('keeps = as its own isolate between الجبنة and o queijo', () => {
    const segments: RtSegment[] = [
      { text: 'الجبنة', lang: 'ar' },
      { text: ' = ', lang: 'tl' },
      { text: 'o queijo', lang: 'tl', group: 'm', bold: true },
    ];
    assert.equal(isTlSeparator(segments[1]!), true);
    const runs = directionRuns(segments);
    assert.equal(runs.length, 3);
    assert.equal(runs[0]!.dir, 'rtl');
    assert.equal(runs[0]!.segments[0]!.seg.text, 'الجبنة');
    assert.equal(runs[1]!.separator, true);
    assert.equal(runs[1]!.segments[0]!.seg.text, ' = ');
    assert.equal(runs[2]!.dir, 'ltr');
    assert.equal(runs[2]!.segments[0]!.seg.text, 'o queijo');

    const flat = flattenBidiRuns(segments);
    assert.deepEqual(
      flat.map((r) => r.text),
      ['الجبنة', ' = ', 'o queijo'],
    );
  });
});

describe('flattenBidiRuns Latin-in-Arabic', () => {
  it('emits LTR isolate for -ar so hyphen stays on the left', () => {
    const flat = flattenBidiRuns([
      { text: 'غيّر فعل الـ -ar', lang: 'eg' },
    ]);
    const latin = flat.find((r) => r.dir === 'ltr');
    assert.ok(latin);
    assert.equal(latin!.text, '-ar');
    assert.notEqual(latin!.text, 'ar-');
  });
});
