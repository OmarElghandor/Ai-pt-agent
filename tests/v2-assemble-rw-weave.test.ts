import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import type { Page } from '../lib/v2/content/page';
import {
  applyRealWorldToAssemble,
  runAssembleJob,
} from '../lib/v2/generation/lesson/jobs/runAssemble';
import type { RealWorldHandoff } from '../lib/v2/generation/lesson/realWorldBuild';
import type { OutlineResult } from '../lib/v2/generation/lesson/stages/types';

function tipHandoff(phrases: RealWorldHandoff['phrases']): RealWorldHandoff {
  return {
    phrases,
    tip: {
      title_eg: 'نصيحة',
      wrong_tl: 'Quero',
      right_tl: 'Queria',
      body_eg: 'قول Queria لما تطلب.',
    },
    hide: false,
    issues: [],
    authored: true,
  };
}

function rwPhrase(
  id: string,
  tl: string,
  uses: string[] = ['word.cafe'],
): RealWorldHandoff['phrases'][number] {
  return {
    id,
    tl,
    ar: `معنى ${tl}`,
    eg_note: 'إمتى تقولها',
    tag: 'الطلب',
    category: 'order',
    say: 'ساي',
    cloze: tl.split(/\s+/).slice(-1)[0]!,
    uses,
  };
}

describe('assemble real_world weave into vocab_flow', () => {
  it('applyRealWorldToAssemble appends RW ids onto vocab_flow cards', () => {
    const core: Item = {
      type: 'word',
      id: 'word.cafe',
      tl: 'o café',
      ar: 'قهوة',
    };
    const page: Page = {
      id: 'p_vocab',
      title: [{ text: 'الكلمات', lang: 'eg' }],
      preset: 'vocab_flow',
      mode: 'static',
      blocks: [{ id: 'cards1', type: 'cards', items: ['word.cafe'] }],
    };
    const outline: OutlineResult = {
      items: [core],
      pages: [
        {
          index: 0,
          page_id: 'p_vocab',
          preset: 'vocab_flow',
          mode: 'static',
          title: 'الكلمات',
          purpose: '',
          introduces: ['word.cafe'],
          assumes: [],
          handoff: '',
        },
      ],
      issues: [],
    };
    const handoff = tipHandoff([
      rwPhrase('phrase.rw.a', 'Uma bica, se faz favor.'),
      rwPhrase('phrase.rw.b', 'Pode trazer um copo de água?'),
      rwPhrase('phrase.rw.c', 'A conta, se faz favor.'),
    ]);
    const out = applyRealWorldToAssemble({
      outline,
      pages: [page],
      items: [core],
      questions: [],
      handoff,
    });
    const cards = out.pages[0]!.blocks.find((b) => b.type === 'cards');
    assert.ok(cards && cards.type === 'cards');
    assert.ok(cards.items.includes('word.cafe'));
    assert.ok(cards.items.includes('phrase.rw.a'));
    assert.ok(cards.items.includes('phrase.rw.b'));
    assert.ok(cards.items.includes('phrase.rw.c'));
    assert.ok(out.items.some((i) => i.id === 'phrase.rw.a' && (i as { real_world?: boolean }).real_world));
  });

  it('runAssembleJob keeps woven RW ids after forceVocabFlowCards', () => {
    const core: Item[] = [
      { type: 'word', id: 'word.cafe', tl: 'o café', ar: 'قهوة' },
      { type: 'phrase', id: 'phrase.queria', tl: 'Queria um café.', ar: 'عايز قهوة' },
    ];
    const page: Page = {
      id: 'p_vocab',
      title: [{ text: 'الكلمات', lang: 'eg' }],
      preset: 'vocab_flow',
      mode: 'static',
      blocks: [
        {
          id: 'cards1',
          type: 'cards',
          items: ['word.cafe', 'phrase.queria'],
        },
      ],
    };
    const outline: OutlineResult = {
      items: core,
      pages: [
        {
          index: 0,
          page_id: 'p_vocab',
          preset: 'vocab_flow',
          mode: 'static',
          title: 'الكلمات',
          purpose: '',
          introduces: ['word.cafe', 'phrase.queria'],
          assumes: [],
          handoff: '',
        },
      ],
      issues: [],
    };
    const handoff = tipHandoff([
      rwPhrase('phrase.rw.a', 'Uma bica, se faz favor.'),
      rwPhrase('phrase.rw.b', 'Pode trazer um copo de água?'),
      rwPhrase('phrase.rw.c', 'A conta, se faz favor.'),
    ]);

    const { pack } = runAssembleJob({
      day: 3,
      targetLang: 'pt-PT',
      outline,
      pages: [page],
      items: core,
      questions: [],
      realWorld: handoff,
      situationEg: 'في الكافيه',
    });

    const vocab = pack.pages.find((p) => p.preset === 'vocab_flow');
    assert.ok(vocab);
    const cards = vocab!.blocks.find((b) => b.type === 'cards');
    assert.ok(cards && cards.type === 'cards');
    assert.ok(cards.items.includes('word.cafe'));
    assert.ok(cards.items.includes('phrase.queria'));
    assert.ok(cards.items.includes('phrase.rw.a'));
    assert.ok(cards.items.includes('phrase.rw.b'));
    assert.ok(cards.items.includes('phrase.rw.c'));
  });
});
