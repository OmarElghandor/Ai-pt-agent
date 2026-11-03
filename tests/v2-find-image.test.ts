import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import {
  buildFindImageRounds,
  eligibleFindImageItems,
  findImageStepVisible,
} from '../lib/v2/findImage/buildRounds';

function phrase(
  id: string,
  tl: string,
  opts?: { has_card?: false; url?: string },
): Item {
  return {
    type: 'phrase',
    id,
    tl,
    ar: `معنى ${tl}`,
    context_eg: 'سياق',
    cloze: tl.split(/\s+/)[0] ?? tl,
    ...(opts?.has_card === false ? { has_card: false as const } : {}),
    ...(opts?.url
      ? { image: { key: id, url: opts.url } }
      : {}),
  };
}

function word(
  id: string,
  tl: string,
  opts?: { has_card?: false; url?: string; gender?: 'm' | 'f' },
): Item {
  return {
    type: 'word',
    id,
    tl,
    ar: `معنى ${tl}`,
    gender: opts?.gender ?? 'm',
    ...(opts?.has_card === false ? { has_card: false as const } : {}),
    ...(opts?.url
      ? { image: { key: id, url: opts.url } }
      : {}),
  };
}

const fixedRand = () => 0.42;

describe('find-image eligibility and rounds', () => {
  it('includes carded phrases without image.url', () => {
    const items = [
      phrase('phrase.a', 'Olá'),
      phrase('phrase.b', 'Bom dia'),
      phrase('phrase.c', 'Boa tarde'),
      phrase('phrase.d', 'Boa noite'),
    ];
    assert.equal(eligibleFindImageItems(items).length, 4);
    assert.equal(findImageStepVisible(items), true);
  });

  it('excludes has_card: false items', () => {
    const items = [
      phrase('phrase.a', 'Olá'),
      phrase('phrase.b', 'Bom dia'),
      phrase('phrase.c', 'Boa tarde'),
      phrase('phrase.d', 'Boa noite', { has_card: false }),
    ];
    assert.equal(eligibleFindImageItems(items).length, 3);
    assert.equal(findImageStepVisible(items), false);
  });

  it('builds rounds with null urls when images are not ready', () => {
    const items = [
      phrase('phrase.a', 'Olá'),
      phrase('phrase.b', 'Bom dia'),
      phrase('phrase.c', 'Boa tarde'),
      phrase('phrase.d', 'Boa noite'),
    ];
    const rounds = buildFindImageRounds(items, { random: fixedRand });
    assert.ok(rounds);
    assert.ok(rounds.length >= 1);
    for (const round of rounds) {
      assert.equal(round.cards.length, 4);
      for (const card of round.cards) {
        assert.equal(card.url, null);
      }
    }
  });

  it('passes through ready urls on cards', () => {
    const items = [
      phrase('phrase.a', 'Olá', { url: 'https://cdn.example/a.jpg' }),
      phrase('phrase.b', 'Bom dia', { url: 'https://cdn.example/b.jpg' }),
      phrase('phrase.c', 'Boa tarde', { url: 'https://cdn.example/c.jpg' }),
      phrase('phrase.d', 'Boa noite', { url: 'https://cdn.example/d.jpg' }),
    ];
    const rounds = buildFindImageRounds(items, { random: fixedRand });
    assert.ok(rounds);
    const urls = rounds.flatMap((r) => r.cards.map((c) => c.url));
    assert.ok(urls.every((u) => typeof u === 'string' && u.startsWith('https://')));
  });

  it('hides the step when fewer than 4 carded items', () => {
    const items = [
      phrase('phrase.a', 'Olá'),
      phrase('phrase.b', 'Bom dia'),
      phrase('phrase.c', 'Boa tarde'),
    ];
    assert.equal(findImageStepVisible(items), false);
    assert.equal(buildFindImageRounds(items, { random: fixedRand }), null);
  });

  it('prefers words when ≥4 words are carded', () => {
    const items = [
      word('word.a', 'o pão'),
      word('word.b', 'o queijo'),
      word('word.c', 'o leite'),
      word('word.d', 'a água', { gender: 'f' }),
      phrase('phrase.x', 'Olá'),
      phrase('phrase.y', 'Bom dia'),
      phrase('phrase.z', 'Boa tarde'),
      phrase('phrase.w', 'Boa noite'),
    ];
    const rounds = buildFindImageRounds(items, { random: fixedRand });
    assert.ok(rounds);
    for (const round of rounds) {
      assert.ok(round.targetId.startsWith('word.'));
    }
  });
});
