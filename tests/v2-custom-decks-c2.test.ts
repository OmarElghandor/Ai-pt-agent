import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkGeneratedWords,
  generateCustomDeck,
  type ModelCaller,
} from '../lib/v2/decks/generate';
import type { GeneratedWord } from '../lib/v2/decks/generate/schema';

function goodNoun(tl: string, gender: 'm' | 'f' = 'm'): GeneratedWord {
  const lemma = tl.replace(/^(o|a)\s+/i, '');
  return {
    tl,
    pos: 'noun',
    gender,
    ar: 'كلمة',
    example_tl: `${tl} é útil.`,
    example_ar: 'مفيدة.',
    concept_en: lemma.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'thing',
  };
}

function nGoods(n: number, prefix = 'item'): GeneratedWord[] {
  const arts: Array<['o' | 'a', 'm' | 'f']> = [
    ['o', 'm'],
    ['a', 'f'],
  ];
  const out: GeneratedWord[] = [];
  for (let i = 0; i < n; i++) {
    const [art, g] = arts[i % 2]!;
    out.push(goodNoun(`${art} ${prefix}${i}`, g));
  }
  return out;
}

describe('C2 · checks drop bad words', () => {
  it('drops Brazilian words', () => {
    const { kept, dropped } = checkGeneratedWords([
      goodNoun('o frigorífico'),
      {
        tl: 'a geladeira',
        pos: 'noun',
        gender: 'f',
        ar: 'ثلاجة',
        example_tl: 'A geladeira é grande.',
        example_ar: 'كبيرة.',
        concept_en: 'fridge',
      },
    ]);
    assert.equal(kept.length, 1);
    assert.equal(dropped[0]?.reason, 'brazilian');
  });

  it('drops slash in tl', () => {
    const { dropped } = checkGeneratedWords([
      {
        tl: 'amigo/amiga',
        pos: 'noun',
        gender: 'm',
        ar: 'صديق',
        example_tl: 'Ele é amigo.',
        example_ar: 'هو صديق.',
        concept_en: 'friend',
      },
    ]);
    assert.equal(dropped[0]?.reason, 'slash_in_tl');
  });

  it('drops noun with no article', () => {
    const { dropped } = checkGeneratedWords([
      {
        tl: 'chuva',
        pos: 'noun',
        gender: 'f',
        ar: 'مطر',
        example_tl: 'A chuva cai.',
        example_ar: 'تمطر.',
        concept_en: 'rain',
      },
    ]);
    assert.equal(dropped[0]?.reason, 'noun_article');
  });

  it('removes duplicates by lemma', () => {
    const { kept, dropped } = checkGeneratedWords([
      goodNoun('a chuva', 'f'),
      goodNoun('A chuva', 'f'),
    ]);
    assert.equal(kept.length, andAssert(kept.length, 1));
    assert.equal(dropped[0]?.reason, 'duplicate');
  });

  it('drops missing or non-Arabic example_ar', () => {
    const empty = checkGeneratedWords([
      {
        ...goodNoun('o mar'),
        example_ar: '   ',
      },
    ]);
    assert.equal(empty.dropped[0]?.reason, 'example_ar_empty');

    const latin = checkGeneratedWords([
      {
        ...goodNoun('o sol'),
        example_ar: 'the sun',
      },
    ]);
    assert.equal(latin.dropped[0]?.reason, 'example_ar_not_arabic');
  });

  it('drops bad concept_en', () => {
    const { dropped } = checkGeneratedWords([
      { ...goodNoun('o mar'), concept_en: 'Bad Slug!' },
    ]);
    assert.equal(dropped[0]?.reason, 'concept_en_bad');
  });

  it('adds say and never keeps conjugations', () => {
    const { kept } = checkGeneratedWords([
      {
        tl: 'falar',
        pos: 'verb',
        ar: 'يتحدث',
        example_tl: 'Quero falar português.',
        example_ar: 'أريد أن أتحدث.',
        concept_en: 'to_speak',
        conjugations: { eu: 'falo', tu: 'falas' },
      },
    ]);
    assert.equal(kept.length, 1);
    assert.ok(kept[0]!.say.length > 0);
    assert.equal(kept[0]!.conjugations, undefined);
  });
});

function andAssert(actual: number, expected: number): number {
  assert.equal(actual, expected);
  return actual;
}

describe('C2 · generate with stub model', () => {
  it('topic_ok false saves nothing and does not use quota', async () => {
    const callModel: ModelCaller = async () => ({
      data: {
        topic_ok: false,
        topic_reason: 'politics',
        words: nGoods(20),
      },
      latency_ms: 1,
    });
    const r = await generateCustomDeck({
      topic: 'الطقس',
      callModel,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, 'topic_rejected');
      assert.equal(r.counts_for_quota, false);
    }
  });

  it('12 good words trigger exactly one top-up', async () => {
    let calls = 0;
    const callModel: ModelCaller = async ({ toolName }) => {
      calls += 1;
      if (toolName === 'submit_custom_deck_topup') {
        return {
          data: { words: nGoods(5, 'top') },
          latency_ms: 1,
        };
      }
      return {
        data: {
          topic_ok: true,
          title_tl: 'Tempo',
          title_ar: 'الطقس',
          tags: ['weather'],
          words: nGoods(12, 'base'),
        },
        latency_ms: 1,
      };
    };
    const r = await generateCustomDeck({ topic: 'الطقس', callModel });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.top_up_called, true);
      assert.ok(r.words.length >= 15);
      assert.equal(calls, 2);
    }
  });

  it('parse failure retries once', async () => {
    let calls = 0;
    const callModel: ModelCaller = async () => {
      calls += 1;
      if (calls === 1) {
        return { data: { not: 'valid' }, latency_ms: 1 };
      }
      return {
        data: {
          topic_ok: true,
          title_tl: 'Cozinha',
          title_ar: 'المطبخ',
          tags: ['kitchen'],
          words: nGoods(20, 'k'),
        },
        latency_ms: 1,
      };
    };
    const r = await generateCustomDeck({ topic: 'المطبخ', callModel });
    assert.equal(r.ok, true);
    assert.equal(calls, 2);
  });

  it('blocklist rejects before model', async () => {
    let calls = 0;
    const r = await generateCustomDeck({
      topic: 'مخدرات الشارع',
      callModel: async () => {
        calls += 1;
        return { data: {}, latency_ms: 0 };
      },
    });
    assert.equal(r.ok, false);
    assert.equal(calls, 0);
    if (!r.ok) assert.equal(r.counts_for_quota, false);
  });

  it('verb never retains conjugated forms after generate', async () => {
    const callModel: ModelCaller = async () => ({
      data: {
        topic_ok: true,
        title_tl: 'Verbos',
        title_ar: 'أفعال',
        tags: ['verbs'],
        words: [
          ...nGoods(19, 'n'),
          {
            tl: 'comer',
            pos: 'verb',
            ar: 'يأكل',
            example_tl: 'Vou comer agora.',
            example_ar: 'سأكل الآن.',
            concept_en: 'to_eat',
            conjugations: { eu: 'como' },
          },
        ],
      },
      latency_ms: 1,
    });
    const r = await generateCustomDeck({ topic: 'الأكل', callModel });
    assert.equal(r.ok, true);
    if (r.ok) {
      const verb = r.words.find((w) => w.pos === 'verb');
      assert.ok(verb);
      assert.equal(verb!.conjugations, undefined);
    }
  });
});
