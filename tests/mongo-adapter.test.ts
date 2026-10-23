import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adaptMongoPack } from '../lib/lessons/adaptMongoPack';
import { presentBeat } from '../lib/messages';

function storyPack(overrides: Record<string, unknown> = {}) {
  return adaptMongoPack({
    lesson_key: 'ps-01',
    cefr_level: 'A0',
    spec: { title_ar: 'تحية', target: 'says hello', situation_ar: 'الجار' },
    pack: {
      intro_ar: 'النهارده هتسلم على جارك.',
      intro_arz: 'النَّهَارْدَه هِتْسَلِّم عَلى جارَك.',
      character: { name: 'Rita', role_ar: 'جارة' },
      scenes: [
        { id: 's1', title_ar: 'الوصول' },
        { id: 's2', title_ar: 'التعرف' },
        { id: 's3', title_ar: 'الوداع' },
      ],
      beats: [
        {
          id: 'b01',
          scene: 's1',
          narration_ar: 'ريتا بتفتح الباب.',
          speaker: 'Rita',
          difficulty: 'guided',
          line: {
            pt: 'Olá!',
            ar: 'أهلاً!',
            arz: 'أَهْلاً!',
            alt_pt: 'Olá, tudo bem?',
            alt_ar: 'أهلاً، عامل إيه؟',
            alt_arz: 'أَهْلاً، عامِل إيه؟',
          },
          coach_tip: { ar: 'قول Olá', arz: 'قُول Olá' },
          frame: 'Olá …',
          reaction_cue: 'Rita smiles.',
          kind: 'known',
          accepted: ['Olá', 'Olá!'],
          anticipated_wrong: [
            {
              answer: 'Oi',
              verdict: 'near_miss',
              note: { ar: 'برازيلية', arz: 'بَرازِيلِيّة' },
            },
          ],
          hint_note: { ar: 'تحية', arz: 'تَحِيّة' },
          why_note: { ar: 'رد التحية', arz: 'رَدّ التَحِيّة' },
        },
        {
          id: 'b02',
          scene: 's2',
          speaker: 'Rita',
          difficulty: 'supported',
          line: { pt: 'Como te chamas?', ar: 'اسمك إيه؟', arz: 'اِسْمَك إيه؟', alt_pt: 'Como te chamas?', alt_ar: 'اسمك إيه؟', alt_arz: 'اِسْمَك إيه؟' },
          coach_tip: { ar: 'قدّم نفسك', arz: 'قَدِّم نَفْسَك' },
          reaction_cue: 'Rita is happy to meet him.',
          kind: 'known',
          accepted: ['Chamo-me [NAME].'],
          word_bank: [
            { pt: 'chamo-me', ar: 'اسمي' },
            { pt: 'eu', ar: 'أنا' },
            { pt: 'tu', ar: 'أنت' },
            { pt: 'olá', ar: 'أهلاً' },
          ],
          hint_note: 'فكر في chamar',
        },
      ],
      closing_hook: { pt: 'E tu?', ar: 'وإنت؟', arz: 'وإِنْت؟' },
      assessment: [
        {
          id: 'a1',
          target: 'تحية',
          kind: 'known',
          line: { pt: 'Olá!', ar: 'أهلاً!', arz: 'أَهْلاً!' },
          accepted: ['Olá!'],
          nudge_note: 'في حاجة تتظبط',
        },
      ],
      ...overrides,
    },
  });
}

describe('adaptMongoPack story packs', () => {
  it('maps beats, scenes, and the closing hook', () => {
    const pack = storyPack();
    assert.ok(pack);
    assert.equal(pack!.beats.length, 2);
    assert.equal(pack!.beats[0].line.pt, 'Olá!');
    assert.equal(pack!.beats[0].altLine.pt, 'Olá, tudo bem?');
    assert.equal(pack!.beats[0].difficulty, 'guided');
    assert.equal(pack!.beats[0].hintNote, 'تحية');
    assert.equal(pack!.beats[0].whyNote, 'رد التحية');
    if (pack!.beats[0].kind === 'known') {
      assert.equal(pack!.beats[0].anticipatedWrong[0]?.feedback[0]?.text, 'برازيلية');
    }
    assert.equal(pack!.beats[1].kind, 'known');
    if (pack!.beats[1].kind === 'known') {
      assert.ok(pack!.beats[1].acceptedAnswers.includes('Chamo-me [NAME].'));
      assert.equal(pack!.beats[1].hintNote, 'فكر في chamar');
    }
    assert.equal(pack!.closingHook.pt, 'E tu?');
    assert.equal(pack!.character.name, 'Rita');
    // Legacy packs omit scenes[].words — no card data.
    assert.equal(pack!.scenes[0].words, undefined);
    const shown = presentBeat(pack!, 0);
    assert.ok(shown.some((m) => m.type === 'narration'));
    assert.ok(shown.some((m) => m.type === 'character' && m.playablePt === 'Olá!'));
    assert.ok(shown.some((m) => m.type === 'coach'));
  });

  it('maps teach, info_card, summary and script translations from a v5 pack', () => {
    const pack = storyPack({
      script: [
        { scene: 's01', speaker: 'Rita', pt: 'Olá!', ar: 'أهلاً!', arz: 'أَهْلاً!' },
        { scene: 's01', speaker: 'EU', pt: 'Olá!', ar: 'أهلاً!', arz: 'أَهْلاً!' },
      ],
      summary: {
        words: [{ pt: 'o café', ar: 'القهوة' }],
        rules: [
          {
            pt: 'Quanto custa + الحاجة؟',
            ar: 'بتسأل عن السعر',
            example_pt: 'Quanto custa o chá?',
            example_ar: 'الشاي بكام؟',
          },
        ],
      },
      beats: [
        {
          id: 'b01',
          scene: 's1',
          narration_ar: 'ريتا بتفتح الباب.',
          speaker: 'Rita',
          difficulty: 'guided',
          line: {
            pt: 'Olá!',
            ar: 'أهلاً!',
            arz: 'أَهْلاً!',
            alt_pt: 'Olá, tudo bem?',
            alt_ar: 'أهلاً، عامل إيه؟',
            alt_arz: 'أَهْلاً، عامِل إيه؟',
          },
          reply: { pt: 'Olá!', ar: 'أهلاً!', arz: 'أَهْلاً!' },
          teach: {
            moment_ar: 'محتاج تسلّم.',
            rule_pt: 'Olá',
            rule_ar: 'أهلاً',
            example_pt: 'Olá, bom dia!',
            example_ar: 'أهلاً صباح الخير',
            ask_ar: 'جرّبها.',
          },
          info_card: {
            title_ar: 'تحية',
            rows: [{ pt: 'Olá!', ar: 'أهلاً!' }],
            note_ar: 'مش Oi',
          },
          coach_tip: { ar: 'جرّب', arz: 'جَرِّب' },
          frame: 'Olá …',
          reaction_cue: 'Rita smiles.',
          kind: 'known',
          accepted: ['Olá', 'Olá!'],
          anticipated_wrong: [],
          hint_note: { ar: 'تحية', arz: 'تَحِيّة' },
          why_note: { ar: 'رد التحية', arz: 'رَدّ التَحِيّة' },
        },
        {
          id: 'b02',
          scene: 's2',
          speaker: 'Rita',
          difficulty: 'supported',
          line: {
            pt: 'Como te chamas?',
            ar: 'اسمك إيه؟',
            arz: 'اِسْمَك إيه؟',
            alt_pt: 'Como te chamas?',
            alt_ar: 'اسمك إيه؟',
            alt_arz: 'اِسْمَك إيه؟',
          },
          reply: { pt: '', ar: '', arz: '' },
          teach: null,
          info_card: null,
          coach_tip: { ar: 'قدّم نفسك', arz: 'قَدِّم نَفْسَك' },
          reaction_cue: 'Rita is happy to meet him.',
          kind: 'known',
          accepted: ['Chamo-me [NAME].'],
          word_bank: [
            { pt: 'chamo-me', ar: 'اسمي' },
            { pt: 'eu', ar: 'أنا' },
            { pt: 'tu', ar: 'أنت' },
          ],
          hint_note: 'فكر في chamar',
        },
      ],
      assessment: [
        {
          id: 'a1',
          target: 'تحية',
          kind: 'known',
          line: { pt: '', ar: 'دخلت محل تاني وسلّم. هتقول إيه؟', arz: 'دَخَلْت مَحَل' },
          accepted: ['Olá!'],
          nudge_note: 'في حاجة تتظبط',
        },
      ],
    });
    assert.ok(pack);
    assert.equal(pack!.script?.[0].ar, 'أهلاً!');
    assert.equal(pack!.summary?.words[0].pt, 'o café');
    assert.equal(pack!.summary?.rules[0].examplePt, 'Quanto custa o chá?');
    assert.equal(pack!.beats[0].teach?.rulePt, 'Olá');
    assert.equal(pack!.beats[0].infoCard?.titleAr, 'تحية');
    assert.equal(pack!.beats[1].teach, undefined);
    assert.equal(pack!.beats[1].infoCard, undefined);
    assert.equal(pack!.assessmentTasks[0].line.pt, '');
    assert.match(pack!.assessmentTasks[0].line.ar, /دخلت/);
  });

  it('maps reply and script from a v4 pack', () => {
    const pack = storyPack({
      script: [
        { scene: 's01', speaker: 'Rita', pt: 'Olá!' },
        { scene: 's01', speaker: 'EU', pt: 'Olá!' },
        { scene: 's01', speaker: 'Rita', pt: 'Como te chamas?' },
      ],
      beats: [
        {
          id: 'b01',
          scene: 's1',
          narration_ar: 'ريتا بتفتح الباب.',
          speaker: 'Rita',
          difficulty: 'guided',
          line: {
            pt: 'Olá!',
            ar: 'أهلاً!',
            arz: 'أَهْلاً!',
            alt_pt: 'Olá, tudo bem?',
            alt_ar: 'أهلاً، عامل إيه؟',
            alt_arz: 'أَهْلاً، عامِل إيه؟',
          },
          reply: { pt: 'Olá!', ar: 'أهلاً!', arz: 'أَهْلاً!' },
          coach_tip: { ar: 'قول Olá', arz: 'قُول Olá' },
          frame: 'Olá …',
          reaction_cue: 'Rita smiles.',
          kind: 'known',
          accepted: ['Olá', 'Olá!'],
          anticipated_wrong: [],
          hint_note: { ar: 'تحية', arz: 'تَحِيّة' },
          why_note: { ar: 'رد التحية', arz: 'رَدّ التَحِيّة' },
        },
        {
          id: 'b02',
          scene: 's2',
          speaker: 'Rita',
          difficulty: 'supported',
          line: {
            pt: 'Como te chamas?',
            ar: 'اسمك إيه؟',
            arz: 'اِسْمَك إيه؟',
            alt_pt: 'Como te chamas?',
            alt_ar: 'اسمك إيه؟',
            alt_arz: 'اِسْمَك إيه؟',
          },
          reply: { pt: '', ar: '', arz: '' },
          coach_tip: { ar: 'قدّم نفسك', arz: 'قَدِّم نَفْسَك' },
          reaction_cue: 'Rita is happy to meet him.',
          kind: 'known',
          accepted: ['Chamo-me [NAME].'],
          word_bank: [
            { pt: 'chamo-me', ar: 'اسمي' },
            { pt: 'eu', ar: 'أنا' },
            { pt: 'tu', ar: 'أنت' },
          ],
          hint_note: 'فكر في chamar',
        },
      ],
    });
    assert.ok(pack);
    assert.equal(pack!.script?.length, 3);
    assert.equal(pack!.script?.[0].pt, 'Olá!');
    assert.equal(pack!.beats[0].reply?.pt, 'Olá!');
    assert.equal(pack!.beats[1].reply?.pt, '');
  });

  it('leaves reply undefined on legacy packs', () => {
    const pack = storyPack();
    assert.ok(pack);
    assert.equal(pack!.beats[0].reply, undefined);
    assert.equal(pack!.script, undefined);
  });

  it('maps scenes[].words snake_case into SceneWord', () => {
    const pack = storyPack({
      scenes: [
        {
          id: 's1',
          title_ar: 'الوصول',
          words: [
            { pt: 'Olá', ar: 'أهلاً', arz: 'أَهْلاً', emoji: '👋' },
            { pt: 'café', ar: 'قهوة', arz: 'قَهْوة', emoji: '☕' },
          ],
        },
        { id: 's2', title_ar: 'التعرف', words: [] },
        { id: 's3', title_ar: 'الوداع' },
      ],
    });
    assert.ok(pack);
    assert.equal(pack!.scenes[0].words?.length, 2);
    assert.equal(pack!.scenes[0].words?.[0].pt, 'Olá');
    assert.equal(pack!.scenes[0].words?.[0].emoji, '👋');
    // Empty words[] adapts to absent (no card), same as legacy omit.
    assert.equal(pack!.scenes[1].words, undefined);
    assert.equal(pack!.scenes[2].words, undefined);
  });

  it('maps grammar_card and line_explain when present', () => {
    const pack = storyPack({
      grammar_card: {
        rule_ar: 'بنقول queria عشان نطلب بأدب.',
        rule_arz: 'بِنْقول queria عَشان نِطْلُب بِأَدَب.',
        examples: [
          { pt: 'Queria um café.', ar: 'عايز قهوة.' },
          { pt: 'Queria água.', ar: 'عايز مية.' },
        ],
        contrast_ar: 'quero بتبان قاسية؛ queria ألطف.',
      },
      beats: [
        {
          id: 'b01',
          scene: 's1',
          narration_ar: 'ريتا بتفتح الباب.',
          speaker: 'Rita',
          difficulty: 'guided',
          line: {
            pt: 'O que querias beber?',
            ar: 'عايز تشرب إيه؟',
            arz: 'عايز تِشْرَب إيه؟',
            alt_pt: 'O que querias?',
            alt_ar: 'عايز إيه؟',
            alt_arz: 'عايز إيه؟',
          },
          coach_tip: { ar: 'لما حد يسألك عايز تشرب إيه، بنقول Queria …', arz: 'لَمّا حَد يِسْأَلَك' },
          frame: 'Queria …',
          reaction_cue: 'happy; repeats the drink',
          line_explain: {
            ar: 'بتسألك عايز تشرب إيه، يعني محتاج تقول مشروب.',
            arz: 'بِتِسْأَلَك عايز تِشْرَب إيه.',
          },
          word_bank: [
            { pt: 'café', ar: 'قهوة' },
            { pt: 'chá', ar: 'شاي' },
            { pt: 'água', ar: 'مية' },
          ],
          kind: 'known',
          accepted: ['Queria um café', 'Queria um chá'],
          anticipated_wrong: [],
          hint_note: { ar: 'ابدأ بـ Queria', arz: 'اِبْدَأ بـ Queria' },
          why_note: { ar: 'بنقول Queria عشان نطلب بأدب.', arz: 'بِنْقول Queria' },
        },
        {
          id: 'b02',
          scene: 's2',
          speaker: 'Rita',
          difficulty: 'supported',
          line: {
            pt: 'Como te chamas?',
            ar: 'اسمك إيه؟',
            arz: 'اِسْمَك إيه؟',
            alt_pt: 'Como te chamas?',
            alt_ar: 'اسمك إيه؟',
            alt_arz: 'اِسْمَك إيه؟',
          },
          coach_tip: { ar: 'قدّم نفسك', arz: 'قَدِّم نَفْسَك' },
          reaction_cue: 'Rita is happy to meet him.',
          kind: 'known',
          accepted: ['Chamo-me [NAME].'],
          word_bank: [
            { pt: 'chamo-me', ar: 'اسمي' },
            { pt: 'eu', ar: 'أنا' },
            { pt: 'tu', ar: 'أنت' },
            { pt: 'olá', ar: 'أهلاً' },
          ],
          hint_note: 'فكر في chamar',
        },
      ],
    });
    assert.ok(pack);
    assert.ok(pack!.grammarCard);
    assert.equal(pack!.grammarCard!.ruleAr.includes('queria'), true);
    assert.equal(pack!.grammarCard!.examples.length, 2);
    assert.ok(pack!.grammarCard!.contrastAr);
    assert.equal(pack!.beats[0].lineExplain?.ar.includes('بتسألك'), true);
    assert.equal(pack!.beats[0].wordBank?.length, 3);
    const tip = presentBeat(pack!, 0).find((m) => m.type === 'coach');
    assert.equal(tip?.showWhyChip, true);
  });

  it('keeps kind known when difficulty is open and accepted is present', () => {
    const pack = adaptMongoPack({
      lesson_key: 'pl-002',
      cefr_level: 'A0',
      spec: { title_ar: 'قهوة', target: 'orders coffee' },
      pack: {
        intro_ar: 'في الكافيه.',
        intro_arz: 'في الكافيه.',
        character: { name: 'Rita', role_ar: 'بائعة' },
        scenes: [
          { id: 's1', title_ar: 'أ' },
          { id: 's2', title_ar: 'ب' },
          { id: 's3', title_ar: 'ج' },
        ],
        beats: [
          {
            id: 'b01',
            scene: 's1',
            speaker: 'Rita',
            difficulty: 'guided',
            kind: 'known',
            line: { pt: 'Olá!', ar: 'أهلاً', arz: 'أهلاً', alt_pt: 'Olá!', alt_ar: 'أهلاً', alt_arz: 'أهلاً' },
            coach_tip: { ar: 'قول Olá', arz: 'قول Olá' },
            frame: 'Olá …',
            reaction_cue: 'greets',
            accepted: ['Olá'],
          },
          {
            id: 'b02',
            scene: 's3',
            speaker: 'Carlos',
            difficulty: 'open',
            kind: 'known',
            line: {
              pt: 'Bom dia!',
              ar: 'صباح الخير',
              arz: 'صباح الخير',
              alt_pt: 'Bom dia!',
              alt_ar: 'صباح الخير',
              alt_arz: 'صباح الخير',
            },
            reaction_cue: 'greets back',
            frame: 'Bom …',
            accepted: ['Bom dia', 'bom dia', 'Bom dia!'],
            word_bank: [
              { pt: 'bom', ar: '' },
              { pt: 'dia', ar: '' },
              { pt: 'olá', ar: '' },
              { pt: 'eu', ar: '' },
            ],
          },
        ],
        closing_hook: {
          speaker: 'Carlos',
          pt: 'Também queres açúcar?',
          ar: 'عايز سكر كمان؟',
          arz: 'عايز سكر كمان؟',
        },
        assessment: [],
      },
    });
    assert.ok(pack);
    assert.equal(pack!.beats[1].kind, 'known');
    if (pack!.beats[1].kind === 'known') {
      assert.ok(pack!.beats[1].acceptedAnswers.includes('Bom dia'));
      assert.ok(pack!.beats[1].acceptedAnswers.includes('bom dia'));
    }
    assert.equal(pack!.closingHook.speaker, 'Carlos');
  });

  it('returns null for a teach-step pack', () => {
    const pack = adaptMongoPack({
      lesson_key: 'old',
      pack: {
        teach_steps: [{ id: 't01', phrase_pt: 'Olá!' }],
        items: [{ id: 'p01', accepted: ['Olá'] }],
        assessment: [],
      },
    });
    assert.equal(pack, null);
  });

  it('returns null when the story has no beats', () => {
    const pack = adaptMongoPack({
      lesson_key: 'empty',
      pack: {
        intro_ar: 'مقدمة',
        character: { name: 'Rita', role_ar: 'جارة' },
        scenes: [{ id: 's1', title_ar: 'مشهد' }],
        beats: [],
        closing_hook: { pt: 'E tu?', ar: 'وإنت؟', arz: 'وإِنْت؟' },
      },
    });
    assert.equal(pack, null);
  });
});
