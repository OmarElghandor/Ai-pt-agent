import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repairStoryAids } from '../lib/generation/repairPack';
import { validatePack } from '../lib/generation/validator';

describe('repairStoryAids', () => {
  it('fills a missing open-beat frame and word bank so the structure check passes', () => {
    const pack = {
      intro_ar: 'مقدمة',
      intro_arz: 'مُقَدِّمَة',
      character: { name: 'Rita', role_ar: 'زميلة' },
      scenes: [
        { id: 's1', title_ar: 'أ' },
        { id: 's2', title_ar: 'ب' },
        { id: 's3', title_ar: 'ج' },
      ],
      beats: Array.from({ length: 8 }, (_, i) => ({
        id: `b0${i + 1}`,
        scene: i < 3 ? 's1' : i < 6 ? 's2' : 's3',
        speaker: 'Rita',
        line: {
          pt: 'Olá!',
          ar: 'أهلاً',
          arz: 'أَهْلاً',
          alt_pt: 'Oi!',
          alt_ar: 'أهلاً',
          alt_arz: 'أَهْلاً',
        },
        difficulty: i < 3 ? 'guided' : i < 6 ? 'supported' : 'open',
        coach_tip: i < 6 ? { ar: 'قول [Olá]', arz: 'قول [Olá]' } : undefined,
        reaction_cue: 'She greets him.',
        kind: 'known',
        accepted: i < 6 ? ['Olá'] : undefined,
        anticipated_wrong: [],
        frame: i < 6 ? 'Olá' : undefined,
        word_bank:
          i >= 3 && i < 6
            ? [
                { pt: 'olá', meaning: '' },
                { pt: 'bom', meaning: '' },
                { pt: 'dia', meaning: '' },
                { pt: 'eu', meaning: '' },
              ]
            : undefined,
        criterion: i >= 6 ? 'He greets her.' : undefined,
        guard: i >= 6 ? 'olá' : undefined,
        why_note: 'Olá',
      })),
      closing_hook: { pt: 'E tu?', ar: 'وأنت؟', arz: 'وإِنْت؟' },
      assessment: [],
    };

    const words = ['olá', 'bom', 'dia', 'eu', 'trabalho'].map((text) => ({ text, note: '' }));
    assert.equal(repairStoryAids(pack, words), true);
    const open = pack.beats[7] as { frame?: string; word_bank?: unknown[] };
    assert.equal(open.frame, '…');
    assert.equal((pack.beats[7] as { kind?: string }).kind, 'open');
    assert.ok((open.word_bank?.length ?? 0) >= 4);
    assert.ok((open.word_bank?.length ?? 0) <= 8);

    const result = validatePack(pack, { allowedWords: words }) as { ok: boolean; errors: { message: string }[] };
    assert.equal(
      result.errors.map((e) => e.message).join('; '),
      '',
    );
    assert.equal(result.ok, true);
  });

  it('lifts a difficulty that steps backwards and does not fail on the kind label', () => {
    const beats = Array.from({ length: 8 }, (_, i) => ({
      id: `b0${i + 1}`,
      scene: 's1',
      speaker: 'Rita',
      line: { pt: 'Olá!', ar: 'أهلاً', arz: 'أَهْلاً', alt_pt: 'Oi!', alt_ar: 'أهلاً', alt_arz: 'أَهْلاً' },
      difficulty: i === 3 ? 'guided' : i < 6 ? 'supported' : 'open',
      kind: 'known',
      accepted: ['Olá'],
      reaction_cue: 'She reacts.',
      coach_tip: { ar: 'قول', arz: 'قول' },
      frame: 'Olá',
      word_bank: [
        { pt: 'olá', meaning: '' },
        { pt: 'bom', meaning: '' },
        { pt: 'dia', meaning: '' },
        { pt: 'eu', meaning: '' },
      ],
    }));
    const pack = {
      intro_ar: 'مقدمة',
      intro_arz: 'مقدمة',
      character: { name: 'Rita' },
      scenes: [
        { id: 's1', title_ar: 'أ' },
        { id: 's2', title_ar: 'ب' },
        { id: 's3', title_ar: 'ج' },
      ],
      beats,
      closing_hook: { pt: 'E tu?', ar: 'وأنت؟', arz: 'وأنت؟' },
      assessment: [],
    };
    repairStoryAids(pack, []);
    assert.equal(beats[3].difficulty, 'supported');
    assert.equal(beats[6].kind, 'open');
    const messages = (validatePack(pack) as { errors: { message: string }[] }).errors.map((e) => e.message);
    assert.equal(messages.some((m) => m.includes('kind open')), false);
    assert.equal(messages.some((m) => m.includes('backwards')), false);
  });
});
