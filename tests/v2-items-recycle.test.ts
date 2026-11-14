import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import type { LessonBrief } from '../lib/v2/generation/lesson/brief';
import { findCoreItemById } from '../lib/v2/generation/lesson/coreItems';
import {
  mergeRecycleAndVerbs,
  missingRecycleIdsForPrompt,
  validateItemsRules,
} from '../lib/v2/generation/lesson/jobs/runItems';

function brief(partial: Partial<LessonBrief> & Pick<LessonBrief, 'recycle_ids'>): LessonBrief {
  return {
    day: 33,
    phase: 1,
    week: 5,
    title_tl: 'Test',
    title_ar: 'اختبار',
    situation_eg: 'اختبار',
    rule_eg: '(none)',
    grammar_focus: '(none)',
    max_words: 7,
    chat_character: 'ines',
    early_chunks_tl: [],
    core_items: [],
    core_items_tl: [],
    core_items_source: 'core_file',
    no_new_items: false,
    planned_presets: [],
    yesterday: null,
    yesterday_missing: false,
    micro_step: '(none)',
    authored_real_world: null,
    authored_flow: null,
    warnings: [],
    ...partial,
  };
}

describe('findCoreItemById', () => {
  it('resolves pattern.contractions and verb.ir from the curriculum', () => {
    const pattern = findCoreItemById('pattern.contractions');
    assert.ok(pattern);
    assert.equal(pattern!.kind, 'pattern');
    const verb = findCoreItemById('verb.ir');
    assert.ok(verb);
    assert.equal(verb!.kind, 'verb');
    assert.equal(findCoreItemById('word.does_not_exist_xyz'), null);
  });
});

describe('mergeRecycleAndVerbs recycle guarantee', () => {
  it('injects pattern recycle from known without ar (empty model)', () => {
    const knownPattern = {
      type: 'pattern' as const,
      id: 'pattern.contractions',
      slots: [{ tl: 'de+o=do' }, { name_eg: 'كلمة', kind: 'word' as const }],
      examples: ['pattern.contractions.ex.1'],
    } as Item;
    const knownFull = new Map<string, Item>([
      ['pattern.contractions', knownPattern],
    ]);
    const bank = mergeRecycleAndVerbs(
      [],
      brief({ recycle_ids: ['pattern.contractions'] }),
      knownFull,
    );
    assert.ok(bank.some((i) => i.id === 'pattern.contractions'));
    const tiered = validateItemsRules(
      bank,
      [{ id: 'pattern.contractions', type: 'pattern', tl: 'de+o=do' }],
      [],
      brief({ recycle_ids: ['pattern.contractions'] }),
    );
    assert.equal(
      tiered.fatals.filter((f) => f.rule === 'recycle_missing').length,
      0,
    );
    assert.equal(
      tiered.fatals.filter((f) => f.rule === 'recycle_ar').length,
      0,
    );
  });

  it('completes thin registry pattern stubs with slots (no crash)', () => {
    // Mirrors loadKnownItemMap core-file stubs: type/id/tl only, no slots.
    const thin = {
      type: 'pattern' as const,
      id: 'pattern.contractions',
      tl: 'de+o=do · em+a=na · a+o=ao · a+a=à',
      ar: '',
    } as Item;
    const knownFull = new Map<string, Item>([['pattern.contractions', thin]]);
    const b = brief({ recycle_ids: ['pattern.contractions'] });
    const bank = mergeRecycleAndVerbs([], b, knownFull);
    const row = bank.find((i) => i.id === 'pattern.contractions');
    assert.ok(row);
    assert.equal(row!.type, 'pattern');
    const slots = (row as { slots?: unknown[] }).slots;
    assert.ok(Array.isArray(slots) && slots.length >= 1);
    let tiered: ReturnType<typeof validateItemsRules>;
    assert.doesNotThrow(() => {
      tiered = validateItemsRules(
        bank,
        [{ id: 'pattern.contractions', type: 'pattern', tl: thin.tl as string }],
        [],
        b,
      );
    });
    assert.equal(
      tiered!.fatals.filter((f) => f.rule === 'recycle_missing').length,
      0,
    );
  });

  it('stubs verb recycle from core plan when known is empty', () => {
    const bank = mergeRecycleAndVerbs(
      [],
      brief({ recycle_ids: ['verb.ir'] }),
      new Map(),
    );
    const row = bank.find((i) => i.id === 'verb.ir');
    assert.ok(row);
    assert.equal(row!.type, 'word');
    const tiered = validateItemsRules(
      bank,
      [],
      [],
      brief({ recycle_ids: ['verb.ir'] }),
    );
    assert.equal(
      tiered.fatals.filter((f) => f.rule === 'recycle_missing').length,
      0,
    );
    assert.equal(
      tiered.fatals.filter((f) => f.rule === 'recycle_ar').length,
      0,
    );
  });

  it('keeps phrase recycle with known MSA ar', () => {
    const phrase = {
      type: 'phrase' as const,
      id: 'phrase.excuse_me',
      tl: 'Desculpe.',
      ar: 'عفوًا.',
      context_eg: 'لما تعوز تلفت نظر حد',
      cloze: 'Desculpe',
    } as Item;
    const knownFull = new Map<string, Item>([['phrase.excuse_me', phrase]]);
    const bank = mergeRecycleAndVerbs(
      [],
      brief({ recycle_ids: ['phrase.excuse_me'] }),
      knownFull,
    );
    const row = bank.find((i) => i.id === 'phrase.excuse_me');
    assert.ok(row);
    assert.equal((row as { ar: string }).ar, 'عفوًا.');
    const tiered = validateItemsRules(
      bank,
      [{ id: 'phrase.excuse_me', type: 'phrase', tl: 'Desculpe.' }],
      [],
      brief({ recycle_ids: ['phrase.excuse_me'] }),
    );
    assert.equal(
      tiered.fatals.filter(
        (f) => f.rule === 'recycle_missing' || f.rule === 'recycle_ar',
      ).length,
      0,
    );
  });

  it('no_new_items path: mixed pattern + phrase(known ar) bank is complete', () => {
    const phrase = {
      type: 'phrase' as const,
      id: 'phrase.excuse_me',
      tl: 'Desculpe.',
      ar: 'عفوًا.',
      context_eg: 'لما تعوز تلفت نظر حد',
      cloze: 'Desculpe',
    } as Item;
    const knownFull = new Map<string, Item>([['phrase.excuse_me', phrase]]);
    const b = brief({
      no_new_items: true,
      recycle_ids: ['pattern.contractions', 'phrase.excuse_me'],
    });
    const bank = mergeRecycleAndVerbs([], b, knownFull);
    assert.ok(bank.some((i) => i.id === 'pattern.contractions'));
    assert.ok(bank.some((i) => i.id === 'phrase.excuse_me'));
    const tiered = validateItemsRules(bank, [], [], b);
    assert.equal(
      tiered.fatals.filter(
        (f) => f.rule === 'recycle_missing' || f.rule === 'recycle_ar',
      ).length,
      0,
    );
  });
});

describe('missingRecycleIdsForPrompt', () => {
  it('excludes pattern/verb and phrases that already have MSA ar', () => {
    const knownFull = new Map<string, Item>([
      [
        'phrase.excuse_me',
        {
          type: 'phrase',
          id: 'phrase.excuse_me',
          tl: 'Desculpe.',
          ar: 'عفوًا.',
          context_eg: 'x',
          cloze: 'Desculpe',
        } as Item,
      ],
    ]);
    const missing = missingRecycleIdsForPrompt(
      [
        'pattern.contractions',
        'verb.ir',
        'phrase.excuse_me',
        'phrase.slower',
      ],
      knownFull,
    );
    assert.deepEqual(missing, ['phrase.slower']);
  });
});
