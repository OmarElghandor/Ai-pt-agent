/**
 * 2026-11-26 — "today's lesson first" question coverage (00 §7).
 * Regression from pt-PT day 4 (Mais Alguma Coisa?): 6 of 15 questions tested
 * recycle items, 4 core words (sugar, juice, cake, glass) got none, toast got
 * three, reply_speak played its own answer, and an rw slot pointed at a page
 * that does not exist.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import type { Question } from '../lib/v2/content/lesson';
import { assembleSlotQuestion } from '../lib/v2/generation/lesson/jobs/runQuestions';
import {
  planQuestionSlots,
  validateDayQuestionQuotas,
} from '../lib/v2/generation/lesson/questionSlots';
import type { OutlineResult } from '../lib/v2/generation/lesson/stages/types';

const phrase = (
  id: string,
  tl: string,
  ar: string,
  cloze: string,
  extra: Record<string, unknown> = {},
): Item =>
  ({ type: 'phrase', id, tl, ar, context_eg: 'موقف', cloze, role: 'said', ...extra }) as Item;
const word = (id: string, tl: string, ar: string, gender: 'm' | 'f' | 'n' = 'm'): Item =>
  ({ type: 'word', id, tl, ar, gender, pos: 'noun', has_card: true }) as Item;

// Recycle first, as mergeRecycleAndVerbs orders the bank.
const recycle: Item[] = [
  phrase('phrase.order_coffee', 'Queria um café, por favor.', 'أريد قهوة، من فضلك.', 'Queria'),
  phrase('phrase.with_milk', 'Com leite?', 'بالحليب؟', 'leite', { role: 'heard' }),
  phrase('phrase.hello', 'Olá!', 'مرحبًا!', 'Olá', { replies_to: 'Olá!' }),
  phrase('phrase.good_morning', 'Bom dia!', 'صباح الخير!', 'Bom', {
    replies_to: 'Bom dia!',
    variant_group: 'greeting.time_of_day',
  }),
  phrase('phrase.fine_thanks', 'Tudo bem, obrigado.', 'بخير، شكرًا.', 'obrigado'),
  phrase('phrase.ill_be_back', 'Já volto!', 'سأعود حالًا!', 'volto'),
];
const core: Item[] = [
  word('word.toast', 'a torrada', 'الخبز المحمص', 'f'),
  word('word.sugar', 'o açúcar', 'السكر'),
  word('word.juice', 'o sumo', 'العصير'),
  word('word.cake', 'o bolo', 'الكيك'),
  word('word.glass', 'o copo', 'الكوب'),
  phrase('phrase.how_much_is_it', 'Quanto é?', 'كم السعر؟', 'Quanto', {
    replies_to: 'São dois euros.',
  }),
  phrase('phrase.i_like_coffee', 'Gosto de café.', 'أحب القهوة.', 'Gosto'),
  phrase('phrase.youre_welcome', 'De nada.', 'عفوًا.', 'nada'),
  phrase('phrase.excuse_me_pass', 'Com licença.', 'لو سمحت.', 'licença'),
  word('word.entao', 'então', 'إذن', 'n'),
  phrase('phrase.then_how_much', 'Então, quanto é?', 'إذن، كم السعر؟', 'Então'),
  phrase('phrase.ok_thanks', 'Pronto, obrigado.', 'حسنًا، شكرًا.', 'Pronto'),
];
const rw: Item[] = [
  phrase('phrase.rw.uma_torrada_se_faz_favor', 'Uma torrada, se faz favor.', 'خبز محمص، من فضلك.', 'torrada', { real_world: true }),
  phrase('phrase.rw.com_acucar_ou_sem_acucar', 'Com açúcar ou sem açúcar?', 'بسكر أم بدون سكر؟', 'açúcar', { real_world: true }),
  phrase('phrase.rw.um_copo_de_sumo_de_laranja', 'Um copo de sumo de laranja.', 'كوب عصير برتقال.', 'copo', { real_world: true }),
  phrase('phrase.rw.pago_com_cartao', 'Pago com cartão.', 'أدفع بالبطاقة.', 'Pago', { real_world: true }),
];
const bank = [...recycle, ...core, ...rw];
const coreIds = core.map((i) => i.id);
const recycleIds = new Set(recycle.map((i) => i.id));

const outline: OutlineResult = {
  items: bank,
  pages: [
    {
      index: 0,
      page_id: 'p0_story',
      preset: 'story',
      mode: 'static',
      role: 'intro',
      title: 'القصة',
      purpose: 'intro',
      introduces: [],
      assumes: recycle.map((i) => i.id),
      handoff: '',
    },
    {
      index: 1,
      page_id: 'p1_vocab_flow',
      preset: 'vocab_flow',
      mode: 'static',
      title: 'تزوّد على طلبك وتدفع',
      purpose: 'vocab',
      introduces: coreIds,
      assumes: [],
      handoff: '',
    },
  ],
} as OutlineResult;

describe('day questions: today first (day-4 regression)', () => {
  const { slots } = planQuestionSlots({
    outline,
    items: bank,
    priorityIds: coreIds,
    coreItems: coreIds.map((id) => ({
      id,
      priority: id === 'word.entao' || id === 'phrase.ok_thanks' ? 'essential' : 'useful',
    })) as never,
    rwPhrases: rw.map((i) => ({ id: i.id })),
  });
  const tested = slots.map((s) => s.tests);

  it('tests every core item once, words included', () => {
    for (const id of coreIds) {
      assert.ok(tested.includes(id), `core ${id} untested; slots=${tested.join(',')}`);
    }
  });

  it('never gives a recycle item its own question', () => {
    for (const t of tested) assert.ok(!recycleIds.has(t), `recycle ${t} got a seat`);
  });

  it('adds 3 real-world slots on top, on a page that exists', () => {
    const rwSlots = slots.filter((s) => s.tests.startsWith('phrase.rw.'));
    assert.equal(rwSlots.length, 3);
    const pageIds = new Set(outline.pages.map((p) => p.page_id));
    for (const s of slots) assert.ok(pageIds.has(s.page_id), `bad page ${s.page_id}`);
    assert.equal(slots.length, coreIds.length + 3);
  });

  it('no item tested more than once before all are covered', () => {
    const counts = new Map<string, number>();
    for (const t of tested) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [id, n] of counts) assert.equal(n, 1, `${id} tested ${n}×`);
  });

  it('never plans reply_* without a real heard line', () => {
    for (const s of slots) {
      if (s.type !== 'reply_speak' && s.type !== 'reply_write') continue;
      assert.notEqual(s.tests, 'phrase.ok_thanks');
      assert.notEqual(s.tests, 'phrase.youre_welcome');
    }
  });

  it('keeps the skills balanced and passes the validator', () => {
    const questions: Question[] = [];
    for (const [i, slot] of slots.entries()) {
      const built = assembleSlotQuestion(
        slot,
        { slot_id: slot.slot_id, prompt_eg: 'السؤال' },
        { bank, index: i, preferIds: new Set(coreIds) },
      );
      if (built.question) questions.push(built.question);
    }
    assert.equal(questions.length, slots.length);
    const result = validateDayQuestionQuotas(questions, coreIds, {
      items: bank,
      plannedCount: slots.length,
    });
    assert.equal(result.ok, true, result.fatals.join('; '));
    assert.ok(!result.warnings.some((w) => w.startsWith('off_lesson')), result.warnings.join('; '));
  });

  it('meaning distractors come from today’s items first', () => {
    const q = slots.findIndex((s) => s.type === 'listen_meaning' || s.type === 'read_meaning');
    assert.ok(q >= 0);
    const slot = slots[q]!;
    if (slot.tests.startsWith('phrase.rw.')) return;
    const built = assembleSlotQuestion(
      slot,
      { slot_id: slot.slot_id, prompt_eg: 'السؤال' },
      { bank, index: q, preferIds: new Set(coreIds) },
    );
    const opts = (built.question as { options?: Array<Array<{ text: string }>> }).options ?? [];
    const recycleAr = new Set(recycle.map((i) => (i as { ar: string }).ar));
    for (const o of opts) {
      assert.ok(!recycleAr.has(o[0]!.text), `recycle distractor ${o[0]!.text}`);
    }
  });

  it('validator fails when a core word is untested', () => {
    const result = validateDayQuestionQuotas([], ['word.juice'], { items: bank, plannedCount: 0 });
    assert.ok(result.fatals.some((f) => f === 'untested word word.juice'));
  });
});
