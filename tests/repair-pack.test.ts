import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repairStoryAids } from '../lib/generation/repairPack';
import { validatePack } from '../lib/generation/validator';

const lines = [
  'Olá!',
  'Como te chamas?',
  'De onde és?',
  'Trabalhas aqui?',
  'Tudo bem?',
  'Onde ficas?',
  'O que fazes?',
  'Até logo!',
];

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
          pt: lines[i],
          ar: 'أهلاً',
          arz: 'أَهْلاً',
          alt_pt: lines[i],
          alt_ar: 'أهلاً',
          alt_arz: 'أَهْلاً',
        },
        difficulty: i < 3 ? 'guided' : i < 6 ? 'supported' : 'open',
        coach_tip:
          i < 3
            ? { ar: 'قول Olá', arz: 'قول Olá' }
            : i < 6
              ? { ar: 'ابدأ بـ O', arz: 'اِبْدَأ بـ O' }
              : undefined,
        reaction_cue: 'glad; greets him warmly',
        kind: i >= 6 ? 'open' : 'known',
        accepted: i < 6 ? ['Olá'] : undefined,
        anticipated_wrong: [],
        frame: i < 6 ? 'Olá' : undefined,
        word_bank:
          i >= 3
            ? [
                { pt: 'olá', meaning: '' },
                { pt: 'bom', meaning: '' },
                { pt: 'dia', meaning: '' },
                { pt: 'eu', meaning: '' },
              ]
            : undefined,
        criterion: i >= 6 ? 'He greets her.' : undefined,
        guard: undefined,
        why_note: 'Olá',
      })),
      closing_hook: { pt: 'E tu, de onde és?', ar: 'وأنت؟', arz: 'وإِنْت؟' },
      assessment: [],
    };

    const words = ['olá', 'bom', 'dia', 'eu', 'trabalho'].map((text) => ({ text, note: '' }));
    assert.equal(repairStoryAids(pack, words), true);
    const open = pack.beats[7] as {
      frame?: string;
      guard?: string[];
      word_bank?: unknown[];
      hint_note?: string;
    };
    assert.equal(open.frame, 'Até …');
    assert.deepEqual(open.guard, ['até']);
    assert.equal((pack.beats[7] as { kind?: string }).kind, 'open');
    assert.ok((open.word_bank?.length ?? 0) >= 4);
    assert.ok((open.word_bank?.length ?? 0) <= 8);
    assert.ok(open.hint_note);

    const result = validatePack(pack, { allowedWords: words }) as {
      ok: boolean;
      errors: { message: string }[];
    };
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
      line: {
        pt: lines[i],
        ar: 'أهلاً',
        arz: 'أَهْلاً',
        alt_pt: lines[i],
        alt_ar: 'أهلاً',
        alt_arz: 'أَهْلاً',
      },
      difficulty: i === 3 ? 'guided' : i < 6 ? 'supported' : 'open',
      kind: 'known',
      accepted: i < 6 ? ['Olá'] : undefined,
      reaction_cue: 'She reacts.',
      coach_tip: { ar: 'قول', arz: 'قول' },
      frame: 'Olá …',
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
      closing_hook: { pt: 'E tu, de onde és?', ar: 'وأنت؟', arz: 'وأنت؟' },
      assessment: [],
    };
    repairStoryAids(pack, []);
    assert.equal(beats[3].difficulty, 'supported');
    // Authored kind is kept even when difficulty is open.
    assert.equal(beats[6].kind, 'known');
    assert.equal((beats[6] as { guard?: string[] }).guard, undefined);
    const messages = (validatePack(pack) as { errors: { message: string }[] }).errors.map((e) => e.message);
    assert.equal(messages.some((m) => m.includes('kind open')), false);
    assert.equal(messages.some((m) => m.includes('backwards')), false);
  });

  it('keeps kind known on open-difficulty beats with accepted answers', () => {
    const pack = {
      intro_ar: 'مقدمة',
      intro_arz: 'مقدمة',
      character: { name: 'Rita' },
      scenes: [
        { id: 's1', title_ar: 'أ' },
        { id: 's2', title_ar: 'ب' },
        { id: 's3', title_ar: 'ج' },
      ],
      beats: Array.from({ length: 8 }, (_, i) => ({
        id: `b0${i + 1}`,
        scene: i < 6 ? 's1' : 's3',
        speaker: i < 6 ? 'Rita' : 'Carlos',
        line: {
          pt: lines[i],
          ar: 'أهلاً',
          arz: 'أَهْلاً',
          alt_pt: lines[i],
          alt_ar: 'أهلاً',
          alt_arz: 'أَهْلاً',
        },
        difficulty: i < 3 ? 'guided' : i < 6 ? 'supported' : 'open',
        kind: 'known',
        accepted: ['Bom dia', 'bom dia', 'Bom dia!'],
        reaction_cue: 'She reacts.',
        coach_tip: i < 6 ? { ar: 'قول', arz: 'قول' } : { ar: '', arz: '' },
        frame: 'Bom …',
        word_bank: [
          { pt: 'bom', meaning: '' },
          { pt: 'dia', meaning: '' },
          { pt: 'olá', meaning: '' },
          { pt: 'eu', meaning: '' },
        ],
      })),
      closing_hook: { speaker: 'Carlos', pt: 'E tu?', ar: 'وأنت؟', arz: 'وأنت؟' },
      assessment: [],
    };
    repairStoryAids(pack, []);
    const openKnown = pack.beats[6] as { kind?: string; accepted?: string[]; criterion?: string };
    assert.equal(openKnown.kind, 'known');
    assert.ok(openKnown.accepted?.includes('Bom dia'));
    assert.equal(openKnown.criterion, undefined);
  });
});
