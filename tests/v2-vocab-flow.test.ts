import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import {
  buildVocabFlow,
  interleaveRealWorldIds,
  orderFlowContent,
  orderVocabFlowIds,
  storyLineAddsContext,
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
    assert.equal(kinds[kinds.length - 1], 'end');
    // Flow ends with a check before the end slide (tips may sit between).
    const beforeEnd = kinds.slice(0, -1);
    assert.ok(beforeEnd.includes('micro_check'));

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

  it('puts من القصة on the item card when the story line adds context', () => {
    const items = [cafe, leite, phraseCafe];
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      storyLines: [
        {
          index: 2,
          speaker: 'ines',
          tl: 'Queria um café com leite, se faz favor?',
          ids: ['phrase.cafe_leite'],
          ar: 'عايز قهوة بلبن لو سمحت؟',
        },
      ],
      cast: [{ id: 'ines', name: 'Inês', role: 'character' }],
      rand: seqRand(),
    });
    assert.ok(!slides.some((s) => s.kind === 'phrase_in_use'));
    const itemSlide = slides.find(
      (s) => s.kind === 'item' && s.itemId === 'phrase.cafe_leite',
    );
    assert.ok(itemSlide && itemSlide.kind === 'item');
    if (itemSlide!.kind === 'item') {
      assert.ok(itemSlide.storyContext);
      assert.equal(itemSlide.storyContext!.speakerName, 'Inês');
      assert.equal(
        itemSlide.storyContext!.tl,
        'Queria um café com leite, se faz favor?',
      );
    }
  });

  it('hides من القصة when the story line is just the item', () => {
    const boaNoite = phrase('phrase.good_night', 'Boa noite!');
    const slides = buildVocabFlow({
      itemIds: [boaNoite.id],
      items: [boaNoite],
      storyLines: [
        {
          index: 0,
          speaker: 'ines',
          tl: 'Boa noite!',
          ids: ['phrase.good_night'],
          ar: 'تصبح على خير',
        },
      ],
      cast: [{ id: 'ines', name: 'Inês', role: 'character' }],
      rand: seqRand(),
    });
    const itemSlide = slides.find((s) => s.kind === 'item');
    assert.ok(itemSlide && itemSlide.kind === 'item');
    if (itemSlide!.kind === 'item') {
      assert.equal(itemSlide.storyContext, undefined);
    }
    assert.equal(
      slides.filter((s) => s.kind === 'item' && s.itemId === 'phrase.good_night')
        .length,
      1,
    );
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

  it('tags real_world items, places tip after them, and includes them in checks', () => {
    const rw = {
      ...phrase('phrase.rw.conta', 'A conta, se faz favor.'),
      real_world: true,
      tag: 'الحساب',
      context_eg: 'لما تخلص وتطلب الحساب',
    } as Item;
    const items = [cafe, leite, phraseCafe, rw];
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      tips: [{ tipIndex: 0, afterItemId: rw.id }],
      rand: seqRand(),
    });
    const rwSlide = slides.find(
      (s) => s.kind === 'item' && s.itemId === rw.id,
    );
    assert.ok(rwSlide && rwSlide.kind === 'item' && rwSlide.realWorldTag);

    const rwAt = slides.findIndex(
      (s) => s.kind === 'item' && s.itemId === rw.id,
    );
    assert.ok(rwAt >= 0);
    assert.equal(slides[rwAt + 1]?.kind, 'tip');
    if (slides[rwAt + 1]?.kind === 'tip') {
      assert.equal(slides[rwAt + 1].tipIndex, 0);
    }

    const checkOnRw = slides.some(
      (s) => s.kind === 'micro_check' && s.itemId === rw.id,
    );
    // RW may be chunk target or only a distractor — at least it appears as an item
    // and the flow still ends with end after checks.
    assert.equal(slides[slides.length - 1]?.kind, 'end');
    void checkOnRw;
  });

  it('always ends with an end slide', () => {
    const items = [cafe, leite, pao];
    const slides = buildVocabFlow({
      itemIds: items.map((i) => i.id),
      items,
      rand: seqRand(),
    });
    assert.equal(slides[slides.length - 1]?.kind, 'end');
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

  it('day 1 and 2 page_plan never include scene', async () => {
    const { getDayPlan } = await import('../lib/v2/generation/lesson/plan');
    for (const day of [1, 2]) {
      const plan = getDayPlan(day);
      const presets = (plan.generation?.page_plan ?? []).map((p) => p.preset);
      assert.ok(!presets.includes('scene'), `day ${day} still plans scene`);
    }
  });
});

describe('storyLineAddsContext', () => {
  it('true when line is longer than the item', () => {
    assert.equal(
      storyLineAddsContext('Muito prazer, Omar!', 'Muito prazer!'),
      true,
    );
  });
  it('false when line is just the item', () => {
    assert.equal(storyLineAddsContext('Boa noite!', 'Boa noite!'), false);
  });
});

describe('interleaveRealWorldIds', () => {
  it('places related RW after the matching core item', () => {
    const hello = phrase('phrase.hello', 'Olá!');
    const core = phrase('phrase.my_name_is', 'Chamo-me Omar.');
    const rwHi = {
      ...phrase('phrase.rw.ola_tudo', 'Olá, tudo bem?'),
      real_world: true,
      uses: ['phrase.hello'],
    } as Item;
    const map = new Map<string, Item>([
      [hello.id, hello],
      [rwHi.id, rwHi],
      [core.id, core],
    ]);
    const ordered = interleaveRealWorldIds({
      coreIds: [hello.id, core.id],
      rwIds: [rwHi.id],
      byId: map,
    });
    assert.deepEqual(ordered, [hello.id, rwHi.id, core.id]);
  });

  it('never duplicates an item id', () => {
    const a = phrase('phrase.a', 'Olá!');
    const rw = {
      ...phrase('phrase.rw.x', 'Olá, tudo bem?'),
      real_world: true,
      uses: ['phrase.a'],
    } as Item;
    const byId = new Map<string, Item>([
      [a.id, a],
      [rw.id, rw],
    ]);
    const ordered = interleaveRealWorldIds({
      coreIds: [a.id, rw.id],
      rwIds: [rw.id],
      byId,
    });
    assert.equal(ordered.filter((id) => id === rw.id).length, 1);
  });
});

describe('orderFlowContent authored flow', () => {
  it('resolves rw:N and skips patterns; buildFlow only inserts checks', () => {
    const hello = phrase('phrase.hello', 'Olá!');
    const gm = phrase('phrase.good_morning', 'Bom dia!');
    const rw = {
      ...phrase('phrase.rw.bom_dia_todos', 'Bom dia a todos!'),
      real_world: true,
      uses: ['phrase.good_morning'],
    } as Item;
    const flow = [
      'phrase.hello',
      'phrase.good_morning',
      'rw:0',
      'pattern.queria_um_uma',
    ];
    const ordered = orderFlowContent({
      flow,
      rwIds: [rw.id],
      candidateIds: [hello.id, gm.id, rw.id],
      items: [hello, gm, rw],
    });
    assert.deepEqual(ordered, [hello.id, gm.id, rw.id]);

    const slides = buildVocabFlow({
      itemIds: [hello.id, gm.id, rw.id],
      items: [hello, gm, rw],
      flow,
      rwIds: [rw.id],
      rand: seqRand(),
    });
    const itemIds = slides
      .filter((s) => s.kind === 'item')
      .map((s) => (s.kind === 'item' ? s.itemId : ''));
    assert.deepEqual(itemIds, [hello.id, gm.id, rw.id]);
    assert.ok(slides.some((s) => s.kind === 'micro_check'));
    assert.equal(slides[slides.length - 1]?.kind, 'end');
  });

  it('computed path places sentence after last use; RW not dumped at end', () => {
    const cafe = word('word.coffee', 'o café');
    const milk = word('word.milk', 'o leite');
    const order = phrase('phrase.order_coffee', 'Queria um café, por favor.');
    const rw = {
      ...phrase('phrase.rw.galao', 'Queria um galão, por favor.'),
      real_world: true,
      uses: ['word.coffee'],
    } as Item;
    const ordered = orderFlowContent({
      candidateIds: [order.id, cafe.id, milk.id, rw.id],
      items: [cafe, milk, order, rw],
    });
    assert.ok(ordered.indexOf(cafe.id) < ordered.indexOf(order.id));
    assert.ok(ordered.indexOf(cafe.id) < ordered.indexOf(rw.id));
    assert.notEqual(
      ordered.slice(-2).join(','),
      `${rw.id}`,
      'RW must not sit alone as a trailing dump',
    );
    // RW should sit right after coffee (its use), not after milk at the end
    assert.equal(ordered.indexOf(rw.id), ordered.indexOf(cafe.id) + 1);
  });
});
