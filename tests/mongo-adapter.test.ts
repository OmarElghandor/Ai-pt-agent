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
          anticipated_wrong: [{ answer: 'Oi', verdict: 'near_miss', note: 'برازيلية' }],
          hint_note: 'تحية',
          why_note: 'رد التحية',
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
    assert.equal(pack!.beats[1].kind, 'known');
    if (pack!.beats[1].kind === 'known') {
      assert.ok(pack!.beats[1].acceptedAnswers.includes('Chamo-me [NAME].'));
      assert.equal(pack!.beats[1].hintNote, 'فكر في chamar');
    }
    assert.equal(pack!.closingHook.pt, 'E tu?');
    assert.equal(pack!.character.name, 'Rita');
    const shown = presentBeat(pack!, 0);
    assert.ok(shown.some((m) => m.type === 'narration'));
    assert.ok(shown.some((m) => m.type === 'character' && m.playablePt === 'Olá!'));
    assert.ok(shown.some((m) => m.type === 'coach'));
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
