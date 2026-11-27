import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Item } from '../lib/v2/content/items';
import { loadMicroOutline } from '../lib/v2/micro/outline';
import {
  checkMicroLines,
  generateMicroClip,
  highlightFormInLine,
  type ModelCaller,
} from '../lib/v2/micro/generate';
import { resolveForm } from '../lib/v2/content/conjugations/resolve';

function line(
  tl: string,
  ar: string,
  extra: Record<string, unknown> = {},
) {
  return { tl, ar, pos: 'phrase' as const, ...extra };
}

describe('M2 · checkMicroLines', () => {
  it('drops a Brazilian line', () => {
    const r = checkMicroLines(
      [line('O ônibus chegou', 'وصلت الحافلة')],
      { layout: 'list' },
    );
    assert.equal(r.kept.length, 0);
    assert.equal(r.dropped[0]?.reason, 'brazilian');
  });

  it('drops a line over 8 words', () => {
    const r = checkMicroLines(
      [
        line(
          'Eu vou agora mesmo para a casa da minha amiga nova',
          'أنا رايح',
        ),
      ],
      { layout: 'list' },
    );
    assert.equal(r.kept.length, 0);
    assert.equal(r.dropped[0]?.reason, 'too_many_words');
  });

  it('drops a scene line without region hint', () => {
    const r = checkMicroLines(
      [line('este bolo', 'هذه الكعكة', { concept_en: 'cake' })],
      { layout: 'scene' },
    );
    assert.equal(r.kept.length, 0);
    assert.equal(r.dropped[0]?.reason, 'scene_no_region');
  });

  it('rule clip drops irregular and repeated verbs; highlight from table', () => {
    const form = resolveForm('verb.falar:pres:eu');
    assert.ok(form);
    const r = checkMicroLines(
      [
        line('Eu falo português.', 'أتحدث البرتغالية.', {
          verb_lemma: 'falar',
        }),
        line('Eu sou professor.', 'أنا مدرس.', { verb_lemma: 'ser' }),
        line('Eu falo bem.', 'أتحدث جيدا.', { verb_lemma: 'falar' }),
        line('Eu trabalho em Lisboa.', 'أعمل في لشبونة.', {
          verb_lemma: 'trabalhar',
        }),
        line('Eu moro perto.', 'أسكن قريبا.', { verb_lemma: 'morar' }),
        line('Eu estudo muito.', 'أدرس كثيرا.', { verb_lemma: 'estudar' }),
        line('Eu compro pão.', 'أشتري خبزا.', { verb_lemma: 'comprar' }),
        line('Eu chego cedo.', 'أصل مبكرا.', { verb_lemma: 'chegar' }),
      ],
      { layout: 'rule', ruleTense: 'pres', rulePerson: 'eu' },
    );
    assert.ok(r.dropped.some((d) => d.reason === 'rule_irregular'));
    assert.ok(r.dropped.some((d) => d.reason === 'rule_repeat_verb'));
    const falar = r.kept.find((l) => l.verb_lemma === 'falar');
    assert.ok(falar?.highlight);
    const hl = highlightFormInLine('Eu falo português.', form!);
    assert.deepEqual(falar?.highlight, hl);
  });

  it('pret / ele rule clip keeps Ele falou with ending highlight', () => {
    const form = resolveForm('verb.falar:pret:ele');
    assert.ok(form);
    const tl = 'Ele falou comigo.';
    const r = checkMicroLines(
      [line(tl, 'هو كلمني.', { verb_lemma: 'falar' })],
      { layout: 'rule', ruleKind: 'verb_ending', ruleTense: 'pret', rulePerson: 'ele' },
    );
    assert.equal(r.kept.length, 1);
    assert.deepEqual(r.kept[0]?.highlight, highlightFormInLine(tl, form!));
  });

  it('pattern rule clip highlights no in Estou no café', () => {
    const tl = 'Estou no café';
    const r = checkMicroLines([line(tl, 'أنا في المقهى.')], {
      layout: 'rule',
      ruleKind: 'pattern',
      ruleHighlight: ['no', 'na', 'nos', 'nas', 'do', 'da', 'dos', 'das'],
    });
    assert.equal(r.kept.length, 1);
    const idx = tl.toLowerCase().indexOf('no');
    assert.deepEqual(r.kept[0]?.highlight, { start: idx, end: idx + 2 });
  });

  it('pattern rule clip drops a line with no highlight token', () => {
    const r = checkMicroLines([line('Estou aqui.', 'أنا هنا.')], {
      layout: 'rule',
      ruleKind: 'pattern',
      ruleHighlight: ['no', 'na', 'do', 'da'],
    });
    assert.equal(r.kept.length, 0);
    assert.equal(r.dropped[0]?.reason, 'rule_breaks');
  });

  it('imperf rule clip drops irregular verbs and keeps verified regulars', () => {
    const form = resolveForm('verb.falar:imperf:eu');
    assert.ok(form);
    const r = checkMicroLines(
      [
        line('Eu era professor.', 'كنت مدرسا.', { verb_lemma: 'ser' }),
        line('Eu falava árabe.', 'كنت أتكلم عربي.', { verb_lemma: 'falar' }),
      ],
      {
        layout: 'rule',
        ruleKind: 'verb_ending',
        ruleTense: 'imperf',
        rulePerson: 'eu',
      },
    );
    assert.ok(r.dropped.some((d) => d.reason === 'rule_irregular'));
    const falar = r.kept.find((l) => l.verb_lemma === 'falar');
    assert.ok(falar);
    assert.deepEqual(
      falar?.highlight,
      highlightFormInLine('Eu falava árabe.', form!),
    );
  });

  it('rule_person list accepts any listed person form', () => {
    const r = checkMicroLines(
      [
        line('Ele come pão.', 'هو بيأكل خبز.', { verb_lemma: 'ficar' }),
        line('Eu falo bem.', 'بتكلم كويس.', { verb_lemma: 'falar' }),
        line('Ele chega cedo.', 'بيوصل بدري.', { verb_lemma: 'chegar' }),
      ],
      {
        layout: 'rule',
        ruleKind: 'verb_ending',
        ruleTense: 'pres',
        rulePerson: ['eu', 'ele'],
      },
    );
    // ficar line has no ficar form → rule_breaks; falar (eu) + chegar (ele) kept
    assert.ok(r.dropped.some((d) => d.reason === 'rule_breaks'));
    assert.ok(r.kept.some((l) => l.verb_lemma === 'falar'));
    assert.ok(r.kept.some((l) => l.verb_lemma === 'chegar'));
  });

  it('never keeps model conjugations blob on kept lines', () => {
    const r = checkMicroLines(
      [
        line('Bom dia', 'صباح الخير', {
          conjugations: { eu: 'faloWRONG' },
        }),
      ],
      { layout: 'list' },
    );
    assert.equal(r.kept.length, 1);
    assert.equal('conjugations' in r.kept[0], false);
  });
});

describe('M2 · generateMicroClip', () => {
  const outline = loadMicroOutline();
  const series = outline.series.find((s) => s.slug === 'demonstratives')!;
  const clip = series.clips[0]!;

  it('authored clip makes no model call', async () => {
    let calls = 0;
    const callModel: ModelCaller = async () => {
      calls += 1;
      throw new Error('should not call');
    };
    const authoredClip = {
      ...clip,
      authored_lines: [
        line('este bolo', 'هذه الكعكة', {
          concept_en: 'cake',
          region_hint: 'cake in display',
        }),
        line('esta torta', 'هذه الفطيرة', {
          concept_en: 'pie',
          region_hint: 'pie on left',
        }),
        line('este café', 'هذا القهوة', {
          concept_en: 'coffee',
          region_hint: 'coffee cup',
        }),
        line('esta água', 'هذا الماء', {
          concept_en: 'water',
          region_hint: 'water bottle',
        }),
        line('este pão', 'هذا الخبز', {
          concept_en: 'bread',
          region_hint: 'bread basket',
        }),
        line('esta fruta', 'هذه الفاكهة', {
          concept_en: 'fruit',
          region_hint: 'fruit bowl',
        }),
      ],
    };
    const result = await generateMicroClip({
      series,
      clip: authoredClip,
      callModel,
      known: new Map(),
      memoryStore: new Map(),
    });
    assert.equal(calls, 0);
    assert.equal(result.authored, true);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.model_calls, 0);
  });

  it('5 good lines trigger exactly one top-up', async () => {
    let calls = 0;
    const callModel: ModelCaller = async ({ toolName }) => {
      calls += 1;
      if (toolName === 'submit_micro_clip') {
        return {
          data: {
            title_tl: 'TEST',
            title_ar: 'اختبار',
            lines: [
              line('linha um aqui', 'سطر واحد', { concept_en: 'a' }),
              line('linha dois aqui', 'سطر اثنين', { concept_en: 'b' }),
              line('linha tres aqui', 'سطر ثلاثة', { concept_en: 'c' }),
              line('linha quatro ja', 'سطر اربعة', { concept_en: 'd' }),
              line('linha cinco ja', 'سطر خمسة', { concept_en: 'e' }),
            ],
          },
          latency_ms: 1,
        };
      }
      return {
        data: {
          lines: [
            line('linha seis nova', 'سطر ستة', { concept_en: 'f' }),
            line('linha sete nova', 'سطر سبعة', { concept_en: 'g' }),
          ],
        },
        latency_ms: 1,
      };
    };
    const listClip = {
      ...clip,
      layout: 'list' as const,
      authored_lines: undefined,
    };
    const result = await generateMicroClip({
      series,
      clip: listClip,
      callModel,
      known: new Map(),
      memoryStore: new Map(),
    });
    assert.equal(calls, 2);
    assert.equal(result.top_up_called, true);
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.lines.length >= 6);
  });

  it('resolves to a lesson item id when the word exists', async () => {
    const known = new Map<string, Item>([
      [
        'food.cake',
        {
          id: 'food.cake',
          type: 'word',
          tl: 'o bolo',
          ar: 'الكعكة',
          gender: 'm',
        } as Item,
      ],
    ]);
    const authoredClip = {
      ...clip,
      layout: 'list' as const,
      authored_lines: [
        line('o bolo', 'الكعكة', { pos: 'noun', concept_en: 'cake' }),
        line('a mesa', 'الطاولة', { pos: 'noun', concept_en: 'table' }),
        line('a porta', 'الباب', { pos: 'noun', concept_en: 'door' }),
        line('a janela', 'النافذة', { pos: 'noun', concept_en: 'window' }),
        line('a cadeira', 'الكرسي', { pos: 'noun', concept_en: 'chair' }),
        line('a luz', 'النور', { pos: 'noun', concept_en: 'light' }),
      ],
    };
    const result = await generateMicroClip({
      series,
      clip: authoredClip,
      callModel: async () => {
        throw new Error('no');
      },
      known,
      memoryStore: new Map(),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const cake = result.lines.find((l) => l.tl === 'o bolo');
      assert.equal(cake?.item_id, 'food.cake');
    }
  });
});
