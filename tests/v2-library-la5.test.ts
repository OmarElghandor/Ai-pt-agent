import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { measureLevel, momentsCoverage } from '../lib/v2/library/review';

describe('LA5 · review', () => {
  it('shows measured level next to target via measureLevel parts', () => {
    const measured = measureLevel({
      lines: Array.from({ length: 20 }, (_, i) => ({
        tl: 'eu falo portugues agora bem',
        speaker: i % 2 ? 'a' : 'b',
      })),
      tokens: Array.from({ length: 20 }, () => [
        { surface: 'falo', lemma: 'falar', pos: 'verb', meaning_ar: '', tense: 'pres' },
      ]),
    });
    assert.ok(measured.measured_level >= 1 && measured.measured_level <= 5);
    assert.ok(measured.parts.sentence_length > 0);
    assert.equal(measured.parts.turns, 20);
  });

  it('moments coverage lists line numbers or missing', () => {
    const cov = momentsCoverage(
      [
        { id: 'm1', eg: 'a' },
        { id: 'm2', eg: 'b' },
      ],
      [{ moment: '' }, { moment: 'm1' }, { moment: 'm1' }],
    );
    assert.equal(cov[0].covered, true);
    assert.deepEqual(cov[0].line_numbers, [2, 3]);
    assert.equal(cov[1].covered, false);
  });

  it('review route gates admin', () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        'app/api/v2/admin/library/episodes/[slug]/review/route.ts',
      ),
      'utf8',
    );
    assert.match(src, /denyUnlessV2Admin/);
    assert.match(src, /edit_line/);
    assert.match(src, /handEditLine/);
  });

  it('hand edit path reruns tokens for one line only (source)', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'lib/v2/library/review.ts'),
      'utf8',
    );
    assert.match(src, /line_indexes: \[lineIndex\]/);
    assert.match(src, /status: 'open'/);
  });
});
