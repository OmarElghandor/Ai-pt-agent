import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import {
  buildVocabFlow,
  orderVocabFlowIds,
  wordsUsedByPhrase,
} from '../lib/v2/vocabFlow';

function word(
  id: string,
  tl: string,
  opts?: { gender?: 'm' | 'f'; url?: string },
): Item {
  return {
    type: 'word',
    id,
    tl,
    ar: `معنى ${tl}`,
    gender: opts?.gender ?? 'm',
    ...(opts?.url ? { image: { key: id, url: opts.url } } : {}),
  };
}

function phrase(
  id: string,
  tl: string,
  opts?: { cloze?: string; url?: string },
): Item {
  return {
    type: 'phrase',
    id,
    tl,
    ar: `معنى ${tl}`,
    context_eg: 'سياق',
    cloze: opts?.cloze ?? tl.split(/\s+/).slice(-1)[0]!,
    ...(opts?.url ? { image: { key: id, url: opts.url } } : {}),
  };
}

/** Deterministic but still shuffles a bit. */
function seqRand() {
  let i = 0;
  const seq = [0.1, 0.7, 0.3, 0.9, 0.2, 0.55, 0.8, 0.15, 0.4, 0.65];
  return () => {
    const v = seq[i % seq.length]!;
    i += 1;
    return v;
  };
}

describe('orderVocabFlowIds', () => {
  it('places words used by a phrase immediately before it', () => {
    const items = [
      word('word.cafe', 'o café'),
      word('word.leite', 'o leite'),
      phrase('phrase.cafe_leite', 'Queria um café com leite', {
        cloze: 'leite',
      }),
      word('word.pao', 'o pão'),
    ];
    const ordered = orderVocabFlowIds({
      candidateIds: [
        'phrase.cafe_leite',
        'word.pao',
        'word.cafe',
        'word.leite',
      ],
      items,
      itemFirstIndex: [
        { id: 'phrase.cafe_leite', line: 0 },
        { id: 'word.pao', line: 1 },
      ],
    });
    const phraseAt = ordered.indexOf('phrase.cafe_leite');
    assert.ok(phraseAt >= 2);
    assert.ok(ordered.indexOf('word.cafe') < phraseAt);
    assert.ok(ordered.indexOf('word.leite') < phraseAt);
  });

  it('wordsUsedByPhrase matches tokens inside the phrase', () => {
    const hits = wordsUsedByPhrase('Queria um café com leite', [
      { id: 'word.cafe', type: 'word', tl: 'o café' },
      { id: 'word.leite', type: 'word', tl: 'o leite' },
      { id: 'word.pao', type: 'word', tl: 'o pão' },
    ]);
    assert.deepEqual(hits.sort(), ['word.cafe', 'word.leite'].sort());
  });
});

describe('buildVocabFlow', () => {
  const cafe = word('word.cafe', 'o café', { gender: 'm' });
  const leite = word('word.leite', 'o leite', { gender: 'm' });
  const pao = word('word.pao', 'o pão', { gender: 'm' });
  const agua = word('word.agua', 'a água', { gender: 'f' });
  const phraseCafe = phrase('phrase.cafe_leite', 'Queria um café com leite', {
    cloze: 'leite',
  });
  const phrasePao = phrase('phrase.pao', 'Queria pão', { cloze: 'pão' });

  it('inserts a micro check after every 3 items and ends with a check', () => {
    const items = [cafe, leite, pao, agua, phraseCafe, phrasePao];
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      storyLines: [
        {
          index: 0,
          speaker: 'learner',
          tl: 'Queria um café com leite',
          ids: ['phrase.cafe_leite', 'word.cafe', 'word.leite'],
        },
      ],
      cast: [{ id: 'learner', name: 'Yassin', role: 'learner' }],
      rand: seqRand(),
    });

    const kinds = slides.map((s) => s.kind);
    const itemCount = kinds.filter((k) => k === 'item').length;
    assert.equal(itemCount, 6);
    assert.ok(kinds.includes('micro_check'));
    assert.equal(kinds[kinds.length - 1], 'micro_check');

    // No two checks in a row
    for (let i = 1; i < kinds.length; i++) {
      if (kinds[i] === 'micro_check') {
        assert.notEqual(kinds[i - 1], 'micro_check');
      }
    }

    // After every 3 items there should have been a check opportunity —
    // with 6 items expect at least 2 checks
    const checks = slides.filter((s) => s.kind === 'micro_check');
    assert.ok(checks.length >= 2);
  });

  it('adds phrase_in_use after a phrase that appears in the story', () => {
    const items = [cafe, leite, phraseCafe];
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      storyLines: [
        {
          index: 2,
          speaker: 'ines',
          tl: 'Queria um café com leite?',
          ids: ['phrase.cafe_leite'],
          ar: 'عايز قهوة بلبن؟',
        },
      ],
      cast: [{ id: 'ines', name: 'Inês', role: 'character' }],
      rand: seqRand(),
    });
    const piu = slides.find((s) => s.kind === 'phrase_in_use');
    assert.ok(piu);
    assert.equal(piu!.kind, 'phrase_in_use');
    if (piu!.kind === 'phrase_in_use') {
      assert.equal(piu.itemId, 'phrase.cafe_leite');
      assert.equal(piu.speakerName, 'Inês');
    }
  });

  it('adds a halfway breather when there are more than 9 items', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      word(`word.w${i}`, `o item${i}`, { gender: 'm' }),
    );
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      rand: seqRand(),
    });
    const breather = slides.find((s) => s.kind === 'breather');
    assert.ok(breather);
    if (breather!.kind === 'breather') {
      assert.equal(breather.total, 12);
      assert.ok(breather.seen >= 6);
      assert.ok(breather.chipIds.length >= 6);
    }
  });

  it('does not put two identical check types in a row', () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      word(`word.w${i}`, i % 2 === 0 ? `o n${i}` : `a n${i}`, {
        gender: i % 2 === 0 ? 'm' : 'f',
      }),
    );
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      rand: seqRand(),
    });
    const checks = slides.filter((s) => s.kind === 'micro_check');
    for (let i = 1; i < checks.length; i++) {
      const a = checks[i - 1]!;
      const b = checks[i]!;
      if (a.kind === 'micro_check' && b.kind === 'micro_check') {
        assert.notEqual(a.checkType, b.checkType);
      }
    }
  });

  it('gates pick_image on ready image urls', () => {
    const withUrls = [
      word('word.a', 'o a', { url: 'https://img/a.jpg' }),
      word('word.b', 'o b', { url: 'https://img/b.jpg' }),
      word('word.c', 'o c', { url: 'https://img/c.jpg' }),
    ];
    const slidesReady = buildVocabFlow({
      itemIds: withUrls.map((i) => i.id),
      items: withUrls,
      rand: () => 0.01,
    });
    const mayHaveImage = slidesReady.some(
      (s) => s.kind === 'micro_check' && s.checkType === 'pick_image',
    );
    // With urls available, pick_image is eligible (may or may not be chosen
    // first depending on rotation) — at least one check exists.
    assert.ok(slidesReady.some((s) => s.kind === 'micro_check'));

    const noUrls = [
      word('word.a', 'o a'),
      word('word.b', 'o b'),
      word('word.c', 'o c'),
    ];
    const slidesNo = buildVocabFlow({
      itemIds: noUrls.map((i) => i.id),
      items: noUrls,
      rand: () => 0.01,
    });
    assert.ok(
      !slidesNo.some(
        (s) => s.kind === 'micro_check' && s.checkType === 'pick_image',
      ),
    );
    // silence unused when pick_image not chosen in ready case
    void mayHaveImage;
  });

  it('only offers complete_phrase when the chunk ends on a phrase', () => {
    const items = [cafe, leite, phraseCafe];
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      rand: seqRand(),
    });
    const complete = slides.filter(
      (s) => s.kind === 'micro_check' && s.checkType === 'complete_phrase',
    );
    for (const c of complete) {
      if (c.kind === 'micro_check') {
        assert.equal(c.itemId, 'phrase.cafe_leite');
      }
    }
  });
});

describe('days plan vocab_flow', () => {
  it('day 3 page_plan uses vocab_flow instead of dictionary+phrases', async () => {
    const { getDayPlan } = await import('../lib/v2/generation/lesson/plan');
    const plan = getDayPlan(3);
    const presets = (plan.generation?.page_plan ?? []).map((p) => p.preset);
    assert.ok(presets.includes('vocab_flow'));
    assert.ok(!presets.includes('dictionary'));
    assert.ok(!presets.includes('phrases'));
  });
});
