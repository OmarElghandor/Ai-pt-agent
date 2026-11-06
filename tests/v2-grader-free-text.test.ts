import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  noFreeTextCorrection,
  parseFreeTextCorrection,
  validateFreeTextCorrection,
  type FreeTextCorrection,
} from '@/lib/v2/grader';

function okCase(
  answer: string,
  payload: Record<string, unknown>,
): FreeTextCorrection {
  const check = validateFreeTextCorrection(payload, answer);
  assert.equal(check.ok, true);
  if (!check.ok) throw new Error('unreachable');
  return check.value;
}

describe('v2 grader · free-text correction (K1)', () => {
  it('eu Prefero noite → prefiro + à noite', () => {
    const out = okCase('eu Prefero noite', {
      has_error: true,
      severity: 'error',
      corrected_tl: 'Eu prefiro à noite.',
      changes: [
        { from: 'Prefero', to: 'prefiro' },
        { from: 'noite', to: 'à noite' },
      ],
      main_error: {
        from: 'Prefero',
        to: 'prefiro',
        type: 'grammar/verb_form',
      },
      note_eg: 'بنقول prefiro مش prefero — من الفعل preferir',
      ar: 'أنا أفضل في الليل.',
    });
    assert.equal(out.has_error, true);
    assert.equal(out.severity, 'error');
    assert.equal(out.corrected_tl, 'Eu prefiro à noite.');
    assert.equal(out.main_error?.from, 'Prefero');
    assert.equal(out.main_error?.to, 'prefiro');
    assert.equal(out.main_error?.type, 'grammar/verb_form');
  });

  it('digits instead of words → no error', () => {
    const out = okCase('Eu vou ao ginásio 3 vezes por semana', {
      has_error: false,
      severity: 'none',
      corrected_tl: '',
      changes: [],
      main_error: null,
      note_eg: '',
      ar: '',
    });
    assert.deepEqual(out, noFreeTextCorrection());
  });

  it('gosto comer → gosto de', () => {
    const out = okCase('Eu gosto comer koshari', {
      has_error: true,
      severity: 'error',
      corrected_tl: 'Eu gosto de comer koshari.',
      changes: [{ from: 'gosto comer', to: 'gosto de comer' }],
      main_error: {
        from: 'gosto comer',
        to: 'gosto de comer',
        type: 'grammar/preposition',
      },
      note_eg: 'بنقول gosto de مش gosto لوحدها',
      ar: 'أحب أكل الكشري.',
    });
    assert.match(out.corrected_tl, /gosto de comer/);
    assert.equal(out.main_error?.type, 'grammar/preposition');
  });

  it('messy spelling → corrected sentence', () => {
    const out = okCase('Nao meu casa é pocenuo', {
      has_error: true,
      severity: 'error',
      corrected_tl: 'Não, a minha casa é pequena.',
      changes: [
        { from: 'Nao', to: 'Não' },
        { from: 'meu casa', to: 'a minha casa' },
        { from: 'pocenuo', to: 'pequena' },
      ],
      main_error: {
        from: 'meu casa',
        to: 'a minha casa',
        type: 'grammar/agreement',
      },
      note_eg: 'casa مؤنث — بنقول a minha casa',
      ar: 'لا، بيتي صغير.',
    });
    assert.equal(out.corrected_tl, 'Não, a minha casa é pequena.');
  });

  it('agreement: pequeno → pequena', () => {
    const out = okCase('a minha casa é pequeno', {
      has_error: true,
      severity: 'error',
      corrected_tl: 'A minha casa é pequena.',
      changes: [{ from: 'pequeno', to: 'pequena' }],
      main_error: {
        from: 'pequeno',
        to: 'pequena',
        type: 'grammar/agreement',
      },
      note_eg: 'casa مؤنث — pequena مش pequeno',
      ar: 'بيتي صغير.',
    });
    assert.equal(out.main_error?.type, 'grammar/agreement');
  });

  it('conjugation: Eu vai → Eu vou', () => {
    const out = okCase('Eu vai trabalhar', {
      has_error: true,
      severity: 'error',
      corrected_tl: 'Eu vou trabalhar.',
      changes: [{ from: 'vai', to: 'vou' }],
      main_error: {
        from: 'vai',
        to: 'vou',
        type: 'grammar/verb_form',
      },
      note_eg: 'مع eu بنقول vou مش vai',
      ar: 'سأذهب للعمل.',
    });
    assert.equal(out.main_error?.type, 'grammar/verb_form');
  });

  it('Brazilian voce → Onde moras?', () => {
    const out = okCase('Voce mora onde?', {
      has_error: true,
      severity: 'error',
      corrected_tl: 'Onde moras?',
      changes: [
        { from: 'Voce mora', to: 'moras' },
        { from: 'mora onde', to: 'Onde moras' },
      ],
      main_error: {
        from: 'Voce',
        to: 'tu',
        type: 'vocabulary/brazilian',
      },
      note_eg: 'في البرتغال بنكلم بـ tu — Onde moras؟',
      ar: 'أين تسكن؟',
    });
    assert.equal(out.main_error?.type, 'vocabulary/brazilian');
    assert.equal(out.corrected_tl, 'Onde moras?');
  });

  it('rejects identical corrected_tl after normalisation', () => {
    const check = validateFreeTextCorrection(
      {
        has_error: true,
        severity: 'error',
        corrected_tl: 'eu prefero noite',
        changes: [{ from: 'a', to: 'b' }],
        main_error: {
          from: 'a',
          to: 'b',
          type: 'grammar/verb_form',
        },
        note_eg: 'اختبار',
        ar: 'اختبار',
      },
      'Eu Prefero noite!',
    );
    assert.equal(check.ok, true);
    if (check.ok) assert.equal(check.value.has_error, false);
  });

  it('rejects CJK in corrected_tl', () => {
    const check = validateFreeTextCorrection(
      {
        has_error: true,
        severity: 'error',
        corrected_tl: 'Eu prefiro 你好',
        changes: [{ from: 'x', to: 'y' }],
        main_error: {
          from: 'x',
          to: 'y',
          type: 'grammar/verb_form',
        },
        note_eg: 'اختبار',
        ar: 'اختبار',
      },
      'eu Prefero',
    );
    assert.equal(check.ok, false);
  });

  it('rejects Brazilian leak in corrected_tl', () => {
    const check = validateFreeTextCorrection(
      {
        has_error: true,
        severity: 'error',
        corrected_tl: 'Eu pego o ônibus.',
        changes: [{ from: 'autocarro', to: 'ônibus' }],
        main_error: {
          from: 'autocarro',
          to: 'ônibus',
          type: 'vocabulary/brazilian',
        },
        note_eg: 'اختبار',
        ar: 'اختبار',
      },
      'Eu pego o autocarro',
    );
    assert.equal(check.ok, false);
    if (!check.ok) assert.equal(check.reason, 'brazilian');
  });

  it('parseFreeTextCorrection reads JSON from model text', () => {
    const text = `Here you go:
\`\`\`json
{"has_error":true,"severity":"accent","corrected_tl":"Vou à escola.","changes":[{"from":"a","to":"à"}],"main_error":{"from":"a","to":"à","type":"spelling/accent"},"note_eg":"انتبه للعلامة: à","ar":"أذهب إلى المدرسة."}
\`\`\``;
    const check = parseFreeTextCorrection(text, 'Vou a escola');
    assert.equal(check.ok, true);
    if (check.ok) {
      assert.equal(check.value.severity, 'accent');
      assert.equal(check.value.main_error?.type, 'spelling/accent');
    }
  });
});
