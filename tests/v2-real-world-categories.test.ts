import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allowedCategoriesForSituation,
  categoryFromTag,
  tipFitsSituation,
} from '../lib/v2/generation/lesson/realWorldBuild';

describe('real-world categories', () => {
  it('maps Pode ajudar-me / help tags to ask, not order', () => {
    assert.equal(categoryFromTag('طلب مساعدة', 'Pode ajudar-me?'), 'ask');
    assert.equal(categoryFromTag('الطلب', 'Pode ajudar-me?'), 'ask');
    assert.equal(categoryFromTag('سؤال', 'Pode ajudar-me?'), 'ask');
  });

  it('office day forbids order/pay categories', () => {
    const allowed = allowedCategoriesForSituation(
      'أول يوم في الشغل',
      'O primeiro dia no trabalho',
      'Apresentar-se',
    );
    assert.ok(!allowed.includes('order'));
    assert.ok(!allowed.includes('pay'));
    assert.ok(allowed.includes('ask'));
  });

  it('café day allows order', () => {
    const allowed = allowedCategoriesForSituation(
      'في الكافيه',
      'No café',
      'Conversação Básica',
    );
    assert.ok(allowed.includes('order'));
  });
});

describe('tipFitsSituation', () => {
  it('rejects Quero→Queria on a greeting day', () => {
    const fit = tipFitsSituation(
      {
        title_eg: 'نصيحة',
        wrong_tl: 'Quero',
        right_tl: 'Queria',
        body_eg: 'دي المهذبة',
      },
      {
        coreTls: ['Olá!', 'Chamo-me Omar.', 'Boa noite!'],
        phraseTls: ['Sou novo aqui.'],
        situationEg: 'أول يوم في الشغل',
      },
    );
    assert.equal(fit.ok, false);
  });

  it('allows Quero→Queria on an ordering day', () => {
    const fit = tipFitsSituation(
      {
        title_eg: 'نصيحة',
        wrong_tl: 'Quero',
        right_tl: 'Queria',
        body_eg: 'دي المهذبة',
      },
      {
        coreTls: ['Queria um café.', 'A conta, se faz favor.'],
        phraseTls: ['Uma bica, se faz favor.'],
        situationEg: 'في الكافيه',
        grammarFocus: 'Queria + um/uma',
      },
    );
    assert.equal(fit.ok, true);
  });
});
