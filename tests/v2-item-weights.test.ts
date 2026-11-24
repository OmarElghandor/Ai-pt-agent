import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CoreItemsFile } from '../lib/v2/generation/lesson/coreItems';
import {
  buildFreqRankMap,
  buildPalavrasSet,
  buildWeightRows,
  computeWeight,
  CUSTOM_ONLY_WEIGHT,
  lookupFreqRank,
  reuseCountForItem,
  weightOrDefault,
} from '../lib/v2/weights';

function miniFile(extraLaterRecycle = false): CoreItemsFile {
  return {
    version: 1,
    lang: 'pt-PT',
    days: [
      {
        day: 1,
        is_story: false,
        recycle_ids: [],
        core_items: [
          {
            id: 'verb.precisar',
            kind: 'verb',
            tl: 'precisar',
            eg: 'يحتاج',
            priority: 'essential',
          },
          {
            id: 'phrase.nao_percebi',
            kind: 'phrase',
            tl: 'Não percebi',
            eg: 'مش فاهم',
            priority: 'essential',
          },
          {
            id: 'food.galao',
            kind: 'word',
            tl: 'o galão',
            eg: 'جالون',
            priority: 'situational',
          },
        ],
      },
      {
        day: 2,
        is_story: false,
        recycle_ids: extraLaterRecycle ? ['verb.precisar'] : [],
        core_items: [
          {
            id: 'place.cafe',
            kind: 'word',
            tl: 'o café',
            eg: 'مقهى',
            priority: 'useful',
            uses: extraLaterRecycle ? ['food.galao'] : [],
          },
        ],
      },
    ],
  };
}

describe('v2 item weights · compute (17 §4)', () => {
  it('same input always gives the same weight', () => {
    const input = {
      priority: 'essential' as const,
      freq_rank: 10,
      reuse_count: 4,
      survival: true,
      kind: 'phrase' as const,
    };
    const a = computeWeight(input);
    const b = computeWeight(input);
    assert.deepEqual(a, b);
    // 60 + 20 + 8 + 10 + 5 = 103 → capped 100
    assert.equal(a.weight, 100);
    assert.ok(a.weight_why.includes('essential'));
    assert.ok(a.weight_why.includes('top-500'));
    assert.ok(a.weight_why.includes('survival'));
    assert.ok(a.weight_why.includes('phrase'));
  });

  it('weight never above 100', () => {
    const r = computeWeight({
      priority: 'essential',
      freq_rank: 1,
      reuse_count: 99,
      survival: true,
      kind: 'phrase',
    });
    assert.ok(r.weight <= 100);
  });

  it('empty freq_rank adds 0 frequency points', () => {
    const withRank = computeWeight({
      priority: 'useful',
      freq_rank: 100,
      reuse_count: 0,
      kind: 'word',
    });
    const without = computeWeight({
      priority: 'useful',
      freq_rank: null,
      reuse_count: 0,
      kind: 'word',
    });
    assert.equal(withRank.weight, 35 + 20);
    assert.equal(without.weight, 35);
    assert.ok(!without.weight_why.some((w) => w.startsWith('top-')));
  });
});

describe('v2 item weights · freq + reuse + rows', () => {
  it('item not in list gets empty freq_rank and is flagged', () => {
    const rows = buildWeightRows({
      file: miniFile(),
      freqMap: buildFreqRankMap([{ word: 'ser', rank: 1 }]),
    });
    const galao = rows.find((r) => r.item_id === 'food.galao');
    assert.ok(galao);
    assert.equal(galao!.freq_rank, null);
    assert.equal(galao!.needs_review, true);
  });

  it('lookup uses head word for articles', () => {
    const map = buildFreqRankMap([{ word: 'galão', rank: 900 }]);
    assert.equal(lookupFreqRank('o galão', map), 900);
  });

  it('phrase lookup uses rarest content word', () => {
    const map = buildFreqRankMap([
      { word: 'bom', rank: 50 },
      { word: 'dia', rank: 200 },
    ]);
    assert.equal(lookupFreqRank('Bom dia!', map), 200);
  });

  it('1000-palavras fallback gives +6 band and clears review flag', () => {
    const rows = buildWeightRows({
      file: miniFile(),
      freqMap: new Map(),
      palavrasSet: buildPalavrasSet([{ tl: 'o galão', freq_heads: ['galão'] }]),
    });
    const galao = rows.find((r) => r.item_id === 'food.galao')!;
    assert.equal(galao.freq_rank, null);
    assert.equal(galao.needs_review, false);
    assert.equal(galao.weight, 15 + 6); // situational + top-3000 band
    assert.ok(galao.weight_why.includes('in-1000-palavras'));
  });

  it('adding a later lesson that recycles an item raises its weight', () => {
    const before = buildWeightRows({ file: miniFile(false) });
    const after = buildWeightRows({ file: miniFile(true) });
    const p0 = before.find((r) => r.item_id === 'verb.precisar')!;
    const p1 = after.find((r) => r.item_id === 'verb.precisar')!;
    assert.equal(p0.reuse_count, 0);
    assert.equal(p1.reuse_count, 1);
    assert.ok(p1.weight > p0.weight);

    const g0 = before.find((r) => r.item_id === 'food.galao')!;
    const g1 = after.find((r) => r.item_id === 'food.galao')!;
    assert.equal(g1.reuse_count, 1);
    assert.ok(g1.weight > g0.weight);
  });

  it('reuseCountForItem counts distinct later days only', () => {
    const file = miniFile(true);
    assert.equal(
      reuseCountForItem('verb.precisar', 1, file.days),
      1,
    );
  });

  it('empty freq map flags every row', () => {
    const rows = buildWeightRows({ file: miniFile() });
    assert.ok(rows.length >= 3);
    assert.ok(rows.every((r) => r.needs_review && r.freq_rank == null));
  });
});

describe('v2 item weights · custom default', () => {
  it('custom-only items use weight 30', () => {
    assert.equal(
      weightOrDefault('ugc.pt-PT.chuva.noun', 90),
      CUSTOM_ONLY_WEIGHT,
    );
    assert.equal(weightOrDefault('ugc.pt-PT.chuva.noun', null), 30);
    assert.equal(weightOrDefault('food.cheese', null), 30);
    assert.equal(weightOrDefault('food.cheese', 75), 75);
  });
});
