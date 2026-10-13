import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleInputs,
  buildCumulativeAllowedWords,
  seedToPlanSlot,
} from '../lib/generation/inputAssembler';
import { validatePack } from '../lib/generation/validator';
import { loadSeedPlan } from '../lib/lessons/seedPlan';
import { loadNucleo, loadWordPriority, loadGrammarGrid } from '../lib/generation/wordData';

describe('practice content files', () => {
  it('loads word-priority, nucleo, grammar grid', () => {
    const words = loadWordPriority();
    assert.ok((words.topics || []).length > 0);
    assert.ok(loadNucleo().length > 0);
    assert.ok(loadGrammarGrid().length > 0);
  });
});

describe('ALLOWED_WORDS tier rule', () => {
  it('tier-1 slot only includes priority ≤1 cumulative words', () => {
    const seed = loadSeedPlan();
    const slots = seed.map(seedToPlanSlot);
    const slot = slots.find((s) => s.depth_tier === 1) || slots[0];
    const allowed = buildCumulativeAllowedWords(slot, slots);
    for (const w of allowed.filter((x) => x.topic === slot.topic)) {
      assert.ok(w.priority <= 1, `${w.text} priority ${w.priority}`);
    }
  });
});

describe('assembleInputs SLOT', () => {
  it('includes slot_id matching lesson_key', () => {
    const seed = loadSeedPlan();
    const slots = seed.map(seedToPlanSlot);
    const slot = slots[0];
    const inputs = assembleInputs(slot, [], { planSlots: slots });
    assert.equal(inputs.slot.slot_id, slot.lesson_key);
    assert.ok(Array.isArray(inputs.allowedWords));
    assert.ok(Array.isArray(inputs.nucleus));
  });
});

describe('structure-only validator', () => {
  it('rejects pack missing items', () => {
    const result = validatePack(
      { teach_steps: [], assessment: [] },
      { allowedWords: [], nucleus: [] },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e: { code: string }) => e.code === 'missing_field'));
  });

  it('rejects teach/item misalignment', () => {
    const result = validatePack(
      {
        teach_steps: [
          {
            id: 't01',
            phrase_pt: 'Olá!',
            meaning_ar: 'أهلاً!',
            meaning_arz: 'أهْلاً!',
            explanation_ar: 'تحية بسيطة.',
            explanation_arz: 'تَحِيَّة بَسيطة.',
            example_pt: 'Olá!',
            example_meaning_ar: 'أهلاً!',
            example_meaning_arz: 'أهْلاً!',
            accepted: ['Olá'],
          },
          {
            id: 't02',
            phrase_pt: 'Bom dia!',
            meaning_ar: 'صباح الخير',
            meaning_arz: 'صَباح الخِير',
            explanation_ar: 'الصبح.',
            explanation_arz: 'الصُّبْح.',
            example_pt: 'Bom dia!',
            example_meaning_ar: 'صباح الخير!',
            example_meaning_arz: 'صَباح الخِير!',
            accepted: ['Bom dia'],
          },
        ],
        items: [
          {
            id: 'p01',
            stage: 'sentences',
            kind: 'known',
            teach_step_ids: ['t01'],
            prompts: [{ pt: 'Como saudas o teu vizinho de manhã?', ar: 'إزاي بتسلم الصبح؟', arz: 'إِزاي' }],
            accepted: ['Bom dia'],
            anticipated_wrong: [],
            hint_note: 'صباح',
            why_note: 'Bom dia',
          },
          {
            id: 'p02',
            stage: 'sentences',
            kind: 'known',
            teach_step_ids: ['t01'],
            prompts: [{ label_pt: 'Diz em português', ar: 'أهلاً!', arz: 'أهْلاً!' }],
            accepted: ['Olá'],
            anticipated_wrong: [],
            hint_note: 'تحية',
            why_note: 'Olá',
          },
          {
            id: 'p03',
            stage: 'use',
            kind: 'known',
            teach_step_ids: ['t02'],
            prompts: [{ label_pt: 'Diz em português', ar: 'صباح الخير', arz: 'صَباح' }],
            accepted: ['Bom dia'],
            anticipated_wrong: [],
            hint_note: 'صباح',
            why_note: 'Bom dia',
          },
          {
            id: 'p04',
            stage: 'use',
            kind: 'known',
            teach_step_ids: ['t01'],
            prompts: [{ label_pt: 'Diz em português', ar: 'أهلاً!', arz: 'أهْلاً!' }],
            accepted: ['Olá'],
            anticipated_wrong: [],
            hint_note: 'تحية',
            why_note: 'Olá',
          },
        ],
        assessment: [],
      },
      { allowedWords: [], nucleus: [] },
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e: { code: string }) => e.code === 'teach_item_alignment'),
      JSON.stringify(result.errors),
    );
  });

  it('rejects a generic or unrelated why_note', () => {
    const step = {
      id: 't01',
      phrase_pt: 'Igualmente.',
      meaning_ar: 'وأنا كمان',
      meaning_arz: 'وأنا كَمان',
      explanation_ar: 'ترد بيها على Muito prazer.',
      explanation_arz: 'تِرُدّ بِيها',
      example_pt: 'Muito prazer! — Igualmente.',
      example_meaning_ar: 'تشرفنا — وأنا كمان',
      example_meaning_arz: 'تَشَرَّفْنا',
      accepted: ['Igualmente'],
    };
    const result = validatePack(
      {
        teach_steps: [step, { ...step, id: 't02', phrase_pt: 'Muito prazer!', accepted: ['Muito prazer'] }],
        items: [
          {
            id: 'p01',
            stage: 'sentences',
            kind: 'known',
            teach_step_ids: ['t01'],
            prompts: [{ pt: 'Qual é a resposta para "Muito prazer"?', ar: 'ترد إيه؟', arz: 'تِرُدّ إيه؟' }],
            accepted: ['Igualmente'],
            anticipated_wrong: [],
            hint_note: 'رد قصير',
            why_note: 'تحية',
          },
        ],
        assessment: [],
      },
      { allowedWords: [], nucleus: [] },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e: { code: string }) => e.code === 'generic_why_note'));
    assert.ok(result.errors.some((e: { code: string }) => e.code === 'missing_echo_wrong'));

    const missingPt = validatePack(
      {
        teach_steps: [step, { ...step, id: 't02', phrase_pt: 'Muito prazer!', accepted: ['Muito prazer'] }],
        items: [
          {
            id: 'p01',
            stage: 'sentences',
            kind: 'known',
            teach_step_ids: ['t01', 't02'],
            prompts: [{ ar: 'جارك قال لك Muito prazer. قول إيه؟', arz: 'جَارَك قَال' }],
            accepted: ['Igualmente', 'Muito prazer'],
            anticipated_wrong: [{ answer: 'Muito prazer Igualmente', verdict: 'near_miss', note: 'قول Igualmente بس' }],
            hint_note: 'رد قصير على التحية',
            why_note: 'جارك قال Muito prazer. الإجابة Igualmente لأن ده الرد على الجملة دي.',
          },
        ],
        assessment: [],
      },
      { allowedWords: [], nucleus: [] },
    );
    assert.ok(missingPt.errors.some((e: { code: string }) => e.code === 'prompt_missing_pt'));
    assert.ok(missingPt.errors.some((e: { code: string }) => e.code === 'accepted_is_prompt'));
  });

  it('rejects an open item that asks for an untaught verb', () => {
    const step = {
      id: 't01',
      phrase_pt: 'Sou de [CITY].',
      meaning_ar: 'أنا من مدينة',
      meaning_arz: 'أنا مِن مَدينة',
      explanation_ar: 'تقول مدينتك.',
      explanation_arz: 'تِقول مَدينْتَك.',
      example_pt: 'Sou de Lisboa.',
      example_meaning_ar: 'أنا من لشبونة',
      example_meaning_arz: 'أنا مِن لِشْبونة',
      accepted: ['Sou de [CITY].'],
    };
    const result = validatePack(
      {
        teach_steps: [step, { ...step, id: 't02', phrase_pt: 'Olá!', accepted: ['Olá'] }],
        items: [
          {
            id: 'p01',
            stage: 'use',
            kind: 'open',
            teach_step_ids: ['t01'],
            prompts: [{ pt: 'O que fazes?', ar: 'بتعمل إيه؟', arz: 'بِتِعْمِل إيه؟' }],
            frame: 'Eu trabalho',
            criterion: 'يقول trabalho',
            guard: 'trabalho',
          },
        ],
        assessment: [],
      },
      { allowedWords: [], nucleus: [] },
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(
        (e: { code: string; message?: string }) =>
          e.code === 'teach_item_alignment' && /trabalho/i.test(e.message || ''),
      ),
      JSON.stringify(result.errors),
    );
  });
});
