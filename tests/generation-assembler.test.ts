import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  assembleInputs,
  buildCumulativeAllowedWords,
  seedToPlanSlot,
} from '../lib/generation/inputAssembler';
import { validatePack } from '../lib/generation/validator';
import { loadSeedPlan } from '../lib/lessons/seedPlan';
import { loadNucleo, loadWordPriority, loadGrammarGrid } from '../lib/generation/wordData';

describe('generation token budgets', () => {
  it('lets pack generation use CLAUDE_MAX_TOKENS instead of a 32k override', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'lib/generation/runPipeline.ts'),
      'utf8',
    );
    assert.doesNotMatch(source, /maxTokens:\s*32_000/);
    assert.match(source, /maxTokens:\s*12_000/);
    assert.match(source, /maxTokens:\s*8_000/);
  });
});

describe('practice content files', () => {
  it('loads word-priority, nucleo, grammar grid', () => {
    const words = loadWordPriority();
    assert.ok((words.topics || []).length > 0);
    assert.ok(loadNucleo().length > 0);
    assert.ok(loadGrammarGrid().length > 0);
  });
});

describe('ALLOWED_WORDS tier rule', () => {
  it('pl-001 topic words in allowed list have priority 1 or 2', () => {
    const seed = loadSeedPlan();
    const slots = seed.map(seedToPlanSlot);
    const slot = slots.find((s) => s.lesson_key === 'pl-001');
    assert.ok(slot, 'pl-001 slot missing');
    const allowed = buildCumulativeAllowedWords(slot!, slots);
    for (const w of allowed.filter((x) => x.topic === slot!.topic)) {
      assert.ok(w.priority === 1 || w.priority === 2, `${w.text} priority ${w.priority}`);
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

  function storyPack(over: Record<string, unknown> = {}) {
    const beats = Array.from({ length: 8 }, (_, i) => ({
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
      frame: 'Olá …',
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
      guard: i >= 6 ? ['olá'] : undefined,
      hint_note: i >= 6 ? 'فكّر في التحية' : undefined,
      why_note: 'Olá',
    }));
    return {
      intro_ar: 'مقدمة',
      intro_arz: 'مُقَدِّمَة',
      character: { name: 'Rita', role_ar: 'زميلة' },
      scenes: [
        { id: 's1', title_ar: 'أ' },
        { id: 's2', title_ar: 'ب' },
        { id: 's3', title_ar: 'ج' },
      ],
      beats,
      closing_hook: { pt: 'E tu, de onde és?', ar: 'وأنت؟', arz: 'وإِنْت؟' },
      farewell: { pt: 'Adeus!', ar: 'مع السلامة', arz: 'مَع السَلامة' },
      assessment: [],
      ...over,
    };
  }

  it('hard-fails when there are no beats', () => {
    const result = validatePack(
      { teach_steps: [], assessment: [] },
      { allowedWords: [], nucleus: [] },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e: { code: string }) => e.code === 'no_beats'));
  });

  it('hard-fails on empty accepted and unknown scene id', () => {
    const pack = storyPack();
    (pack.beats[0] as { accepted: string[] }).accepted = [];
    (pack.beats[1] as { scene: string }).scene = 's99';
    const result = validatePack(pack, {
      allowedWords: ['olá', 'bom', 'dia', 'eu'].map((text) => ({ text })),
      nucleus: [],
    });
    assert.equal(result.ok, false);
    const codes = new Set(result.errors.map((e: { code: string }) => e.code));
    assert.ok(codes.has('empty_accepted'), JSON.stringify(result.errors));
    assert.ok(codes.has('missing_scene'), JSON.stringify(result.errors));
  });

  it('accepts a short pack (no beat-count hard limit)', () => {
    const pack = storyPack();
    pack.beats = pack.beats.slice(0, 4);
    const result = validatePack(pack, {
      allowedWords: ['olá', 'bom', 'dia', 'eu'].map((text) => ({ text })),
      nucleus: [],
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  it('warns on tip leaks, bad guards, duplicates without blocking', () => {
    const pack = storyPack();
    (pack.beats[7] as { guard?: string[] }).guard = [];
    delete (pack.beats[6] as { hint_note?: string }).hint_note;
    (pack.beats[6] as { accepted: string[] }).accepted = ['Chamo-me [NAME]'];
    (pack.beats[0] as { reaction_cue: string }).reaction_cue = 'asks him where he works then invites him';
    (pack.beats[3] as { coach_tip: { ar: string }; accepted: string[] }).coach_tip = {
      ar: 'قول Olá كاملة',
    };
    (pack.beats[3] as { accepted: string[] }).accepted = ['Olá'];
    (pack.beats[4] as { line: { pt: string } }).line.pt = 'Como te chamas?';
    (pack.beats[4] as { line: { alt_pt: string } }).line.alt_pt = 'Como te chamas?';
    (pack.closing_hook as { pt: string }).pt = 'De onde és?';

    const result = validatePack(pack, {
      allowedWords: ['olá', 'bom', 'dia', 'eu'].map((text) => ({ text })),
      nucleus: [],
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const codes = new Set(result.warnings.map((e: { code: string }) => e.code));
    assert.ok(codes.has('empty_guard'), JSON.stringify(result.warnings));
    assert.ok(codes.has('missing_hint_note'), JSON.stringify(result.warnings));
    assert.ok(codes.has('open_with_slot'), JSON.stringify(result.warnings));
    assert.ok(codes.has('reaction_cue_shape'), JSON.stringify(result.warnings));
    assert.ok(codes.has('supported_tip_leak'), JSON.stringify(result.warnings));
    assert.ok(codes.has('duplicate_question'), JSON.stringify(result.warnings));
    assert.ok(codes.has('closing_matches_beat'), JSON.stringify(result.warnings));
  });

  it('warns on open guard that is not exactly one word in the frame', () => {
    const pack = storyPack();
    (pack.beats[6] as { guard: string[] }).guard = ['olá', 'bom'];
    (pack.beats[7] as { guard: string[] }).guard = ['trabalho'];
    const result = validatePack(pack, {
      allowedWords: ['olá', 'bom', 'dia', 'eu'].map((text) => ({ text })),
      nucleus: [],
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const badGuards = result.warnings.filter((e: { code: string }) => e.code === 'bad_guard');
    assert.ok(badGuards.length >= 2, JSON.stringify(result.warnings));
  });

  it('warns on out-of-scope words, not whole phrases', () => {
    const pack = storyPack();
    (pack.beats[0] as { accepted: string[] }).accepted = ['Olá amigo'];
    const result = validatePack(pack, {
      allowedWords: [{ text: 'Olá!' }, { text: 'Bom dia' }],
      nucleus: ['eu'],
    });
    assert.ok(
      result.warnings.some(
        (w: { code: string; message?: string }) =>
          w.code === 'word_scope' && /amigo/i.test(w.message || ''),
      ),
      JSON.stringify(result.warnings),
    );
    assert.equal(
      result.warnings.some(
        (w: { message?: string }) => /Olá amigo/i.test(w.message || ''),
      ),
      false,
    );
  });

  it('soft-warns on scene word counts, s03 words, duplicates, and missing arz', () => {
    const pack = storyPack();
    (pack.scenes[0] as { words?: unknown[] }).words = [
      { pt: 'Olá', ar: 'أهلاً' },
      { pt: 'café', ar: 'قهوة', arz: 'قَهْوة' },
    ];
    (pack.scenes[1] as { words?: unknown[] }).words = [
      { pt: 'Olá', ar: 'أهلاً', arz: 'أَهْلاً' },
      { pt: 'eu', ar: 'أنا', arz: 'أَنا' },
      { pt: 'tu', ar: 'أنت', arz: 'إِنْت' },
    ];
    (pack.scenes[2] as { words?: unknown[] }).words = [
      { pt: 'adeus', ar: 'وداعاً', arz: 'وَداعاً' },
    ];
    const result = validatePack(pack, {
      allowedWords: ['olá', 'bom', 'dia', 'eu', 'tu', 'café'].map((text) => ({ text })),
      nucleus: [],
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const codes = new Set(result.warnings.map((e: { code: string }) => e.code));
    assert.ok(codes.has('missing_scene_words'), JSON.stringify(result.warnings));
    assert.ok(codes.has('scene_words_on_s03'), JSON.stringify(result.warnings));
    assert.ok(codes.has('scene_word_duplicate'), JSON.stringify(result.warnings));
    assert.ok(codes.has('missing_scene_word_arz'), JSON.stringify(result.warnings));
  });
});
